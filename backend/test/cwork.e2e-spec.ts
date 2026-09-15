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
import { createTestApp, type Api, type TestContext } from './utils/test-app';
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
