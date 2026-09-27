// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The public demo (CW-031).
 *
 * Two promises are tested here, and the ticket's acceptance names both. Demo
 * mode will not open a database the demo did not create — it refuses, and
 * changes nothing. And on its own database, nothing a visitor does can keep the
 * next visitor out: after each route that could, all three one-click sign-ins
 * still work.
 *
 * **This spec truncates the database and reseeds it afterwards**, like
 * setup.e2e-spec.ts: the demo builds itself on an empty database, and the only
 * honest way to test that is to give it one. Everything runs `--runInBand`, so
 * the base demo company is back before the next spec opens.
 */
import { PrismaClient, UserStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { AuthService } from 'src/modules/auth/auth.service';
import { inspectDemoDatabase } from 'src/modules/demo/demo-database';
import { DemoModule } from 'src/modules/demo/demo.module';
import {
  DEMO_ACCOUNTS,
  DEMO_ROLES,
  DemoService,
  type DemoRole,
} from 'src/modules/demo/demo.service';
import { resolveDatabaseUrl, seedDemoCompany, truncateAll } from './utils/database';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const DEMO_ENV = { DEMO_MODE: 'true' };

/** The role each one-click account must still hold after whatever a visitor did. */
const EXPECTED_ROLE: Record<DemoRole, string> = {
  employee: 'EMPLOYEE',
  manager: 'MANAGER',
  hr: 'HR_ADMIN',
};

async function withClient<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** The marker the demo leaves on a database it created — gone, for a clean start. */
async function dropDemoMarker(): Promise<void> {
  await withClient((prisma) =>
    prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS cwork_demo CASCADE'),
  );
}

describe('Public demo (e2e)', () => {
  describe('on a database it did not create', () => {
    afterAll(async () => {
      await withClient((prisma) => prisma.organization.deleteMany({ where: { code: 'ACME' } }));
    });

    it('refuses to start beside a real organisation, and changes nothing', async () => {
      const before = await withClient(async (prisma) => {
        await prisma.organization.create({
          data: { code: 'ACME', name: 'บริษัท แอคมี จำกัด', timezone: 'Asia/Bangkok' },
        });
        return {
          organizations: await prisma.organization.count(),
          employees: await prisma.employee.count(),
          users: await prisma.user.count(),
          leave: await prisma.leaveRequest.count(),
        };
      });

      await expect(createTestApp({ env: DEMO_ENV, imports: [DemoModule] })).rejects.toThrow(
        /holds "บริษัท แอคมี จำกัด" \(ACME\), which the demo did not create/,
      );

      await withClient(async (prisma) => {
        expect(await prisma.organization.count()).toBe(before.organizations);
        expect(await prisma.employee.count()).toBe(before.employees);
        expect(await prisma.user.count()).toBe(before.users);
        expect(await prisma.leaveRequest.count()).toBe(before.leave);
        // Not even its own marker: the refusal comes before anything is written.
        const [marker] = await prisma.$queryRaw<{ present: boolean }[]>`
          SELECT to_regnamespace('cwork_demo') IS NOT NULL AS "present"
        `;
        expect(marker.present).toBe(false);
      });
    });

    it("refuses the demo seed's own company too, when the demo did not make the database", async () => {
      // `npm run db:seed` creates the same organisation code. The demo still
      // cannot tell that database from somebody's evaluation install with real
      // edits in it, so the marker — not the code — is what it trusts.
      await withClient((prisma) => prisma.organization.deleteMany({ where: { code: 'ACME' } }));

      await withClient(async (prisma) => {
        await expect(inspectDemoDatabase(prisma)).rejects.toThrow(/which the demo did not create/);
      });
    });

    it('does not exist at all when DEMO_MODE is off', async () => {
      const ctx = await createTestApp();
      try {
        const signIn = await ctx.api.post('/demo/sign-in', undefined, { as: 'hr' });
        expect(signIn.status).toBe(404);
        expect((await ctx.api.get('/config')).body.demo).toBe(false);

        // And the credential-less session behind it refuses outright.
        await expect(ctx.app.get(AuthService).openDemoSession('any', 'any')).rejects.toThrow(
          /DEMO_MODE is off/,
        );
      } finally {
        await ctx.close();
      }
    });
  });

  describe('on its own database', () => {
    let ctx: TestContext;
    let api: Api;
    let demo: DemoService;
    let prisma: PrismaService;

    /** Polls the public status until the demo has finished putting itself back. */
    const settled = async (): Promise<void> => {
      const until = Date.now() + 120_000;
      while (Date.now() < until) {
        const status = await api.get('/demo');
        if (status.status === 200 && status.body.resetting === false) return;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error('the demo never finished resetting');
    };

    const signIn = async (role: DemoRole): Promise<string> => {
      const res = await api.post('/demo/sign-in', undefined, { as: role });
      if (res.status !== 200) {
        throw new Error(`one-click sign-in as ${role}: ${res.status} ${JSON.stringify(res.body)}`);
      }
      return res.body.accessToken as string;
    };

    /** The acceptance, restated: every one-click sign-in still opens a working session. */
    const expectEveryoneCanSignIn = async (): Promise<void> => {
      for (const role of DEMO_ROLES) {
        const token = await signIn(role);
        const me = await api.get('/auth/me', token);
        expect(me.status).toBe(200);
        expect(me.body.email).toBe(DEMO_ACCOUNTS[role]);
        expect(me.body.roles).toContain(EXPECTED_ROLE[role]);
      }
    };

    const userIdOf = async (role: DemoRole): Promise<string> =>
      (await prisma.user.findFirstOrThrow({ where: { email: DEMO_ACCOUNTS[role] } })).id;

    beforeAll(async () => {
      await truncateAll();
      await dropDemoMarker();

      ctx = await createTestApp({ env: DEMO_ENV, imports: [DemoModule] });
      api = ctx.api;
      demo = ctx.app.get(DemoService);
      prisma = ctx.app.get(PrismaService);
      // The suite decides when resets happen; the clock must not.
      demo.stopSchedule();
      await settled();
    });

    afterAll(async () => {
      await ctx.close();
      await truncateAll();
      await dropDemoMarker();
      seedDemoCompany(undefined, { quiet: true });
    });

    it('seeds an empty database by itself and says when it next resets', async () => {
      const res = await api.get('/demo');

      expect(res.status).toBe(200);
      expect(res.body.resetting).toBe(false);
      expect(res.body.roles).toEqual(['employee', 'manager', 'hr']);
      const next = new Date(res.body.nextResetAt);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60_000);
      expect((await api.get('/config')).body.demo).toBe(true);
    });

    it('signs each role in with one click, and no password or code', async () => {
      await expectEveryoneCanSignIn();
    });

    it('leaves the manager a leave request to approve', async () => {
      const token = await signIn('manager');
      const tasks = await api.get('/approvals/tasks?status=PENDING', token);
      const leave = (tasks.body.data ?? tasks.body).find(
        (task: { instance?: { entityType?: string } }) =>
          task.instance?.entityType === 'LEAVE_REQUEST',
      );
      expect(leave).toBeDefined();

      const decided = await api.post(`/approvals/tasks/${leave.id}/decide`, token, {
        decision: 'APPROVE',
        comment: 'อนุมัติจาก demo',
      });
      expect(decided.status).toBeLessThan(300);
    });

    it('keeps visitors’ addresses out of everything the next visitor could read', async () => {
      // Every sign-in so far came from this test's address, and each wrote an
      // audit entry and a session. None may carry it.
      const withAddress = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT (SELECT count(*) FROM audit_logs WHERE "ipAddress" IS NOT NULL OR "userAgent" IS NOT NULL)
             + (SELECT count(*) FROM sessions WHERE "ipAddress" IS NOT NULL OR "userAgent" IS NOT NULL)
          AS n
      `;
      expect(Number(withAddress[0].n)).toBe(0);
      expect(await prisma.auditLog.count()).toBeGreaterThan(0);
    });

    it('refuses uploads: nothing scans them, and the next visitor would be served them', async () => {
      const token = await signIn('hr');
      const res = await api.upload('/files/upload', token, {
        filename: 'notes.txt',
        contentType: 'text/plain',
        content: Buffer.from('hello'),
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_UPLOADS_OFF');
    });

    describe('nothing a visitor does locks the next one out', () => {
      it('signing in with a password is refused, so the lockout cannot be tripped', async () => {
        for (let attempt = 0; attempt < 12; attempt++) {
          const res = await api.post('/auth/login', undefined, {
            email: DEMO_ACCOUNTS.hr,
            password: `a guess ${attempt}`,
          });
          expect(res.status).toBe(403);
          expect(res.body.code).toBe('DEMO_SIGN_IN_ONLY');
        }
        const hr = await prisma.user.findFirstOrThrow({ where: { email: DEMO_ACCOUNTS.hr } });
        expect(hr.failedLoginCount).toBe(0);
        expect(hr.lockedUntil).toBeNull();

        await expectEveryoneCanSignIn();
      });

      it('a lockout that happened anyway is lifted at the door', async () => {
        // However an account came to be locked, the one-click sign-in lifts it.
        await prisma.user.update({
          where: { id: await userIdOf('manager') },
          data: { failedLoginCount: 99, lockedUntil: new Date(Date.now() + 3_600_000) },
        });

        await expectEveryoneCanSignIn();
      });

      it("changing a demo account's password is refused", async () => {
        const token = await signIn('hr');
        const res = await api.post('/auth/change-password', token, {
          currentPassword: 'whatever it is',
          newPassword: 'a brand new passphrase nobody else knows',
        });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('DEMO_SHARED_ACCOUNT');
        await expectEveryoneCanSignIn();
      });

      it("changing a demo account's two-factor settings is refused", async () => {
        const token = await signIn('hr');
        for (const path of ['/auth/mfa/disable', '/auth/mfa/recovery-codes']) {
          const res = await api.post(path, token, { code: '000000' });
          expect(res.status).toBe(403);
          expect(res.body.code).toBe('DEMO_SHARED_ACCOUNT');
        }
        const hr = await prisma.user.findFirstOrThrow({ where: { email: DEMO_ACCOUNTS.hr } });
        expect(hr.mfaEnabled).toBe(true);

        await expectEveryoneCanSignIn();
      });

      it("revoking the account's other sessions is refused", async () => {
        const someoneElse = (await api.post('/demo/sign-in', undefined, { as: 'manager' })).body;
        const mine = (await api.post('/demo/sign-in', undefined, { as: 'manager' })).body;
        const mySessionId = JSON.parse(
          Buffer.from(String(mine.accessToken).split('.')[1], 'base64url').toString(),
        ).sid as string;

        const sessions = await api.get('/auth/sessions', mine.accessToken);
        const other = sessions.body.find((s: { id: string }) => s.id !== mySessionId);
        expect(other).toBeDefined();

        const revoke = await api.delete(`/auth/sessions/${other.id}`, mine.accessToken);
        expect(revoke.status).toBe(403);
        expect(revoke.body.code).toBe('DEMO_SHARED_ACCOUNT');

        // Signing out everywhere is the same thing, all at once.
        const everywhere = await api.post('/auth/logout', mine.accessToken, {});
        expect(everywhere.status).toBe(403);
        expect(everywhere.body.code).toBe('DEMO_SHARED_ACCOUNT');

        // Signing yourself out is fine, and signs out nobody else.
        const own = await api.post('/auth/logout', mine.accessToken, {
          refreshToken: mine.refreshToken,
        });
        expect(own.status).toBeLessThan(300);
        const stillIn = await api.post('/auth/refresh', undefined, {
          refreshToken: someoneElse.refreshToken,
        });
        expect(stillIn.status).toBe(200);

        await expectEveryoneCanSignIn();
      });

      it('deactivating the account is undone at the door', async () => {
        const hr = await signIn('hr');
        const manager = await prisma.employee.findFirstOrThrow({
          where: { user: { email: DEMO_ACCOUNTS.manager } },
        });

        const removed = await api.delete(`/employees/${manager.id}`, hr);
        expect(removed.status).toBe(204);
        const disabled = await prisma.user.findFirstOrThrow({
          where: { email: DEMO_ACCOUNTS.manager },
        });
        expect(disabled.status).toBe(UserStatus.DISABLED);

        await expectEveryoneCanSignIn();
        const back = await api.get(`/employees/${manager.id}`, await signIn('hr'));
        expect(back.status).toBe(200);
      });

      it("changing the account's roles is undone at the door", async () => {
        // No console route changes a role today, so the change is made where
        // any future route would make it. The sign-in puts back the grants the
        // last reset left — taking away what was removed, and what was added.
        const managerId = await userIdOf('manager');
        const employeeId = await userIdOf('employee');
        const hrRole = await prisma.role.findFirstOrThrow({ where: { key: 'HR_ADMIN' } });

        await prisma.userRole.deleteMany({ where: { userId: managerId } });
        await prisma.userRole.create({ data: { userId: employeeId, roleId: hrRole.id } });

        await expectEveryoneCanSignIn();
        const employee = await api.get('/auth/me', await signIn('employee'));
        expect(employee.body.roles).not.toContain('HR_ADMIN');
      });
    });

    describe('the reset', () => {
      it('remembers that something changed, so a restart would put it back', async () => {
        const [row] = await prisma.$queryRaw<{ dirty_since: Date | null }[]>`
          SELECT dirty_since FROM cwork_demo.state
        `;
        expect(row.dirty_since).not.toBeNull();
      });

      it('answers 503 with a message while it runs, and still reports its status', async () => {
        const token = await signIn('hr');
        const running = demo.reset('hourly');

        const during = await api.get('/auth/me', token);
        expect(during.status).toBe(503);
        expect(during.body.code).toBe('DEMO_RESETTING');
        const status = await api.get('/demo');
        expect(status.status).toBe(200);
        expect(status.body.resetting).toBe(true);

        await running;
        await settled();
      });

      it('puts the data back to the seed', async () => {
        // Read before anyone signs in: a sign-in is itself a change.
        const [row] = await prisma.$queryRaw<{ dirty_since: Date | null; seeded_at: Date }[]>`
          SELECT dirty_since, seeded_at FROM cwork_demo.state
        `;
        expect(row.dirty_since).toBeNull();
        expect(Date.now() - row.seeded_at.getTime()).toBeLessThan(120_000);

        // The leave approved above is waiting again, and the manager's
        // employee record, deleted above, is whole.
        const token = await signIn('manager');
        const tasks = await api.get('/approvals/tasks?status=PENDING', token);
        const pendingLeave = (tasks.body.data ?? tasks.body).filter(
          (task: { instance?: { entityType?: string } }) =>
            task.instance?.entityType === 'LEAVE_REQUEST',
        );
        expect(pendingLeave).toHaveLength(1);
        expect(
          await prisma.employee.count({
            where: { user: { email: DEMO_ACCOUNTS.manager }, deletedAt: null },
          }),
        ).toBe(1);

        await expectEveryoneCanSignIn();
      });

      it('boots again on its own database, and puts back what changed before the restart', async () => {
        // A visitor changes something, and the instance stops before its idle
        // reset can tidy up — the free tier's sleep does exactly that.
        await signIn('hr');

        const again = await createTestApp({ env: DEMO_ENV, imports: [DemoModule] });
        try {
          again.app.get(DemoService).stopSchedule();
          const during = await again.api.get('/demo');
          expect(during.status).toBe(200);

          const until = Date.now() + 120_000;
          let status = during.body;
          while (status.resetting && Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            status = (await again.api.get('/demo')).body;
          }
          expect(status.resetting).toBe(false);

          const [row] = await prisma.$queryRaw<{ dirty_since: Date | null }[]>`
            SELECT dirty_since FROM cwork_demo.state
          `;
          expect(row.dirty_since).toBeNull();
          const signedIn = await again.api.post('/demo/sign-in', undefined, { as: 'manager' });
          expect(signedIn.status).toBe(200);
        } finally {
          await again.close();
        }
      });

      it('seeds again at boot when the encryption key was rotated', async () => {
        // Ciphertext written with the old key is unreadable with the new one.
        // The demo notices by the key's fingerprint, not by failing to decrypt.
        const rotated = await createTestApp({
          env: { ...DEMO_ENV, FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') },
          imports: [DemoModule],
        });
        try {
          rotated.app.get(DemoService).stopSchedule();
          expect((await rotated.api.get('/demo')).body.resetting).toBe(true);

          const until = Date.now() + 120_000;
          while ((await rotated.api.get('/demo')).body.resetting && Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          const signedIn = await rotated.api.post('/demo/sign-in', undefined, { as: 'hr' });
          expect(signedIn.status).toBe(200);
          const employees = await rotated.api.get('/employees?limit=50', signedIn.body.accessToken);
          expect(employees.status).toBe(200);
        } finally {
          await rotated.close();
        }
      });
    });
  });
});
