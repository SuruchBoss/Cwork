// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { HttpException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { BusinessRuleError, DomainError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/security/crypto.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { MetricsService } from '../../core/telemetry/metrics.service';
import { TelemetryLogger } from '../../core/telemetry/telemetry-logger';
import { AuditService } from '../audit/audit.service';
import type {
  AuthTokensDto,
  ChangePasswordDto,
  LoginDto,
  LoginResponseDto,
  MfaActivateResponseDto,
  MfaChallengeResponseDto,
  MfaVerifyDto,
  SessionUserDto,
} from './dto/auth.dto';
import { MfaService } from './mfa.service';
import { assertPasswordPolicy } from './password.policy';
import { UserContextService } from './user-context.service';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/** The catalogue event for a refused sign-in (telemetry contract v1.1). */
export const SIGN_IN_FAILED_EVENT = 'auth.sign_in.failed';

/** Where in a sign-in a refusal happened, for the line that records it. */
type SignInStep = 'password' | 'second factor' | 'enrolment';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: RootConfig,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly userContext: UserContextService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly telemetry: TelemetryLogger,
    private readonly metrics: MetricsService,
  ) {}

  async login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<LoginResponseDto | MfaChallengeResponseDto> {
    return this.recordingRefusal('password', meta, this.attemptLogin(dto, meta));
  }

  private async attemptLogin(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<LoginResponseDto | MfaChallengeResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      include: {
        employee: { select: { id: true, firstNameTh: true, lastNameTh: true, photoFileId: true } },
      },
    });

    // Always burn roughly the same time whether or not the account exists, so
    // response timing does not reveal which emails are registered.
    if (!user || !user.passwordHash) {
      await this.crypto.hashPassword(dto.password);
      throw new UnauthorizedException('Invalid email or password');
    }

    assertNotLocked(user.lockedUntil);

    const valid = await this.crypto.verifyPassword(user.passwordHash, dto.password);
    if (!valid) {
      await this.registerFailedAttempt(user.id, user.failedLoginCount, user.organizationId, meta);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    // The failed-attempt count is deliberately left alone here: a correct
    // password that still owes a second factor is not a completed sign-in, and
    // clearing it now would undo the count that wrong codes add to. It is
    // cleared in `completeLogin`, when a session is actually issued.

    // A correct password is not a session when the account owes a second
    // factor. Hand back a challenge instead — an account that is *required* to
    // have MFA but has not enrolled gets one too, so it can enrol before it can
    // do anything else.
    const mfa = await this.mfa.requirementFor(user.id);
    if (mfa.enrolled || mfa.required) {
      const challenge = await this.mfa.issueChallengeToken(
        user.id,
        user.organizationId,
        mfa.enrolled,
      );
      return {
        mfaRequired: true,
        mfaEnrolled: mfa.enrolled,
        ...challenge,
      };
    }

    return this.completeLogin(user.id, user.organizationId, dto, meta);
  }

  /**
   * Issues the session and records the sign-in. Reached straight from `login`,
   * or — for an account with a second factor — from `verifyMfa` or
   * `activateMfaAndSignIn`, only after a code has been verified.
   *
   * This is the one place a sign-in completes, so it is the one place the
   * failed-attempt count is cleared.
   */
  private async completeLogin(
    userId: string,
    organizationId: string,
    device: { deviceId?: string; deviceName?: string; platform?: string },
    meta: RequestMeta,
    summarySuffix = '',
  ): Promise<LoginResponseDto> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(userId, organizationId, {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform,
      ...meta,
    });

    await this.audit.record({
      organizationId,
      actorUserId: userId,
      action: AuditAction.LOGIN,
      entityType: 'User',
      entityId: userId,
      summary: `Signed in from ${device.platform ?? 'web'}${summarySuffix}`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { mfaRequired: false, ...tokens, user: await this.buildSessionUser(userId) };
  }

  /**
   * Second half of a sign-in: exchange a challenge token plus a code for a
   * real session.
   *
   * A wrong code counts towards the same lockout a wrong password does —
   * otherwise the second factor is brute-forceable at leisure once the password
   * is known.
   */
  async verifyMfa(dto: MfaVerifyDto, meta: RequestMeta): Promise<LoginResponseDto> {
    return this.recordingRefusal('second factor', meta, this.attemptVerifyMfa(dto, meta));
  }

  private async attemptVerifyMfa(dto: MfaVerifyDto, meta: RequestMeta): Promise<LoginResponseDto> {
    const payload = await this.mfa.verifyChallengeToken(dto.challengeToken);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        organizationId: true,
        status: true,
        mfaEnabled: true,
        failedLoginCount: true,
        lockedUntil: true,
      },
    });
    if (!user || user.organizationId !== payload.org) {
      throw new UnauthorizedException('Sign-in has expired. Start again.');
    }
    assertNotLocked(user.lockedUntil);
    if (!user.mfaEnabled) {
      // The account still has to enrol; a code cannot exist yet.
      throw new BusinessRuleError(
        'MFA_ENROLMENT_REQUIRED',
        'Set up two-factor authentication to finish signing in.',
      );
    }

    const accepted = await this.mfa.consumeFactor(user.id, dto.code);
    if (!accepted) {
      await this.registerFailedAttempt(user.id, user.failedLoginCount, user.organizationId, meta);
      throw new UnauthorizedException('That code is not right');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    return this.completeLogin(user.id, user.organizationId, dto, meta, ' with a second factor');
  }

  /**
   * Finishes a sign-in for an account that had to enrol a second factor first:
   * activates the factor and issues the session in the same request.
   *
   * The session answers the code that activation has just verified — that event,
   * not the account's enrolled *state*, is what earns it. A separate "exchange
   * the challenge for a session once enrolled" step could not tell an account
   * that enrolled a moment ago from one that enrolled last year, and would have
   * to accept the challenge token alone for both. An account that was already
   * enrolled when it signed in has a code to give, and signs in through
   * `verifyMfa` like everyone else.
   */
  async activateMfaAndSignIn(
    challengeToken: string,
    dto: { code: string; deviceId?: string; deviceName?: string; platform?: string },
    meta: RequestMeta,
  ): Promise<MfaActivateResponseDto> {
    return this.recordingRefusal(
      'enrolment',
      meta,
      this.attemptActivation(challengeToken, dto, meta),
    );
  }

  private async attemptActivation(
    challengeToken: string,
    dto: { code: string; deviceId?: string; deviceName?: string; platform?: string },
    meta: RequestMeta,
  ): Promise<MfaActivateResponseDto> {
    const payload = await this.mfa.verifyChallengeToken(challengeToken);
    if (payload.enrolled) {
      throw new BusinessRuleError(
        'MFA_ALREADY_ENROLLED',
        'Two-factor authentication is already on. Sign in with a code from your app.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, organizationId: true, status: true, lockedUntil: true },
    });
    if (!user || user.organizationId !== payload.org) {
      throw new UnauthorizedException('Sign-in has expired. Start again.');
    }
    assertNotLocked(user.lockedUntil);
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    // Throws unless the code is right, and refuses an account already enrolled.
    const { recoveryCodes } = await this.mfa.activate(user.id, dto.code, meta);

    const session = await this.completeLogin(
      user.id,
      user.organizationId,
      dto,
      meta,
      ' after MFA enrolment',
    );
    return { recoveryCodes, session };
  }

  /**
   * Refresh-token rotation with reuse detection. Presenting a token that has
   * already been rotated means it leaked, so the whole family is revoked and the
   * user must sign in again.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokensDto> {
    let payload: { sub: string; org: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.auth.refreshSecret,
        issuer: this.config.auth.issuer,
        audience: this.config.auth.audience,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.crypto.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });

    if (!session) throw new UnauthorizedException('Invalid or expired refresh token');

    if (session.revokedAt || session.rotatedToId) {
      this.logger.warn(`Refresh token reuse detected for session family ${session.familyId}`);
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'TOKEN_REUSE_DETECTED' },
      });
      throw new UnauthorizedException('Session revoked, please sign in again');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const tokens = await this.issueTokens(payload.sub, payload.org, {
      familyId: session.familyId,
      deviceId: session.deviceId ?? undefined,
      deviceName: session.deviceName ?? undefined,
      platform: session.platform ?? undefined,
      ...meta,
    });

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        rotatedToId: tokens.sessionId,
        lastUsedAt: new Date(),
        revokedAt: new Date(),
        revokedReason: 'ROTATED',
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: tokens.tokenType,
    };
  }

  async logout(
    refreshToken: string | undefined,
    user: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.crypto.hashToken(refreshToken);
      await this.prisma.session.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
      });
    } else {
      await this.prisma.session.updateMany({
        where: { userId: user.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'LOGOUT_ALL' },
      });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.LOGOUT,
      entityType: 'User',
      entityId: user.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  async changePassword(
    user: AuthenticatedUser,
    dto: ChangePasswordDto,
    meta: RequestMeta,
  ): Promise<void> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      include: { employee: { select: { employeeCode: true } } },
    });
    if (!record?.passwordHash) throw new NotFoundError('User', user.userId);

    const valid = await this.crypto.verifyPassword(record.passwordHash, dto.currentPassword);
    if (!valid)
      throw new BusinessRuleError('INVALID_CURRENT_PASSWORD', 'Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BusinessRuleError(
        'PASSWORD_UNCHANGED',
        'New password must differ from the current one',
      );
    }

    assertPasswordPolicy({
      password: dto.newPassword,
      minLength: this.config.auth.passwordMinLength,
      email: record.email,
      employeeCode: record.employee?.employeeCode,
    });

    const passwordHash = await this.crypto.hashPassword(dto.newPassword);

    // Changing a password signs every other device out.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.userId },
        data: { passwordHash, passwordChangedAt: new Date(), sessionsValidFrom: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: user.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'PASSWORD_CHANGED' },
      }),
    ]);

    this.userContext.invalidate(user.userId);

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: user.userId,
      summary: 'Password changed',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  async listSessions(user: AuthenticatedUser) {
    return this.prisma.session.findMany({
      where: { userId: user.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceName: true,
        platform: true,
        ipAddress: true,
        issuedAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async revokeSession(user: AuthenticatedUser, sessionId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId: user.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'REVOKED_BY_USER' },
    });
    if (result.count === 0) throw new NotFoundError('Session', sessionId);
  }

  async buildSessionUser(userId: string): Promise<SessionUserDto> {
    const context = await this.userContext.resolve(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        locale: true,
        employee: {
          select: { firstNameTh: true, lastNameTh: true, nickname: true, photoFileId: true },
        },
      },
    });

    const employee = user.employee;
    const displayName = employee
      ? [employee.firstNameTh, employee.lastNameTh].filter(Boolean).join(' ')
      : null;

    return {
      id: context.userId,
      email: context.email,
      organizationId: context.organizationId,
      employeeId: context.employeeId,
      displayName,
      roles: context.roles,
      permissions: context.permissions,
      locale: user.locale,
      photoUrl: employee?.photoFileId ? `/api/files/${employee.photoFileId}/content` : null,
    };
  }

  /**
   * Awaits one step of a sign-in and, when the step refuses, says so: one
   * `auth.sign_in.failed` line and one count on `auth_sign_in_failures_total`.
   *
   * Wrapped around the three entry points rather than written at each `throw`,
   * because a refusal can come from anywhere below them — an expired
   * challenge, a locked account, a wrong code inside `MfaService` — and one
   * that went unrecorded would be the one an investigator needed. A server
   * failure (5xx) is not a refusal and is not counted as one.
   *
   * The line names the step and the reason the caller was given, never the
   * email, the password, the code or the account: the audit log already ties a
   * refusal to an account, for the people entitled to see that.
   */
  private async recordingRefusal<T>(
    step: SignInStep,
    meta: RequestMeta,
    attempt: Promise<T>,
  ): Promise<T> {
    try {
      return await attempt;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        const reason = error instanceof DomainError ? error.code : error.message;
        this.telemetry.write({
          severity: 'WARNING',
          event: SIGN_IN_FAILED_EVENT,
          message: `Sign-in refused at the ${step} step: ${reason}`,
          correlationId: meta.requestId,
        });
        this.metrics.countSignInFailure();
      }
      throw error;
    }
  }

  private async registerFailedAttempt(
    userId: string,
    currentCount: number,
    organizationId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const attempts = currentCount + 1;
    const shouldLock = attempts >= this.config.auth.maxFailedAttempts;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + this.config.auth.lockoutMinutes * 60_000)
          : null,
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId: userId,
      action: AuditAction.LOGIN_FAILED,
      entityType: 'User',
      entityId: userId,
      summary: shouldLock
        ? `Account locked after ${attempts} failed attempts`
        : `Failed attempt ${attempts}`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  private async issueTokens(
    userId: string,
    organizationId: string,
    options: RequestMeta & {
      familyId?: string;
      deviceId?: string;
      deviceName?: string;
      platform?: string;
    },
  ): Promise<AuthTokensDto & { sessionId: string }> {
    const sessionId = randomUUID();
    const familyId = options.familyId ?? randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: userId, org: organizationId, sid: sessionId },
      {
        secret: this.config.auth.accessSecret,
        expiresIn: this.config.auth.accessTtlSeconds,
        issuer: this.config.auth.issuer,
        audience: this.config.auth.audience,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, org: organizationId, sid: sessionId },
      {
        secret: this.config.auth.refreshSecret,
        expiresIn: this.config.auth.refreshTtlSeconds,
        issuer: this.config.auth.issuer,
        audience: this.config.auth.audience,
      },
    );

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: this.crypto.hashToken(refreshToken),
        familyId,
        deviceId: options.deviceId,
        deviceName: options.deviceName,
        platform: options.platform,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent?.slice(0, 500),
        expiresAt: new Date(Date.now() + this.config.auth.refreshTtlSeconds * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.auth.accessTtlSeconds,
      tokenType: 'Bearer',
      sessionId,
    };
  }
}

/** Refuses every step of a sign-in while the account is locked out. */
function assertNotLocked(lockedUntil: Date | null): void {
  if (lockedUntil && lockedUntil > new Date()) {
    throw new BusinessRuleError('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.', {
      lockedUntil: lockedUntil.toISOString(),
    });
  }
}
