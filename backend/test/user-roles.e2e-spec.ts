// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Giving and taking away roles from the console (CW-079).
 *
 * Until this existed, setup's first administrator was the only account that
 * could ever hold more than `EMPLOYEE`. The person given roles here is created
 * by this spec, so nothing it does reaches the demo accounts other specs use;
 * the super administrator's own grant is only ever refused, never removed.
 */
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { generateTotpForStep, timeStepAt } from 'src/modules/auth/domain/totp';
import { createTestApp, waitForNextStep, type Api, type TestContext } from './utils/test-app';

const CEO = 'ceo@cwork.example'; // SUPER_ADMIN
const HR_MANAGER = 'hr.manager@cwork.example'; // HR_ADMIN: role:manage, but not every permission
const HR_OFFICER = 'hr.officer@cwork.example'; // no role:manage
const PASSWORD = `Roles-${randomUUID()}`;

/**
 * A sign-out rejects tokens issued before its second, not during it (see
 * `tokenPredatesInvalidation`), so a session about to be cut is aged past one.
 */
const nextSecond = () => new Promise((resolve) => setTimeout(resolve, 1100));

/** A test that signs in with a code may wait out a 30-second step each time. */
const TWO_CODE_SIGN_INS = 150_000;

interface Grant {
  id: string;
  roleKey: string;
  department: { id: string } | null;
  expiresOn: string | null;
}

describe('Roles given from the console (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let ceoToken: string;
  let hrManagerToken: string;
  let officerToken: string;
  let employeeId: string;
  let email: string;
  let secret: string | null = null;

  const rolesPath = () => `/employees/${employeeId}/roles`;
  const grant = (token: string, body: Record<string, unknown>) =>
    api.post(rolesPath(), token, body);
  const grants = async (): Promise<Grant[]> => (await api.get(rolesPath(), ceoToken)).body.grants;
  const grantOf = async (roleKey: string) => (await grants()).find((g) => g.roleKey === roleKey)!;

  /** Signs the created person in, enrolling a second factor the first time one is asked for. */
  async function signIn(): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await api.post('/auth/login', undefined, { email, password: PASSWORD });
    expect(res.status).toBe(200);
    if (!res.body.mfaRequired) return res.body;

    const { challengeToken } = res.body;
    if (!secret) {
      expect(res.body.mfaEnrolled).toBe(false);
      const enrol = await api.post('/auth/mfa/enroll', undefined, { challengeToken });
      expect(enrol.status).toBe(200);
      secret = enrol.body.secret as string;
      const activated = await api.post('/auth/mfa/activate', undefined, {
        challengeToken,
        code: generateTotpForStep(secret, timeStepAt(Date.now())),
      });
      expect(activated.status).toBe(200);
      return activated.body.session;
    }
    // A code is spent once per step, so a second sign-in waits for the next.
    await waitForNextStep();
    const verified = await api.post('/auth/mfa/verify', undefined, {
      challengeToken,
      code: generateTotpForStep(secret, timeStepAt(Date.now())),
    });
    expect(verified.status).toBe(200);
    return verified.body;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    ceoToken = await api.token(CEO);
    hrManagerToken = await api.token(HR_MANAGER);
    officerToken = await api.token(HR_OFFICER);

    email = `roles-${randomUUID().slice(0, 8)}@cwork.example`;
    const created = await api.post('/employees', officerToken, {
      firstNameTh: 'วิภา',
      lastNameTh: 'บัญชีดี',
      hireDate: '2024-01-15',
      workEmail: email,
      createUserAccount: true,
    });
    expect(created.status).toBe(201);
    employeeId = created.body.id;
    // The invitation would set a password; set one directly.
    const crypto = ctx.app.get(CryptoService);
    await prisma.user.update({
      where: { id: created.body.userId },
      data: {
        passwordHash: await crypto.hashPassword(PASSWORD),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    // Other specs count the demo company's people and accounts; this one leaves as it came.
    if (employeeId) {
      const employee = await prisma.employee.update({
        where: { id: employeeId },
        data: { deletedAt: new Date(), status: 'TERMINATED' },
        select: { userId: true },
      });
      if (employee.userId) {
        await prisma.user.update({
          where: { id: employee.userId },
          data: { status: 'DISABLED', sessionsValidFrom: new Date() },
        });
      }
    }
    await ctx?.close();
  });

  it('refuses every route to an account without role:manage', async () => {
    expect((await api.get(rolesPath(), officerToken)).status).toBe(403);
    expect((await grant(officerToken, { roleKey: 'HR_OFFICER' })).status).toBe(403);
    const employeeGrant = (await grants())[0];
    expect((await api.delete(`${rolesPath()}/${employeeGrant.id}`, officerToken)).status).toBe(403);
  });

  it('lists the account, its roles, and which roles the caller may hand out', async () => {
    const res = await api.get(rolesPath(), hrManagerToken);
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({ email, status: 'ACTIVE', mfaEnabled: false });
    expect(res.body.grants.map((g: Grant) => g.roleKey)).toEqual(['EMPLOYEE']);
    const byKey = Object.fromEntries(res.body.roles.map((r: { key: string }) => [r.key, r]));
    expect(byKey.SUPER_ADMIN).toMatchObject({ grantable: false, requiresSecondFactor: true });
    expect(byKey.PAYROLL_OFFICER).toMatchObject({ grantable: true, requiresSecondFactor: true });
    expect(byKey.HR_OFFICER).toMatchObject({ grantable: true, departmentScopeApplies: true });
  });

  it('stops an HR manager from making anyone a super administrator', async () => {
    const res = await grant(hrManagerToken, { roleKey: 'SUPER_ADMIN' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_ABOVE_YOUR_OWN');
  });

  it('makes the person HR officer and payroll officer; they enrol a second factor and reach advances', async () => {
    const before = await signIn();
    expect((await api.get('/auth/me', before.accessToken)).status).toBe(200);
    expect((await api.get('/payroll/advances', before.accessToken)).status).toBe(403);
    await nextSecond();

    const officer = await grant(ceoToken, { roleKey: 'HR_OFFICER' });
    expect(officer.status).toBe(201);
    expect(officer.body).toMatchObject({ signedOut: true, secondFactorRequired: false });
    const payroll = await grant(ceoToken, { roleKey: 'PAYROLL_OFFICER' });
    expect(payroll.status).toBe(201);
    expect(payroll.body).toMatchObject({ signedOut: true, secondFactorRequired: true });

    // Signed out everywhere: neither the old access token nor its refresh token works.
    expect((await api.get('/auth/me', before.accessToken)).status).toBe(401);
    expect(
      (await api.post('/auth/refresh', undefined, { refreshToken: before.refreshToken })).status,
    ).toBe(401);

    const after = await signIn();
    expect(secret).not.toBeNull();
    const me = await api.get('/auth/me', after.accessToken);
    expect(me.body.roles).toEqual(expect.arrayContaining(['HR_OFFICER', 'PAYROLL_OFFICER']));
    expect((await api.get('/payroll/advances', after.accessToken)).status).toBe(200);

    const audit = await prisma.auditLog.findMany({
      where: { action: 'PERMISSION_CHANGE', entityId: me.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((row) => row.summary)).toEqual([
      `Granted HR_OFFICER to ${email}`,
      `Granted PAYROLL_OFFICER to ${email}`,
    ]);
  });

  it('refuses a role the account already holds', async () => {
    const res = await grant(ceoToken, { roleKey: 'HR_OFFICER' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ROLE_ALREADY_GRANTED');
  });

  it(
    'takes payroll officer away, and with it the advances page, at once',
    async () => {
      const session = await signIn();
      await nextSecond();
      const payroll = await grantOf('PAYROLL_OFFICER');
      const removed = await api.delete(`${rolesPath()}/${payroll.id}`, ceoToken);
      expect(removed.status).toBe(200);
      expect(removed.body).toEqual({ signedOut: true });
      expect((await api.get('/payroll/advances', session.accessToken)).status).toBe(401);

      const again = await signIn();
      expect((await api.get('/payroll/advances', again.accessToken)).status).toBe(403);
      expect((await api.get('/auth/me', again.accessToken)).body.roles).not.toContain(
        'PAYROLL_OFFICER',
      );
    },
    TWO_CODE_SIGN_INS,
  );

  it('limits a role to a department only where the limit means something', async () => {
    const department = await prisma.department.findFirstOrThrow({
      where: { deletedAt: null, organization: { users: { some: { email } } } },
      select: { id: true },
    });
    const scoped = await grant(ceoToken, { roleKey: 'MANAGER', departmentId: department.id });
    expect(scoped.status).toBe(422);
    expect(scoped.body.code).toBe('DEPARTMENT_SCOPE_NOT_APPLICABLE');

    const recruiter = await grant(ceoToken, { roleKey: 'RECRUITER', expiresOn: '2020-01-31' });
    expect(recruiter.status).toBe(422);
    expect(recruiter.body.code).toBe('ROLE_EXPIRY_IN_PAST');
  });

  it(
    'keeps the last permanent super administrator, and keeps role:manage from removing itself',
    async () => {
      const ceo = await prisma.user.findFirstOrThrow({
        where: { email: CEO },
        select: { id: true },
      });
      const ceoEmployee = await prisma.employee.findFirstOrThrow({
        where: { userId: ceo.id },
        select: { id: true },
      });
      const ceoPath = `/employees/${ceoEmployee.id}/roles`;
      const ceoGrant = (await api.get(ceoPath, ceoToken)).body.grants.find(
        (g: Grant) => g.roleKey === 'SUPER_ADMIN' && g.department === null,
      );
      const permanent = await prisma.userRole.count({
        where: { departmentId: null, expiresAt: null, role: { key: 'SUPER_ADMIN' } },
      });
      expect(permanent).toBe(1);

      const own = await api.delete(`${ceoPath}/${ceoGrant.id}`, ceoToken);
      expect(own.status).toBe(422);
      expect(own.body.code).toBe('CANNOT_REMOVE_OWN_ROLE_MANAGE');
      const byHrManager = await api.delete(`${ceoPath}/${ceoGrant.id}`, hrManagerToken);
      expect(byHrManager.status).toBe(403);

      // A super administrator until the end of next year is still not a permanent one.
      const nextYear = new Date().getUTCFullYear() + 1;
      const temporary = await grant(ceoToken, {
        roleKey: 'SUPER_ADMIN',
        expiresOn: `${nextYear}-12-31`,
      });
      expect(temporary.status).toBe(201);
      expect(temporary.body.grant.expiresOn).toBe(`${nextYear}-12-31`);
      const session = await signIn();
      const last = await api.delete(`${ceoPath}/${ceoGrant.id}`, session.accessToken);
      expect(last.status).toBe(422);
      expect(last.body.code).toBe('LAST_SUPER_ADMIN');
      expect((await api.get(ceoPath, ceoToken)).body.grants.map((g: Grant) => g.roleKey)).toContain(
        'SUPER_ADMIN',
      );

      const cleanup = await api.delete(`${rolesPath()}/${temporary.body.grant.id}`, ceoToken);
      expect(cleanup.status).toBe(200);
    },
    TWO_CODE_SIGN_INS,
  );
});
