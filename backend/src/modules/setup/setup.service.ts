import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuditAction, Prisma, UserStatus } from '@prisma/client';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { BusinessRuleError, ConflictError } from '../../core/errors/domain.errors';
import { ADVISORY_LOCKS, ADVISORY_LOCK_NAMESPACE } from '../../core/prisma/advisory-lock';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/security/crypto.service';
import { SYSTEM_ROLE_DEFINITIONS, SystemRole } from '../../core/security/roles';
import { assertPasswordPolicy } from '../auth/password.policy';
import {
  ORGANIZATION_CODE_PATTERN,
  ORGANIZATION_CODE_RULE,
  isKnownTimezone,
} from './domain/organization-code';
import { SETUP_TOKEN_BYTES, classifySetupToken, setupTokenExpiry } from './domain/setup-token';

export interface SetupStatus {
  /** Whether this install already has an organisation. */
  initialised: boolean;
}

export interface IssuedSetupToken {
  token: string;
  expiresAt: Date;
}

export interface FirstRunInput {
  organizationName: string;
  organizationCode: string;
  timezone: string;
  adminEmail: string;
  adminPassword: string;
}

export interface FirstRunResult {
  organization: { id: string; code: string; name: string; timezone: string };
  administrator: { id: string; email: string; role: string };
  rolesCreated: number;
}

/**
 * First-run setup: turning an empty database into one that somebody can sign
 * into.
 *
 * Two doors lead here and they are deliberately not equal. `npm run db:init`
 * runs on the server, so having started it is already proof of being the
 * operator, and it may call `initialise` outright. The web wizard has no such
 * proof, so it must present a token that only `db:init` can mint. There is no
 * third door — in particular there is no "if no organisation exists, let anyone
 * through", which would hand every fresh deployment to whichever stranger
 * reached it first.
 *
 * Everything below refuses once an organisation exists. That is the whole
 * lifetime of this module: it is reachable exactly once per install.
 */
@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) private readonly config: RootConfig,
  ) {}

  async status(): Promise<SetupStatus> {
    return { initialised: await this.isInitialised() };
  }

  /**
   * Counts soft-deleted organisations too. A deleted organisation still owns
   * users, audit rows and payslips; letting setup run again beside it would
   * produce a second tenant in a schema that has never been asked to hold two.
   */
  async isInitialised(): Promise<boolean> {
    const existing = await this.prisma.organization.findFirst({ select: { id: true } });
    return existing !== null;
  }

  /**
   * Mints a token for the web wizard. Called by the CLI only — there is no HTTP
   * route to this, and adding one would defeat the point of the token.
   */
  async issueToken(): Promise<IssuedSetupToken> {
    await this.refuseIfInitialised();

    const token = this.crypto.generateToken(SETUP_TOKEN_BYTES);
    const expiresAt = setupTokenExpiry(new Date());

    await this.prisma.setupToken.create({
      data: { tokenHash: this.crypto.hashToken(token), expiresAt },
    });

    return { token, expiresAt };
  }

  /**
   * Creates the organisation, the system role set and the first administrator.
   *
   * `token` is required for anything that arrived over HTTP and omitted by the
   * CLI. Both paths converge on the same transaction, so the wizard cannot
   * produce an install the CLI would not have.
   */
  async initialise(rawInput: FirstRunInput, token?: string): Promise<FirstRunResult> {
    // Normalise once, up front, so validation and the writes below are looking
    // at the same values. A pasted timezone arrives with a space on it more
    // often than not, and "Asia/Bangkok " is a typo to absorb, not to refuse.
    const input: FirstRunInput = {
      organizationName: rawInput.organizationName.trim(),
      organizationCode: rawInput.organizationCode.trim().toUpperCase(),
      timezone: rawInput.timezone.trim(),
      adminEmail: rawInput.adminEmail.trim().toLowerCase(),
      adminPassword: rawInput.adminPassword,
    };

    this.validate(input);
    await this.refuseIfInitialised();

    const passwordHash = await this.crypto.hashPassword(input.adminPassword);
    const tokenHash = token ? this.crypto.hashToken(token) : null;

    return this.prisma.$transaction(async (tx) => {
      // Two wizards posting at the same instant would each see an empty
      // database and each create an organisation. The lock makes the loser wait
      // its turn and then fail the re-check below, rather than quietly
      // installing a second administrator nobody knows about.
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(
          ${ADVISORY_LOCK_NAMESPACE}::int,
          ${ADVISORY_LOCKS['first-run-setup']}::int
        ) AS locked
      `;
      if (!locked) {
        throw new ConflictError(
          'SETUP_IN_PROGRESS',
          'Another setup is already running. Wait for it to finish and reload.',
        );
      }

      if (await tx.organization.findFirst({ select: { id: true } })) {
        throw new ConflictError(
          'ALREADY_INITIALISED',
          'This installation already has an organisation. Setup can only run once.',
        );
      }

      if (tokenHash !== null) {
        await this.spendToken(tx, tokenHash, input.adminEmail);
      }

      const organization = await tx.organization.create({
        data: {
          code: input.organizationCode,
          name: input.organizationName,
          timezone: input.timezone,
        },
        select: { id: true, code: true, name: true, timezone: true },
      });

      await tx.role.createMany({
        data: SYSTEM_ROLE_DEFINITIONS.map((definition) => ({
          organizationId: organization.id,
          key: definition.key,
          name: definition.name,
          description: definition.description,
          permissions: definition.permissions,
          isSystem: true,
        })),
      });

      const superAdmin = await tx.role.findFirstOrThrow({
        where: { organizationId: organization.id, key: SystemRole.SUPER_ADMIN },
        select: { id: true },
      });

      const now = new Date();
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: input.adminEmail,
          passwordHash,
          status: UserStatus.ACTIVE,
          // The person typing this owns the server; there is nobody else to
          // verify the address to, and no mail is configured yet.
          emailVerifiedAt: now,
          passwordChangedAt: now,
          /**
           * `sessionsValidFrom` marks the instant a forced sign-out invalidated
           * every token issued before it — and for an account being created,
           * there has not been one. Recorded at whole-second resolution because
           * that is all an access token's `iat` can express, which is the honest
           * version of "nothing has been invalidated yet".
           *
           * The guard no longer depends on this: `tokenPredatesInvalidation`
           * compares the two clocks at the resolution they share, so a
           * millisecond timestamp here would be handled correctly too. Kept
           * because storing a precision the claim cannot carry only invites the
           * same confusion back.
           */
          sessionsValidFrom: new Date(Math.floor(now.getTime() / 1000) * 1000),
          roles: { create: { roleId: superAdmin.id } },
        },
        select: { id: true, email: true },
      });

      // The install's first audit row, written in the same transaction as the
      // thing it describes: an install either has both or neither.
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: user.id,
          action: AuditAction.CREATE,
          entityType: 'Organization',
          entityId: organization.id,
          summary: `First-run setup created ${organization.name} and its first administrator`,
        },
      });

      this.logger.log(
        `First-run setup complete: ${organization.code} · administrator ${user.email}`,
      );

      return {
        organization,
        administrator: { id: user.id, email: user.email, role: SystemRole.SUPER_ADMIN },
        rolesCreated: SYSTEM_ROLE_DEFINITIONS.length,
      };
    });
  }

  /**
   * Marks a token spent, or refuses.
   *
   * The update is conditional on `usedAt` still being null, so two requests
   * carrying the same token cannot both pass: one writes the row, the other
   * matches nothing and is turned away.
   */
  private async spendToken(
    tx: Prisma.TransactionClient,
    tokenHash: string,
    usedBy: string,
  ): Promise<void> {
    const record = await tx.setupToken.findUnique({
      where: { tokenHash },
      select: { expiresAt: true, usedAt: true },
    });

    const verdict = classifySetupToken(record, new Date());
    if (verdict !== 'valid') {
      // One message for all three rejections. Which guess was close is not
      // something an attacker gets to learn.
      this.logger.warn(`Setup token rejected: ${verdict}`);
      throw new UnauthorizedException('Setup token is not valid.');
    }

    const spent = await tx.setupToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: new Date(), usedBy },
    });
    if (spent.count !== 1) {
      throw new UnauthorizedException('Setup token is not valid.');
    }
  }

  private async refuseIfInitialised(): Promise<void> {
    if (await this.isInitialised()) {
      throw new ConflictError(
        'ALREADY_INITIALISED',
        'This installation already has an organisation. Setup can only run once.',
      );
    }
  }

  private validate(input: FirstRunInput): void {
    const problems: string[] = [];

    if (input.organizationName.length < 2) {
      problems.push('Organisation name is too short');
    }
    if (!ORGANIZATION_CODE_PATTERN.test(input.organizationCode)) {
      problems.push(`Organisation code is not valid. ${ORGANIZATION_CODE_RULE}`);
    }
    if (!isKnownTimezone(input.timezone)) {
      problems.push(`"${input.timezone}" is not a timezone this server knows`);
    }
    if (problems.length > 0) {
      throw new BusinessRuleError('INVALID_SETUP', problems.join('; '), { problems });
    }

    // Deliberately last: the first administrator holds every permission there
    // is, so its password is held to the same policy as everybody else's.
    assertPasswordPolicy({
      password: input.adminPassword,
      minLength: this.config.auth.passwordMinLength,
      email: input.adminEmail,
    });
  }
}
