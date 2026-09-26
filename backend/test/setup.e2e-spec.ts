// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * First-run setup — the one path nobody could take before.
 *
 * Until CW-022 the only `organization.upsert` in the codebase was in
 * `prisma/seed.ts`, which the README itself labels demo data. Installing Cwork
 * for real people meant loading a fictional company with published credentials
 * and then cleaning up after it, and the "clean up after it" half was never
 * going to happen reliably.
 *
 * So the thing being tested here is the whole point of the ticket: an empty
 * database plus a setup token yields an administrator who can actually sign in,
 * with no demo rows anywhere near it. Everything else in this file exists to
 * make sure that door cannot be opened by anyone else — no token, a guessed
 * token, an expired token, a token already spent, or a token that was perfectly
 * good until somebody finished setting the install up first.
 *
 * **This spec truncates the database and reseeds it afterwards.** It is the only
 * honest way to test a first install: a fresh database is the precondition.
 * Everything runs under `--runInBand`, so the demo company is back before the
 * next spec opens.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { generateTotpForStep, timeStepAt } from 'src/modules/auth/domain/totp';
import { SetupService } from 'src/modules/setup/setup.service';
import { seedDemoCompany, truncateAll } from './utils/database';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const ORG_NAME = 'บริษัท ตั้งค่าใหม่ จำกัด';
const ADMIN_EMAIL = 'first.admin@fresh-install.example';
const ADMIN_PASSWORD = 'a perfectly serviceable passphrase';

describe('First-run setup (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let setup: SetupService;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    crypto = ctx.app.get(CryptoService);
    setup = ctx.app.get(SetupService);

    // The precondition the whole ticket is about.
    await truncateAll();
  });

  afterAll(async () => {
    await ctx.close();
    // Put the demo company back for whatever runs next.
    await truncateAll();
    seedDemoCompany(undefined, { quiet: true });
  });

  /** Writes a token row straight to the database, the way `db:init` would. */
  const plantToken = async (token: string, expiresAt: Date, usedAt: Date | null = null) => {
    await prisma.setupToken.create({
      data: { tokenHash: crypto.hashToken(token), expiresAt, usedAt },
    });
  };

  const body = (overrides: Record<string, unknown> = {}) => ({
    organizationName: ORG_NAME,
    timezone: 'Asia/Bangkok',
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
    ...overrides,
  });

  describe('before anyone has set it up', () => {
    it('says so, without being asked to authenticate', async () => {
      const res = await api.get('/setup/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ initialised: false });
    });

    it('refuses a request with no token at all', async () => {
      const res = await api.post('/setup', undefined, body());

      expect(res.status).toBe(400);
      expect(await prisma.organization.count()).toBe(0);
    });

    it('refuses a token nobody issued', async () => {
      const res = await api.post('/setup', undefined, body({ token: crypto.generateToken() }));

      expect(res.status).toBe(401);
      expect(await prisma.organization.count()).toBe(0);
    });

    it('refuses a token that has expired', async () => {
      const token = crypto.generateToken();
      await plantToken(token, new Date(Date.now() - 60_000));

      const res = await api.post('/setup', undefined, body({ token }));

      expect(res.status).toBe(401);
      expect(await prisma.organization.count()).toBe(0);
    });

    it('refuses a token that has already been spent', async () => {
      const token = crypto.generateToken();
      await plantToken(token, new Date(Date.now() + 3_600_000), new Date());

      const res = await api.post('/setup', undefined, body({ token }));

      expect(res.status).toBe(401);
      expect(await prisma.organization.count()).toBe(0);
    });

    it('says the same thing however the token is wrong', async () => {
      // Three different reasons, one message. Which guess was close is not
      // something a stranger poking at a fresh install gets to learn.
      const unknown = await api.post('/setup', undefined, body({ token: crypto.generateToken() }));

      const expired = crypto.generateToken();
      await plantToken(expired, new Date(Date.now() - 1000));

      const spent = crypto.generateToken();
      await plantToken(spent, new Date(Date.now() + 3_600_000), new Date());

      const messages = [
        unknown.body.message,
        (await api.post('/setup', undefined, body({ token: expired }))).body.message,
        (await api.post('/setup', undefined, body({ token: spent }))).body.message,
      ];

      expect(new Set(messages).size).toBe(1);
    });

    it('holds a valid token to the same password policy as everybody else', async () => {
      const { token } = await setup.issueToken();

      const res = await api.post('/setup', undefined, body({ token, adminPassword: 'short' }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('WEAK_PASSWORD');
      expect(await prisma.organization.count()).toBe(0);
    });

    it('refuses a timezone the server does not know, rather than storing the typo', async () => {
      const { token } = await setup.issueToken();

      const res = await api.post('/setup', undefined, body({ token, timezone: 'Asia/Bangkock' }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_SETUP');
      expect(await prisma.organization.count()).toBe(0);
    });
  });

  describe('setting the installation up', () => {
    let usedToken: string;

    it('creates the organisation, the role set and one administrator', async () => {
      const issued = await setup.issueToken();
      usedToken = issued.token;

      const res = await api.post('/setup', undefined, body({ token: usedToken }));

      expect(res.status).toBe(201);
      expect(res.body.organization).toMatchObject({
        name: ORG_NAME,
        timezone: 'Asia/Bangkok',
        // No ASCII in a Thai name to derive a code from, so setup falls back.
        code: 'MAIN',
      });
      expect(res.body.administrator).toMatchObject({
        email: ADMIN_EMAIL,
        role: 'SUPER_ADMIN',
      });
      expect(res.body.rolesCreated).toBe(8);
      // A session is deliberately not part of the answer: the new account owes
      // a second factor, and that is the sign-in page's job.
      expect(res.body).not.toHaveProperty('accessToken');
    });

    it('leaves no demo data behind it', async () => {
      const [organizations, users, employees, departments, roles] = await Promise.all([
        prisma.organization.findMany({ select: { code: true } }),
        prisma.user.findMany({ select: { email: true } }),
        prisma.employee.count(),
        prisma.department.count(),
        prisma.role.count(),
      ]);

      expect(organizations).toEqual([{ code: 'MAIN' }]);
      expect(users).toEqual([{ email: ADMIN_EMAIL }]);
      expect(employees).toBe(0);
      expect(departments).toBe(0);
      expect(roles).toBe(8);
    });

    /**
     * Not a style rule — a bug this spec found the hard way.
     *
     * `sessionsValidFrom` is compared against an access token's `iat`, which
     * JWT carries in whole seconds. Stored with the column's millisecond-
     * precision `now()` default, an administrator who signs in inside the same
     * second as their own account was created is handed a token that reads as
     * older than the account, and every request after the sign-in comes back
     * "session has been invalidated". Whether that race is lost depends on how
     * fast the machine is, so it is pinned here as state rather than left to
     * the sign-in test below to catch on a good day.
     */
    it('records the administrator as never having been signed out', async () => {
      const user = await prisma.user.findFirstOrThrow({
        where: { email: ADMIN_EMAIL },
        select: { sessionsValidFrom: true },
      });

      expect(user.sessionsValidFrom.getMilliseconds()).toBe(0);
    });

    it('records its own first audit row', async () => {
      const entries = await prisma.auditLog.findMany({
        select: { entityType: true, action: true },
      });

      expect(entries).toEqual([{ entityType: 'Organization', action: 'CREATE' }]);
    });

    it('now reports itself as set up', async () => {
      expect((await api.get('/setup/status')).body).toEqual({ initialised: true });
    });

    it('will not spend the same token twice', async () => {
      const res = await api.post('/setup', undefined, body({ token: usedToken }));

      // Already-initialised is the first thing checked, so it wins over the
      // spent token — and either way the answer is no.
      expect([401, 409]).toContain(res.status);
      expect(await prisma.organization.count()).toBe(1);
    });
  });

  describe('once it is set up', () => {
    it('refuses a setup token that was minted before setup ran', async () => {
      // The dangerous case: a token issued while the install was still empty,
      // still unspent, still inside its hour — and useless, because somebody
      // finished setting the install up first.
      const stillValid = crypto.generateToken();
      await plantToken(stillValid, new Date(Date.now() + 3_600_000));

      const res = await api.post('/setup', undefined, body({ token: stillValid }));

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_INITIALISED');
      expect(await prisma.organization.count()).toBe(1);
    });

    it('will not mint another token, so `db:init` has nothing left to offer', async () => {
      await expect(setup.issueToken()).rejects.toMatchObject({
        response: { code: 'ALREADY_INITIALISED' },
      });
    });

    it('will not run again from the CLI either', async () => {
      expect(await setup.isInitialised()).toBe(true);
      await expect(
        setup.initialise({
          organizationName: 'A Second Company',
          organizationCode: 'SECOND',
          timezone: 'Asia/Bangkok',
          adminEmail: 'someone.else@fresh-install.example',
          adminPassword: ADMIN_PASSWORD,
        }),
      ).rejects.toMatchObject({ response: { code: 'ALREADY_INITIALISED' } });

      expect(await prisma.organization.count()).toBe(1);
    });
  });

  /**
   * The acceptance criterion in one test: a fresh database plus setup yields a
   * usable sign-in. "Usable" includes the second factor — the account holds
   * every permission there is, so Cwork refuses it a session until it has one,
   * and an install that stopped one step short of that would be no install.
   */
  describe('the administrator it created', () => {
    let accessToken: string;

    it('cannot sign in on a password alone, and is offered enrolment instead', async () => {
      const res = await api.post('/auth/login', undefined, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.mfaEnrolled).toBe(false);
      expect(res.body.challengeToken).toEqual(expect.any(String));
    });

    it('signs in for real once it has enrolled a second factor', async () => {
      const login = await api.post('/auth/login', undefined, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
      const challengeToken = login.body.challengeToken as string;

      const enrolment = await api.post('/auth/mfa/enroll', undefined, { challengeToken });
      expect(enrolment.status).toBe(200);
      const secret = enrolment.body.secret as string;

      // The code that switches the factor on is the code that finishes the
      // sign-in: the session comes back from activation itself.
      const activated = await api.post('/auth/mfa/activate', undefined, {
        challengeToken,
        code: generateTotpForStep(secret, timeStepAt(Date.now())),
      });
      expect(activated.status).toBe(200);
      expect(activated.body.recoveryCodes).toHaveLength(10);
      expect(activated.body.session.accessToken).toEqual(expect.any(String));
      accessToken = activated.body.session.accessToken as string;
    });

    it('holds every permission, so the console is usable from the first screen', async () => {
      const me = await api.get('/auth/me', accessToken);

      expect(me.status).toBe(200);
      expect(me.body.roles).toEqual(['SUPER_ADMIN']);
      expect(me.body.permissions).toEqual(expect.arrayContaining(['org:manage', 'role:manage']));
    });

    it('can read the organisation it just created', async () => {
      const org = await api.get('/organization', accessToken);

      expect(org.status).toBe(200);
      expect(org.body).toMatchObject({ name: ORG_NAME, code: 'MAIN' });
    });

    it('can start building the company — the first department goes in', async () => {
      const created = await api.post('/departments', accessToken, {
        code: 'HR',
        name: 'ฝ่ายทรัพยากรบุคคล',
      });

      expect(created.status).toBe(201);
      expect((await api.get('/departments', accessToken)).body).toHaveLength(1);
    });
  });
});
