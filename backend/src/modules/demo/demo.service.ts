// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { LoginResponseDto } from '../auth/dto/auth.dto';
import { UserContextService } from '../auth/user-context.service';
import {
  inspectDemoDatabase,
  keyFingerprint,
  prepareDemoSchema,
  readDemoState,
  truncateDemoData,
} from './demo-database';
import { dueReset, nextResetAfter, type ResetReason } from './demo-schedule';
import { seedDemoActivity } from './seed/demo-activity';
import { DEMO_ORG_CODE, seedDemoCompany } from './seed/demo-company';

/** The three accounts behind the one-click sign-in, by the email the seed gives them. */
export const DEMO_ACCOUNTS = {
  employee: 'dev1@cwork.example',
  manager: 'eng.manager@cwork.example',
  hr: 'hr.manager@cwork.example',
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

export const DEMO_ROLES = Object.keys(DEMO_ACCOUNTS) as DemoRole[];

/** An account as the last reset left it, which is what the sign-in puts back. */
interface DemoAccount {
  userId: string;
  organizationId: string;
  grants: { id: string; roleId: string; departmentId: string | null; expiresAt: Date | null }[];
}

export interface DemoStatus {
  /** True while the data is being put back; every other request is answered 503. */
  resetting: boolean;
  /** The top of the hour the banner counts down to. */
  nextResetAt: string;
  roles: DemoRole[];
}

/** How often the schedule is looked at. The reset itself is on the hour. */
const TICK_MS = 30_000;
/** A reset that failed is tried again after this long, with the demo closed meanwhile. */
const RETRY_MS = 60_000;

/**
 * The public demo (CW-031): one-click sign-in for three shared accounts, and
 * the data put back to the demo seed on a schedule nobody has to run.
 *
 * Only ever part of the application when `DEMO_MODE=true` (see DemoModule), and
 * even then it will not open a database the demo did not create
 * (`inspectDemoDatabase`). The reset runs in this process, on the services the
 * running application already has: the free instance the demo lives on has a
 * tenth of a CPU, and booting a second application to seed would take minutes
 * where this takes seconds (docs/demo.md has the measurements).
 */
@Injectable()
export class DemoService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Demo');

  private resetting = false;
  private running: Promise<void> | null = null;
  private retryAt: number | null = null;
  private resetOnBoot: ResetReason | null = null;

  private nextResetAt = nextResetAfter(new Date());
  private lastRequestAt = new Date();
  private seededAt: Date | null = null;
  private dirty = false;
  private inFlight = 0;

  private accounts = new Map<DemoRole, DemoAccount>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: RootConfig,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly userContext: UserContextService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Before the application finishes booting, and so before it listens: refuse
   * a database that is not the demo's, and decide whether it needs seeding.
   */
  async onModuleInit(): Promise<void> {
    if (!this.config.demo.enabled) {
      throw new Error('DemoModule is loaded but DEMO_MODE is off — refusing to start half a demo');
    }

    const database = await inspectDemoDatabase(this.prisma);
    await prepareDemoSchema(this.prisma);

    if (database === 'empty') {
      this.resetOnBoot = 'first boot';
    } else {
      const state = await readDemoState(this.prisma);
      this.seededAt = state.seededAt;
      if (!state.seededAt || state.dirtySince) {
        this.resetOnBoot = 'boot';
      } else if (state.keyFingerprint !== this.keyFingerprint()) {
        this.resetOnBoot = 'new key';
      } else if (!(await this.loadAccounts())) {
        this.resetOnBoot = 'boot';
      }
    }

    // Closed before the first request can arrive, so nobody signs in to a
    // database that is about to be emptied.
    if (this.resetOnBoot) this.resetting = true;
  }

  onApplicationBootstrap(): void {
    // Not awaited: the application listens meanwhile, and a visitor who arrives
    // during the reset is told so rather than kept waiting on a blank page.
    if (this.resetOnBoot) void this.reset(this.resetOnBoot);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopSchedule();
    await this.running?.catch(() => undefined);
  }

  /** Stops the clock. The e2e suite drives resets itself. */
  stopSchedule(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): DemoStatus {
    return {
      resetting: this.resetting,
      nextResetAt: this.nextResetAt.toISOString(),
      roles: DEMO_ROLES,
    };
  }

  isResetting(): boolean {
    return this.resetting;
  }

  /** Called for every API request that reaches the application. */
  requestStarted(write: boolean): () => void {
    this.lastRequestAt = new Date();
    this.inFlight += 1;
    if (write) this.markDirty();

    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.inFlight -= 1;
    };
  }

  /**
   * The one-click sign-in.
   *
   * Puts back whatever about the account a visitor could have changed that
   * would keep the next visitor out — deactivation, a deleted employee record,
   * roles, the lockout — and only then opens the session. Refusing every route
   * that could do those things would be a list that goes stale as the console
   * grows; restoring the account at the door cannot.
   */
  async signIn(role: DemoRole): Promise<LoginResponseDto> {
    let account = this.accounts.get(role);
    if (!account) {
      await this.loadAccounts();
      account = this.accounts.get(role);
    }
    if (!account) throw new Error(`The demo has no ${role} account — was the seed changed?`);

    await this.restore(account);
    return this.auth.openDemoSession(account.userId, account.organizationId);
  }

  /** Puts the demo back to the seed. Concurrent calls share one reset. */
  reset(reason: ResetReason): Promise<void> {
    if (this.running) return this.running;

    this.resetting = true;
    this.running = this.performReset(reason)
      .then(() => {
        this.retryAt = null;
        this.resetting = false;
      })
      .catch((error: unknown) => {
        // Stays closed: a half-seeded demo is worse than a message saying it
        // is being prepared. The schedule tries again shortly.
        this.retryAt = Date.now() + RETRY_MS;
        this.logger.error(
          `Demo reset (${reason}) failed; trying again in ${RETRY_MS / 1000}s — ${String(error)}`,
        );
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async tick(): Promise<void> {
    if (this.running) return;

    if (this.retryAt !== null) {
      if (Date.now() >= this.retryAt) await this.reset('boot');
      return;
    }

    const now = new Date();
    const reason = dueReset({
      now,
      nextResetAt: this.nextResetAt,
      dirty: this.dirty,
      lastRequestAt: this.lastRequestAt,
      seededAt: this.seededAt,
      timeZone: this.config.app.defaults.timezone,
    });
    if (now.getTime() >= this.nextResetAt.getTime()) this.nextResetAt = nextResetAfter(now);
    if (reason) await this.reset(reason);
  }

  private async performReset(reason: ResetReason): Promise<void> {
    const started = Date.now();
    await this.waitForQuiet(10_000);

    await this.prisma.$transaction(
      async (tx) => {
        // Checked again inside the transaction that empties it: whatever was
        // true at boot, nothing is truncated unless it is still the demo's.
        await inspectDemoDatabase(tx);
        await truncateDemoData(tx);
      },
      { timeout: 60_000 },
    );

    // Generated here, used once to hash, and never kept: nobody signs in to the
    // demo with a password, so nobody needs to know it.
    await seedDemoCompany(this.prisma, {
      password: randomBytes(32).toString('base64url'),
      encryptionKey: this.config.security.fieldEncryptionKey,
      log: (line) => this.logger.debug(line.trim()),
    });
    await seedDemoActivity(
      { get: (type) => this.moduleRef.get(type, { strict: false }) },
      { log: (line) => this.logger.debug(line), warn: (line) => this.logger.warn(line) },
    );

    await this.prisma.$executeRaw`
      UPDATE cwork_demo.state
      SET seeded_at = now(), dirty_since = NULL, key_fingerprint = ${this.keyFingerprint()}
      WHERE id
    `;
    this.userContext.invalidateAll();
    this.accounts.clear();
    if (!(await this.loadAccounts())) {
      throw new Error('The demo seed ran but one of the one-click accounts is missing');
    }

    this.dirty = false;
    this.seededAt = new Date();
    this.nextResetAt = nextResetAfter(new Date());
    this.logger.log(
      `Demo data reset (${reason}) in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  }

  private keyFingerprint(): string {
    return keyFingerprint(this.config.security.fieldEncryptionKey);
  }

  /** Lets requests already inside the application finish before the tables go. */
  private async waitForQuiet(limitMs: number): Promise<void> {
    const until = Date.now() + limitMs;
    while (this.inFlight > 0 && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private markDirty(): void {
    if (this.dirty || this.resetting) return;
    this.dirty = true;
    // Remembered in the database too, so an instance that stops before its
    // idle reset puts the data back when it next boots.
    this.prisma.$executeRaw`
      UPDATE cwork_demo.state SET dirty_since = now() WHERE id AND dirty_since IS NULL
    `.catch((error: unknown) => this.logger.warn(`Could not record a change: ${String(error)}`));
  }

  /** Finds the three accounts and remembers their roles as the seed left them. */
  private async loadAccounts(): Promise<boolean> {
    const users = await this.prisma.user.findMany({
      where: {
        email: { in: Object.values(DEMO_ACCOUNTS) },
        organization: { code: DEMO_ORG_CODE },
      },
      select: {
        id: true,
        email: true,
        organizationId: true,
        roles: { select: { id: true, roleId: true, departmentId: true, expiresAt: true } },
      },
    });

    for (const role of DEMO_ROLES) {
      const user = users.find((u) => u.email === DEMO_ACCOUNTS[role]);
      if (!user) return false;
      this.accounts.set(role, {
        userId: user.id,
        organizationId: user.organizationId,
        grants: user.roles,
      });
    }
    return true;
  }

  private async restore(account: DemoAccount): Promise<void> {
    const grantIds = account.grants.map((g) => g.id);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: account.userId },
        data: {
          status: UserStatus.ACTIVE,
          deletedAt: null,
          lockedUntil: null,
          failedLoginCount: 0,
        },
      }),
      this.prisma.employee.updateMany({
        where: { userId: account.userId, deletedAt: { not: null } },
        data: { deletedAt: null },
      }),
      this.prisma.userRole.deleteMany({
        where: { userId: account.userId, id: { notIn: grantIds } },
      }),
      ...account.grants.map((grant) =>
        this.prisma.userRole.upsert({
          where: { id: grant.id },
          create: { ...grant, userId: account.userId },
          update: {
            roleId: grant.roleId,
            departmentId: grant.departmentId,
            expiresAt: grant.expiresAt,
          },
        }),
      ),
    ]);

    this.userContext.invalidate(account.userId);
  }
}
