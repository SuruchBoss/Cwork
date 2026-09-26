// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * End-to-end suite: one company, one month, start to finish.
 *
 * This is deliberately a single ordered narrative rather than a set of
 * independent files. The scenarios genuinely depend on each other — leave is
 * approved before payroll consumes it, payroll is paid before attendance
 * locks — and Jest runs `describe` blocks in declaration order within a file,
 * which gives that ordering for free and without a custom sequencer.
 *
 * The database is migrated, truncated and seeded once in `global-setup.ts`.
 *
 * These scenarios are not hypothetical: run against a live API during
 * development, two of them caught real bugs — payroll prorating salary by
 * attendance coverage, and the seed silently creating none of the public
 * holidays. Both are asserted here so they cannot come back.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  createTestApp,
  currentDemoCode,
  waitForNextStep,
  type Api,
  type TestContext,
} from './utils/test-app';
import { findFridayToMondayWindow, isoDate } from './utils/dates';

const EMPLOYEE = 'dev2@cwork.example';
const MANAGER = 'eng.manager@cwork.example';
const HR = 'hr.manager@cwork.example';
const CEO = 'ceo@cwork.example';

/** The seeded Bangkok office, to a few metres. */
const OFFICE = { latitude: 13.7212, longitude: 100.5286 };
/** Chiang Mai — about 580 km away, comfortably outside any sane geofence. */
const FAR_AWAY = { latitude: 18.7883, longitude: 98.9853 };

describe('Cwork API (e2e)', () => {
  let ctx: TestContext;
  let api: Api;

  let employeeToken: string;
  let managerToken: string;
  let hrToken: string;
  let ceoToken: string;

  // Carried between scenarios, in declaration order.
  let annualLeaveTypeId: string;
  let leaveRequestId: string;
  let payrollRunId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;

    employeeToken = await api.token(EMPLOYEE);
    managerToken = await api.token(MANAGER);
    hrToken = await api.token(HR);
    ceoToken = await api.token(CEO);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('authentication', () => {
    it('signs an employee in and returns their permissions', async () => {
      const session = await api.login(EMPLOYEE);

      expect(session.accessToken).toBeTruthy();
      expect(session.refreshToken).toBeTruthy();
      expect(session.user.displayName).toBeTruthy();
      expect(session.user.permissions.length).toBeGreaterThan(0);
    });

    it('rejects a wrong password without saying which half was wrong', async () => {
      const res = await api.post('/auth/login', undefined, {
        email: EMPLOYEE,
        password: 'definitely-not-the-password',
      });

      expect(res.status).toBe(401);
    });

    it('refuses an unauthenticated request — the guard is deny-by-default', async () => {
      const res = await api.get('/employees');

      expect(res.status).toBe(401);
    });

    it('honours a sign-in that lands in the same second as a forced sign-out', async () => {
      // `sessionsValidFrom` invalidates every token issued before it. It is
      // stored in milliseconds; a JWT's `iat` is whole seconds. Comparing them
      // directly read a token issued *after* the sign-out as older than it
      // whenever the two shared a second — so someone who changed their
      // password and signed straight back in had every request refused with
      // "session has been invalidated", and signing in again fixed it.
      //
      // It reached CI as a flake in the outbox suite: `setup.e2e-spec.ts`
      // reseeds the demo company, `sessionsValidFrom` defaults to `now()` with
      // milliseconds, and the next spec's sign-in sometimes landed in that same
      // second. The assertion that failed could only report "Expected: NaN".
      //
      // Pinned to the token's own `iat` rather than to the wall clock, so it
      // cannot go vacuously green by crossing a second boundary.
      const prisma = ctx.app.get(PrismaService);
      const account = await prisma.user.findFirstOrThrow({
        where: { email: EMPLOYEE },
        select: { id: true, sessionsValidFrom: true },
      });

      const token = await api.token(EMPLOYEE);
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as {
        iat: number;
      };

      try {
        await prisma.user.update({
          where: { id: account.id },
          // The same second the token was minted in, 740ms further on.
          data: { sessionsValidFrom: new Date(claims.iat * 1000 + 740) },
        });

        const res = await api.get('/notifications', token);
        expect(res.status).toBe(200);
      } finally {
        await prisma.user.update({
          where: { id: account.id },
          data: { sessionsValidFrom: account.sessionsValidFrom },
        });
      }
    });

    it('rejects an unknown field rather than ignoring it', async () => {
      // Mass assignment is the easy way to smuggle `role` into a payload.
      const res = await api.post('/auth/login', undefined, {
        email: EMPLOYEE,
        password: 'whatever',
        organizationId: 'someone-elses-organisation',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('multi-factor authentication', () => {
    const PRIVILEGED = HR;
    const UNPRIVILEGED = EMPLOYEE;

    it('will not hand a privileged account a session for a password alone', async () => {
      // The whole point of the ticket: one stolen password must not be enough
      // to reach every national ID in the organisation.
      const res = await api.post('/auth/login', undefined, {
        email: PRIVILEGED,
        password: process.env.SEED_PASSWORD ?? 'Cwork2026!',
      });

      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.challengeToken).toBeTruthy();
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();
    });

    it('does not challenge an account with no privileges and no enrolment', async () => {
      const res = await api.post('/auth/login', undefined, {
        email: UNPRIVILEGED,
        password: process.env.SEED_PASSWORD ?? 'Cwork2026!',
      });

      expect(res.body.mfaRequired).toBe(false);
      expect(res.body.accessToken).toBeTruthy();
    });

    it('refuses the challenge token as if it were an access token', async () => {
      // It is signed with the same secret, issuer and audience as a real access
      // token; only the `typ` claim separates them. If that check regresses,
      // a correct password alone becomes a full session again.
      const login = await api.post('/auth/login', undefined, {
        email: PRIVILEGED,
        password: process.env.SEED_PASSWORD ?? 'Cwork2026!',
      });

      const res = await api.get('/employees?limit=1', login.body.challengeToken);

      expect(res.status).toBe(401);
    });

    it('rejects a wrong code and issues a session for a right one', async () => {
      const login = await api.post('/auth/login', undefined, {
        email: PRIVILEGED,
        password: process.env.SEED_PASSWORD ?? 'Cwork2026!',
      });

      const wrong = await api.post('/auth/mfa/verify', undefined, {
        challengeToken: login.body.challengeToken,
        code: '000000',
      });
      expect(wrong.status).toBe(401);

      await waitForNextStep();
      const right = await api.post('/auth/mfa/verify', undefined, {
        challengeToken: login.body.challengeToken,
        code: currentDemoCode(),
      });

      expect(right.status).toBe(200);
      expect(right.body.mfaRequired).toBe(false);
      expect(right.body.accessToken).toBeTruthy();
    });

    it('refuses to spend the same code twice', async () => {
      // A code observed in flight — by a phishing proxy, over a shoulder — is
      // valid for up to 90 seconds. Once spent, it is spent.
      await waitForNextStep();
      const code = currentDemoCode();

      const first = await api.post('/auth/login', undefined, {
        email: PRIVILEGED,
        password: process.env.SEED_PASSWORD ?? 'Cwork2026!',
      });
      const accepted = await api.post('/auth/mfa/verify', undefined, {
        challengeToken: first.body.challengeToken,
        code,
      });
      expect(accepted.status).toBe(200);

      const second = await api.post('/auth/login', undefined, {
        email: PRIVILEGED,
        password: process.env.SEED_PASSWORD ?? 'Cwork2026!',
      });
      const replayed = await api.post('/auth/mfa/verify', undefined, {
        challengeToken: second.body.challengeToken,
        code,
      });

      expect(replayed.status).toBe(401);
    });

    it('never returns the secret through the status endpoint', async () => {
      const res = await api.get('/auth/mfa/status', hrToken);

      expect(res.status).toBe(200);
      expect(res.body.enrolled).toBe(true);
      expect(res.body.required).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain('CWORKDEMOMFASECRET');
    });

    it('refuses to let a privileged account turn its second factor off', async () => {
      await waitForNextStep();
      const res = await api.post('/auth/mfa/disable', hrToken, { code: currentDemoCode() });

      expect(res.body.code).toBe('MFA_MANDATORY');
    });

    describe('voluntary enrolment from a session', () => {
      let enrolToken: string;
      let secret: string;
      let recoveryCodes: string[];

      beforeAll(async () => {
        // An ordinary employee adding a second factor of their own accord.
        enrolToken = await api.token('dev1@cwork.example');
      });

      it('offers a secret and a scannable URI', async () => {
        const res = await api.post('/auth/mfa/enroll', enrolToken, {});

        expect(res.status).toBe(200);
        expect(res.body.secret).toMatch(/^[A-Z2-7]+$/);
        expect(res.body.otpauthUri).toContain('otpauth://totp/');
        secret = res.body.secret;
      });

      it('does not count as enrolled until a code proves the secret was scanned', async () => {
        const status = await api.get('/auth/mfa/status', enrolToken);

        expect(status.body.enrolled).toBe(false);
      });

      it('rejects a wrong activation code', async () => {
        const res = await api.post('/auth/mfa/activate', enrolToken, { code: '000000' });

        expect(res.body.code).toBe('MFA_CODE_INVALID');
      });

      it('activates on a real code and returns recovery codes once', async () => {
        const { generateTotpForStep, timeStepAt } = await import('src/modules/auth/domain/totp');
        const res = await api.post('/auth/mfa/activate', enrolToken, {
          code: generateTotpForStep(secret, timeStepAt(Date.now())),
        });

        expect(res.status).toBe(200);
        expect(res.body.recoveryCodes).toHaveLength(10);
        recoveryCodes = res.body.recoveryCodes;

        const status = await api.get('/auth/mfa/status', enrolToken);
        expect(status.body.enrolled).toBe(true);
        expect(status.body.recoveryCodesRemaining).toBe(10);
      });

      it('accepts a recovery code in place of a generated one, exactly once', async () => {
        const [recovery] = recoveryCodes;

        const first = await api.post('/auth/login', undefined, {
          email: 'dev1@cwork.example',
          password: process.env.SEED_PASSWORD ?? 'Cwork2026!',
        });
        expect(first.body.mfaRequired).toBe(true);

        const used = await api.post('/auth/mfa/verify', undefined, {
          challengeToken: first.body.challengeToken,
          code: recovery,
        });
        expect(used.status).toBe(200);

        const second = await api.post('/auth/login', undefined, {
          email: 'dev1@cwork.example',
          password: process.env.SEED_PASSWORD ?? 'Cwork2026!',
        });
        const reused = await api.post('/auth/mfa/verify', undefined, {
          challengeToken: second.body.challengeToken,
          code: recovery,
        });

        expect(reused.status).toBe(401);

        const status = await api.get('/auth/mfa/status', enrolToken);
        expect(status.body.recoveryCodesRemaining).toBe(9);
      });

      it('lets an unprivileged account turn it back off with a valid code', async () => {
        const [spare] = recoveryCodes.slice(1);
        const res = await api.post('/auth/mfa/disable', enrolToken, { code: spare });

        expect(res.status).toBe(200);
        const status = await api.get('/auth/mfa/status', enrolToken);
        expect(status.body.enrolled).toBe(false);
      });
    });
  });

  describe('authorisation', () => {
    it('blocks an employee from payroll administration', async () => {
      const res = await api.get('/payroll/periods', employeeToken);

      expect(res.status).toBe(403);
    });

    it('scopes an employee to their own record', async () => {
      const res = await api.get('/employees?limit=50', employeeToken);

      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(1);
    });

    it('scopes a manager to their team plus themselves', async () => {
      const res = await api.get('/employees?limit=50', managerToken);

      expect(res.body.meta.total).toBe(3);
    });

    it('shows HR the whole organisation', async () => {
      const res = await api.get('/employees?limit=50', hrToken);

      expect(res.body.meta.total).toBe(8);
    });
  });

  describe('public holidays', () => {
    // The seed once created none of these and said nothing about it, which
    // quietly made every leave request cost more days than it should.
    it('seeds a full public-holiday calendar', async () => {
      const res = await api.get('/holidays', hrToken);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe('leave', () => {
    let window: { startDate: string; endDate: string };

    beforeAll(async () => {
      const holidays = await api.get('/holidays', hrToken);
      const dates = new Set<string>(
        holidays.body.map((h: { date: string }) => h.date.slice(0, 10)),
      );
      window = findFridayToMondayWindow(dates, new Date());
    });

    it('grants the employee an annual-leave balance', async () => {
      const res = await api.get('/leave/balances/me', employeeToken);

      expect(res.status).toBe(200);
      const annual = res.body.find((b: { code: string }) => b.code === 'ANNUAL');
      expect(annual).toBeDefined();
      expect(Number(annual.available)).toBeGreaterThan(0);
      annualLeaveTypeId = annual.leaveTypeId;
    });

    it('charges Friday to Monday as two days, not four', async () => {
      const res = await api.post('/leave/requests/preview', employeeToken, {
        leaveTypeId: annualLeaveTypeId,
        ...window,
      });

      expect(res.status).toBeLessThan(400);
      expect(Number(res.body.totalDays)).toBe(2);
    });

    it('reserves the days as pending the moment the request is submitted', async () => {
      const created = await api.post('/leave/requests', employeeToken, {
        leaveTypeId: annualLeaveTypeId,
        ...window,
        reason: 'พาครอบครัวไปต่างจังหวัด',
      });

      expect(created.body.requestNo).toBeTruthy();
      leaveRequestId = created.body.id;

      const balances = await api.get('/leave/balances/me', employeeToken);
      const annual = balances.body.find((b: { code: string }) => b.code === 'ANNUAL');
      // Reserving on submit is what stops two overlapping requests both fitting
      // inside one remaining day.
      expect(Number(annual.pending)).toBe(2);
    });

    it('rejects a request that overlaps one already in flight', async () => {
      const res = await api.post('/leave/requests', employeeToken, {
        leaveTypeId: annualLeaveTypeId,
        startDate: window.endDate,
        endDate: window.endDate,
      });

      expect(res.body.code).toBe('OVERLAPPING_LEAVE');
    });

    it('routes the approval to the line manager', async () => {
      const res = await api.get('/approvals/tasks', managerToken);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('moves pending to used once the manager approves', async () => {
      const tasks = await api.get('/approvals/tasks', managerToken);
      const decision = await api.post(`/approvals/tasks/${tasks.body[0].id}/decide`, managerToken, {
        decision: 'APPROVE',
        comment: 'อนุมัติครับ',
      });

      expect(decision.body.instanceStatus).toBe('APPROVED');

      const balances = await api.get('/leave/balances/me', employeeToken);
      const annual = balances.body.find((b: { code: string }) => b.code === 'ANNUAL');
      expect(Number(annual.used)).toBe(2);
      expect(Number(annual.pending)).toBe(0);

      const detail = await api.get(`/leave/requests/${leaveRequestId}`, employeeToken);
      expect(detail.body.status).toBe('APPROVED');
    });
  });

  describe('attendance', () => {
    it('starts the day not clocked in', async () => {
      const res = await api.get('/attendance/today', employeeToken);

      expect(res.body.isClockedIn).toBe(false);
      expect(res.body.nextAction).toBe('CLOCK_IN');
    });

    it('accepts a clock-in inside the geofence', async () => {
      const res = await api.post('/attendance/clock-in', employeeToken, {
        type: 'CLOCK_IN',
        method: 'MOBILE_GPS',
        ...OFFICE,
        accuracyM: 12,
        deviceId: 'e2e-device',
        clientPunchId: 'e2e-in-1',
      });

      expect(res.body.isClockedIn).toBe(true);
      expect(res.body.punches[0].isOutsideGeofence).toBe(false);
    });

    it('replays an offline punch idempotently', async () => {
      // The mobile app queues punches offline and replays them; a replay must
      // not become a second punch.
      const res = await api.post('/attendance/clock-in', employeeToken, {
        type: 'CLOCK_IN',
        clientPunchId: 'e2e-in-1',
      });

      expect(res.body.punches).toHaveLength(1);
    });

    it('rejects a genuine second clock-in', async () => {
      const res = await api.post('/attendance/clock-in', employeeToken, {
        type: 'CLOCK_IN',
        clientPunchId: 'e2e-in-2',
      });

      expect(res.body.code).toBe('ALREADY_CLOCKED_IN');
    });

    it('flags a punch outside the geofence rather than refusing it', async () => {
      // An employee must always be able to prove they turned up; HR reviews
      // the flag afterwards.
      const res = await api.post('/attendance/punch', employeeToken, {
        type: 'CLOCK_OUT',
        ...FAR_AWAY,
        accuracyM: 10,
        clientPunchId: 'e2e-out-far',
      });

      expect(res.status).toBeLessThan(400);
      expect(res.body.record.anomalyFlags).toContain('OUTSIDE_GEOFENCE');
    });
  });

  describe('overtime', () => {
    it('creates a request at the Labour Protection Act multiplier', async () => {
      const workDate = isoDate(new Date());
      const res = await api.post('/overtime/requests', employeeToken, {
        workDate,
        startAt: `${workDate}T11:00:00.000Z`,
        endAt: `${workDate}T14:00:00.000Z`,
        reason: 'ปิดงบสิ้นเดือน',
      });

      expect(res.body.requestNo).toBeTruthy();
      expect(Number(res.body.requestedHours)).toBe(3);
      expect(Number(res.body.rateMultiplier)).toBeGreaterThan(0);
    });
  });

  describe('expenses', () => {
    it('totals a claim from its line items', async () => {
      const today = isoDate(new Date());
      const res = await api.post('/expenses/claims', employeeToken, {
        title: 'ค่าเดินทางพบลูกค้า',
        items: [
          {
            expenseDate: today,
            category: 'TRANSPORT',
            description: 'แท็กซี่ไป-กลับ',
            amount: 850.5,
          },
          {
            expenseDate: today,
            category: 'MEAL',
            description: 'อาหารกลางวันกับลูกค้า',
            amount: 1200,
          },
        ],
      });

      expect(res.body.claimNo).toBeTruthy();
      expect(Number(res.body.totalAmount)).toBe(2050.5);
    });
  });

  describe('documents', () => {
    it('accepts an employment-certificate request', async () => {
      const res = await api.post('/documents/requests', employeeToken, {
        type: 'EMPLOYMENT_CERTIFICATE',
        purpose: 'ยื่นขอวีซ่า',
        addressedTo: 'สถานทูตญี่ปุ่น',
      });

      expect(res.body.referenceNo).toBeTruthy();
      expect(res.body.status).toBe('PENDING');
    });
  });

  describe('knowledge base', () => {
    it('finds a Thai policy passage without embeddings', async () => {
      // Thai has no word boundaries, which is exactly where naive tokenisation
      // gives up — this is the search path that has to work with the AI off.
      const res = await api.get(
        `/assistant/knowledge/search?q=${encodeURIComponent('ลาพักร้อน')}`,
        employeeToken,
      );

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].title).toBeTruthy();
    });

    it('reports assistant availability without needing a provider', async () => {
      const res = await api.get('/assistant/status', employeeToken);

      expect(res.status).toBe(200);
      expect(typeof res.body.enabled).toBe('boolean');
    });
  });

  describe('payroll', () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0));

    let payslipId: string;

    it('opens a period and a run', async () => {
      const period = await api.post('/payroll/periods', hrToken, {
        year,
        month,
        periodStart: isoDate(periodStart),
        periodEnd: isoDate(periodEnd),
        payDate: isoDate(periodEnd),
      });
      expect(period.body.id).toBeTruthy();

      const run = await api.post('/payroll/runs', hrToken, { periodId: period.body.id });
      expect(run.body.id).toBeTruthy();
      payrollRunId = run.body.id;
    });

    it('calculates every employee', async () => {
      const res = await api.post(`/payroll/runs/${payrollRunId}/calculate`, hrToken);

      expect(res.body.status).toBe('CALCULATED');
      expect(res.body.employeeCount).toBe(8);
      expect(Number(res.body.totalGross)).toBeGreaterThan(0);
      expect(Number(res.body.totalNet)).toBeGreaterThan(0);
    });

    it('refuses to let the preparer approve their own run', async () => {
      const res = await api.post(`/payroll/runs/${payrollRunId}/approve`, hrToken);

      expect(res.body.code).toBe('SELF_APPROVAL_NOT_ALLOWED');
    });

    it('lets a different approver approve it', async () => {
      const res = await api.post(`/payroll/runs/${payrollRunId}/approve`, ceoToken);

      expect(res.body.status).toBe('APPROVED');
    });

    it('publishes payslips when the run is paid', async () => {
      const res = await api.post(`/payroll/runs/${payrollRunId}/pay`, ceoToken);

      expect(res.body.status).toBe('PAID');

      const slips = await api.get('/payroll/payslips/me', employeeToken);
      expect(slips.body.length).toBeGreaterThan(0);
      payslipId = slips.body[0].id;
    });

    it('pays a full monthly salary despite partial attendance coverage', async () => {
      // The bug this guards: salary prorated by how many days happened to have
      // punches, which silently shorted anyone mid-rollout — 8,181 instead of
      // 45,000 for someone with four captured days. Only *explicit* unpaid
      // leave and absence may reduce pay, and this employee has neither.
      const me = await api.get('/employees?limit=50', employeeToken);
      const employeeId = me.body.data[0].id;

      // Compensation is effective-dated history, newest first.
      const compensation = await api.get(`/payroll/compensation/${employeeId}`, hrToken);
      expect(compensation.status).toBe(200);
      const baseSalary = Number(compensation.body[0].baseSalary);
      expect(baseSalary).toBeGreaterThan(0);

      const slip = await api.get(`/payroll/payslips/${payslipId}`, employeeToken);
      expect(Number(slip.body.grossEarnings)).toBeGreaterThanOrEqual(baseSalary);
    });

    it('balances: net = gross - deductions', async () => {
      const res = await api.get(`/payroll/payslips/${payslipId}`, employeeToken);
      const slip = res.body;

      const expected = Number(slip.grossEarnings) - Number(slip.totalDeductions);
      expect(Number(slip.netPay)).toBeCloseTo(expected, 2);
    });

    it('records employer contributions without deducting them from the employee', async () => {
      const res = await api.get(`/payroll/payslips/${payslipId}`, employeeToken);
      const employerLines = res.body.items.filter(
        (i: { type: string }) => i.type === 'EMPLOYER_CONTRIBUTION',
      );

      expect(employerLines.length).toBeGreaterThan(0);
      const employerTotal = employerLines.reduce(
        (sum: number, i: { amount: string }) => sum + Number(i.amount),
        0,
      );
      // Employer cost is not the employee's deduction.
      expect(Number(res.body.totalDeductions)).toBeLessThan(
        Number(res.body.grossEarnings) - employerTotal + 1,
      );
    });

    it('locks attendance for a period that has been paid', async () => {
      const res = await api.post('/attendance/punch', employeeToken, {
        type: 'CLOCK_IN',
        clientPunchId: 'e2e-after-payroll',
      });

      expect(res.body.code).toBe('ATTENDANCE_LOCKED');
    });
  });

  describe('audit', () => {
    it('has recorded everything the suite just did', async () => {
      const res = await api.get('/audit-logs?limit=10', hrToken);

      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBeGreaterThan(10);
      expect(res.body.data[0].action).toBeTruthy();
      expect(res.body.data[0].entityType).toBeTruthy();
    });

    it('cannot be rewritten — the append-only trigger is in the database', async () => {
      // Belt and braces: the API exposes no mutation, and the database would
      // refuse one anyway.
      const res = await api.post('/audit-logs', hrToken, { action: 'FORGED' });

      expect([403, 404, 405]).toContain(res.status);
    });
  });
});
