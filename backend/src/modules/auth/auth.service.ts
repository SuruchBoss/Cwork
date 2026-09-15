import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from '../../core/config/config.module';
import type { RootConfig } from '../../core/config/configuration';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/security/crypto.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { AuditService } from '../audit/audit.service';
import type {
  AuthTokensDto,
  ChangePasswordDto,
  LoginDto,
  LoginResponseDto,
  SessionUserDto,
} from './dto/auth.dto';
import { assertPasswordPolicy } from './password.policy';
import { UserContextService } from './user-context.service';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

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
  ) {}

  async login(dto: LoginDto, meta: RequestMeta): Promise<LoginResponseDto> {
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

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new BusinessRuleError('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.', {
        lockedUntil: user.lockedUntil.toISOString(),
      });
    }

    const valid = await this.crypto.verifyPassword(user.passwordHash, dto.password);
    if (!valid) {
      await this.registerFailedAttempt(user.id, user.failedLoginCount, user.organizationId, meta);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, user.organizationId, {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
      platform: dto.platform,
      ...meta,
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: AuditAction.LOGIN,
      entityType: 'User',
      entityId: user.id,
      summary: `Signed in from ${dto.platform ?? 'web'}`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { ...tokens, user: await this.buildSessionUser(user.id) };
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
