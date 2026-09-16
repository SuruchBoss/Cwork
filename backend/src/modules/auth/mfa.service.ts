import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, type User } from '@prisma/client';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { BusinessRuleError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/security/crypto.service';
import { Permission, type PermissionKey } from '../../core/security/permissions';
import { AuditService } from '../audit/audit.service';
import {
  buildOtpauthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  normaliseRecoveryCode,
  verifyTotp,
} from './domain/totp';
import { UserContextService } from './user-context.service';

/**
 * Permissions that make an account worth stealing. Anyone holding one of these
 * must carry a second factor: between them they read every national ID in the
 * organisation, move money, and hand out permissions.
 */
export const MFA_REQUIRED_PERMISSIONS: PermissionKey[] = [
  Permission.EMPLOYEE_READ_SENSITIVE,
  Permission.PAYROLL_RUN,
  Permission.PAYROLL_APPROVE,
  Permission.ROLE_MANAGE,
];

/** Claim marking a token as a half-finished sign-in rather than a session. */
export const MFA_CHALLENGE_TOKEN_TYPE = 'mfa_challenge';

export interface MfaChallengePayload {
  sub: string;
  org: string;
  typ: typeof MFA_CHALLENGE_TOKEN_TYPE;
  /** Whether the holder still has to enrol, or merely to present a code. */
  enrolled: boolean;
}

export interface MfaRequirement {
  /** True when this account may not hold a session without a second factor. */
  required: boolean;
  /** True once a secret has been activated. */
  enrolled: boolean;
}

export interface MfaStatus extends MfaRequirement {
  enrolledAt: string | null;
  recoveryCodesRemaining: number;
}

export interface MfaEnrolmentOffer {
  secret: string;
  otpauthUri: string;
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: RootConfig,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
    private readonly userContext: UserContextService,
    private readonly audit: AuditService,
  ) {}

  // --------------------------------------------------------------- requirement

  /**
   * Whether this account needs a second factor, and whether it has one.
   *
   * Two things can make it required: holding a privileged permission, or the
   * organisation turning it on for everyone.
   */
  async requirementFor(userId: string): Promise<MfaRequirement> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, organizationId: true },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    const context = await this.userContext.resolve(userId);
    const privileged = MFA_REQUIRED_PERMISSIONS.some((p) => context.permissions.includes(p));

    return {
      required: privileged || (await this.organisationRequiresMfa(user.organizationId)),
      enrolled: user.mfaEnabled,
    };
  }

  async statusFor(userId: string): Promise<MfaStatus> {
    const [requirement, user] = await Promise.all([
      this.requirementFor(userId),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { mfaEnrolledAt: true, mfaRecoveryCodes: true },
      }),
    ]);

    return {
      ...requirement,
      enrolledAt: user.mfaEnrolledAt?.toISOString() ?? null,
      recoveryCodesRemaining: user.mfaRecoveryCodes.length,
    };
  }

  /** `settings.security.requireMfa` on the organisation, defaulting to off. */
  private async organisationRequiresMfa(organizationId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = (org?.settings ?? {}) as { security?: { requireMfa?: unknown } };
    return settings.security?.requireMfa === true;
  }

  // ----------------------------------------------------------------- enrolment

  /**
   * Starts enrolment: a fresh secret, stored encrypted but **not** yet active.
   *
   * Returned in the clear exactly once, because the user has to type it into an
   * authenticator app. It does not become a second factor until `activate`
   * proves they can produce a code from it — storing an activated secret the
   * user never scanned is how you lock someone out of their own account.
   */
  async beginEnrolment(userId: string): Promise<MfaEnrolmentOffer> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, mfaEnabled: true, organization: { select: { name: true } } },
    });

    if (user.mfaEnabled) {
      throw new BusinessRuleError(
        'MFA_ALREADY_ENROLLED',
        'Two-factor authentication is already set up. Disable it first to enrol a new device.',
      );
    }

    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEnc: this.crypto.encrypt(secret), mfaLastUsedStep: null },
    });

    return {
      secret,
      otpauthUri: buildOtpauthUri({
        secretBase32: secret,
        accountName: user.email,
        issuer: user.organization.name,
      }),
    };
  }

  /**
   * Activates the pending secret once the user proves they hold it, and issues
   * the recovery codes.
   *
   * The codes are returned here and never again: only their digests are kept.
   */
  async activate(
    userId: string,
    code: string,
    meta: AuditMeta,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        organizationId: true,
        mfaEnabled: true,
        mfaSecretEnc: true,
        mfaLastUsedStep: true,
      },
    });

    if (user.mfaEnabled) {
      throw new BusinessRuleError(
        'MFA_ALREADY_ENROLLED',
        'Two-factor authentication is already on.',
      );
    }
    const secret = this.crypto.decrypt(user.mfaSecretEnc);
    if (!secret) {
      throw new BusinessRuleError('MFA_NOT_STARTED', 'Start enrolment before confirming a code.');
    }

    const result = verifyTotp({
      secretBase32: secret,
      code,
      atMs: Date.now(),
      lastUsedStep: user.mfaLastUsedStep,
    });
    if (!result.valid) {
      await this.recordAudit(userId, user.organizationId, 'MFA enrolment code rejected', meta);
      throw new BusinessRuleError('MFA_CODE_INVALID', 'That code is not right. Try the next one.');
    }

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaEnrolledAt: new Date(),
        mfaLastUsedStep: result.step,
        mfaRecoveryCodes: recoveryCodes.map((c) => this.hashRecoveryCode(c)),
      },
    });

    await this.recordAudit(userId, user.organizationId, 'Two-factor authentication enabled', meta);
    return { recoveryCodes };
  }

  /**
   * Turns the second factor off, which needs a current code — otherwise anyone
   * holding a stolen session could simply remove it.
   *
   * Refused outright for an account that is required to have one.
   */
  async disable(userId: string, code: string, meta: AuditMeta): Promise<void> {
    const requirement = await this.requirementFor(userId);
    if (!requirement.enrolled) {
      throw new BusinessRuleError('MFA_NOT_ENROLLED', 'Two-factor authentication is not on.');
    }
    if (requirement.required) {
      throw new BusinessRuleError(
        'MFA_MANDATORY',
        'This account holds privileges that require two-factor authentication. ' +
          'Remove those permissions first, or enrol a different device.',
      );
    }

    const accepted = await this.consumeFactor(userId, code);
    if (!accepted) {
      throw new BusinessRuleError('MFA_CODE_INVALID', 'That code is not right.');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecretEnc: null,
        mfaEnrolledAt: null,
        mfaLastUsedStep: null,
        mfaRecoveryCodes: [],
      },
      select: { organizationId: true },
    });

    await this.recordAudit(userId, user.organizationId, 'Two-factor authentication disabled', meta);
  }

  /** Replaces the recovery codes, invalidating whatever was printed before. */
  async regenerateRecoveryCodes(
    userId: string,
    code: string,
    meta: AuditMeta,
  ): Promise<{ recoveryCodes: string[] }> {
    const accepted = await this.consumeFactor(userId, code);
    if (!accepted) {
      throw new BusinessRuleError('MFA_CODE_INVALID', 'That code is not right.');
    }

    const recoveryCodes = generateRecoveryCodes();
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { mfaRecoveryCodes: recoveryCodes.map((c) => this.hashRecoveryCode(c)) },
      select: { organizationId: true },
    });

    await this.recordAudit(userId, user.organizationId, 'Recovery codes regenerated', meta);
    return { recoveryCodes };
  }

  // ----------------------------------------------------------------- challenge

  /**
   * The token handed out after a correct password but before a second factor.
   *
   * It carries a `typ` the access-token strategy refuses, so it opens nothing
   * except the MFA endpoints. Signed with the access secret and short-lived.
   */
  async issueChallengeToken(
    userId: string,
    organizationId: string,
    enrolled: boolean,
  ): Promise<{ challengeToken: string; expiresIn: number }> {
    const payload: MfaChallengePayload = {
      sub: userId,
      org: organizationId,
      typ: MFA_CHALLENGE_TOKEN_TYPE,
      enrolled,
    };

    const challengeToken = await this.jwt.signAsync(payload, {
      secret: this.config.auth.accessSecret,
      expiresIn: this.config.auth.mfaChallengeTtlSeconds,
      issuer: this.config.auth.issuer,
      audience: this.config.auth.audience,
    });

    return { challengeToken, expiresIn: this.config.auth.mfaChallengeTtlSeconds };
  }

  /**
   * Verifies a full access token the same way the passport strategy does, for
   * the enrolment endpoints that accept either a session or a challenge.
   *
   * Refuses anything carrying a `typ`, so a challenge token cannot be passed
   * off as a session here either.
   */
  async verifyAccessToken(token: string): Promise<string> {
    let payload: { sub: string; org: string; sid?: string; typ?: string; iat: number };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.auth.accessSecret,
        issuer: this.config.auth.issuer,
        audience: this.config.auth.audience,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.typ || !payload.sid) {
      throw new UnauthorizedException('This token cannot be used to access resources');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { sessionsValidFrom: true },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    if (payload.iat * 1000 < user.sessionsValidFrom.getTime()) {
      throw new UnauthorizedException('Session has been invalidated, please sign in again');
    }
    return payload.sub;
  }

  async verifyChallengeToken(token: string): Promise<MfaChallengePayload> {
    let payload: MfaChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<MfaChallengePayload>(token, {
        secret: this.config.auth.accessSecret,
        issuer: this.config.auth.issuer,
        audience: this.config.auth.audience,
      });
    } catch {
      throw new UnauthorizedException('Sign-in has expired. Start again.');
    }

    if (payload.typ !== MFA_CHALLENGE_TOKEN_TYPE) {
      throw new UnauthorizedException('Wrong kind of token for this step');
    }
    return payload;
  }

  /**
   * Accepts a TOTP code or an unused recovery code, spending whichever matched.
   *
   * Returns false rather than throwing so callers can decide whether a failure
   * counts towards the lockout.
   */
  async consumeFactor(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaSecretEnc: true, mfaLastUsedStep: true, mfaRecoveryCodes: true },
    });

    const secret = this.crypto.decrypt(user.mfaSecretEnc);
    if (secret) {
      const result = verifyTotp({
        secretBase32: secret,
        code,
        atMs: Date.now(),
        lastUsedStep: user.mfaLastUsedStep,
      });
      if (result.valid) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { mfaLastUsedStep: result.step },
        });
        return true;
      }
      if (result.reason === 'replayed') {
        // Worth saying out loud: the code was right but already spent, which is
        // what a relayed or shoulder-surfed code looks like.
        this.logger.warn(`Replayed TOTP code rejected for user ${userId}`);
        return false;
      }
    }

    return this.consumeRecoveryCode(userId, code, user.mfaRecoveryCodes);
  }

  /** Single-use by construction: the digest is removed as it is spent. */
  private async consumeRecoveryCode(
    userId: string,
    code: string,
    storedDigests: string[],
  ): Promise<boolean> {
    const candidate = normaliseRecoveryCode(code);
    if (candidate.length < 16) return false;

    const digest = this.hashRecoveryCode(candidate);
    const match = storedDigests.find((stored) => this.crypto.safeEquals(stored, digest));
    if (!match) return false;

    const { count } = await this.prisma.user.updateMany({
      // The digest must still be present: two requests racing with the same
      // code means only the one that finds it there wins.
      where: { id: userId, mfaRecoveryCodes: { has: match } },
      data: { mfaRecoveryCodes: storedDigests.filter((stored) => stored !== match) },
    });
    return count === 1;
  }

  /**
   * Recovery codes carry 100 bits of entropy, so a slow KDF buys nothing over a
   * digest and only adds a way to burn CPU on a half-authenticated endpoint.
   * Refresh tokens are treated the same way for the same reason.
   */
  private hashRecoveryCode(code: string): string {
    return this.crypto.hashToken(normaliseRecoveryCode(code));
  }

  private async recordAudit(
    userId: string,
    organizationId: string,
    summary: string,
    meta: AuditMeta,
  ): Promise<void> {
    await this.audit.record({
      organizationId,
      actorUserId: userId,
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: userId,
      summary,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }
}

export interface AuditMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/** Narrow view of a user the login flow needs before deciding on a challenge. */
export type MfaRelevantUser = Pick<User, 'id' | 'organizationId' | 'mfaEnabled'>;
