// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Daily wages paid in two halves of the month (CW-069, phase A).
 *
 * Two daily-wage employees are paid November 2031 in a first and a second half,
 * with nothing mocked: attendance, a holiday where one of them works, an
 * opening balance for the other. The figures are worked by hand in the
 * comments; none come from the pilot's Excel file, which has not arrived yet.
 * No other spec touches 2031.
 */
import { AttendanceStatus, EmployeeStatus, PayrollRunStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { computeSocialSecurity, taxRulesFor } from 'src/modules/payroll/domain/thai-tax';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example'; // prepares runs, manages compensation
const CEO = 'ceo@cwork.example'; // approves: whoever prepared a run cannot
const HR = 'hr.manager@cwork.example'; // manages work locations
const YEAR = 2031;

const date = (day: number, month = 11) =>
  `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('Daily wages paid twice a month (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let payrollToken: string;
  let ceoToken: string;
  let hrToken: string;
  let organizationId: string;
  let locationId: string;
  /** Works at the factory, 500 a day. */
  let factoryWorker: string;
  /** No work location; was paid January to October before Cwork. */
  let movedOver: string;

  async function newEmployee(code: string, workLocationId: string | null) {
    const { id } = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: code,
        firstNameTh: 'รายวัน',
        lastNameTh: code,
        nationalIdEnc: 'ENCRYPTED',
        status: EmployeeStatus.ACTIVE,
        hireDate: utc(`${YEAR}-01-01`),
        workLocationId,
      },
      select: { id: true },
    });
    return id;
  }

  async function attend(employeeId: string, days: number[], status: AttendanceStatus) {
    await prisma.attendanceRecord.createMany({
      data: days.map((day) => ({
        organizationId,
        employeeId,
        workDate: utc(date(day)),
        status,
      })),
    });
  }

  const compensation = (body: Record<string, unknown>) =>
    api.post('/payroll/compensation', payrollToken, body);

  async function period(half: 1 | 2) {
    const res = await api.post('/payroll/periods', payrollToken, {
      year: YEAR,
      month: 11,
      payFrequency: 'SEMI_MONTHLY',
      half,
      periodStart: half === 1 ? date(1) : date(16),
      periodEnd: half === 1 ? date(15) : date(30),
      payDate: half === 1 ? date(16) : date(30),
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; code: string };
  }

  async function calculatedRun(periodId: string) {
    const run = await api.post('/payroll/runs', payrollToken, { periodId });
    expect(run.status).toBe(201);
    const calculated = await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken);
    return { runId: run.body.id as string, calculated };
  }

  const slipOf = async (runId: string, employeeId: string) =>
    prisma.payslip.findUniqueOrThrow({
      where: { runId_employeeId: { runId, employeeId } },
      include: { items: true },
    });

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    payrollToken = await api.token(PAYROLL);
    ceoToken = await api.token(CEO);
    hrToken = await api.token(HR);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));

    const location = await api.post('/work-locations', hrToken, {
      code: 'FAC-2031',
      name: 'โรงงานบางนา',
    });
    expect(location.status).toBe(201);
    locationId = location.body.id;
    factoryWorker = await newEmployee('DW-2031-1', locationId);
    movedOver = await newEmployee('DW-2031-2', null);
  });

  afterAll(async () => {
    // Out of the employee lists other specs count; the payslips keep them.
    await prisma?.employee.updateMany({
      where: { id: { in: [factoryWorker, movedOver].filter(Boolean) } },
      data: { deletedAt: new Date() },
    });
    await ctx?.close();
  });

  describe('a month has one monthly period and one of each half', () => {
    it('refuses a second monthly period for the same month, under any code', async () => {
      const body = {
        year: YEAR,
        month: 3,
        periodStart: date(1, 3),
        periodEnd: date(31, 3),
        payDate: date(31, 3),
      };
      expect((await api.post('/payroll/periods', payrollToken, body)).status).toBe(201);

      const again = await api.post('/payroll/periods', payrollToken, {
        ...body,
        code: `${YEAR}-03-again`,
      });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('PAYROLL_PERIOD_EXISTS');

      // And the database refuses it too, if two requests race past the check.
      await expect(
        prisma.payrollPeriod.create({
          data: {
            organizationId,
            code: `${YEAR}-03-raced`,
            year: YEAR,
            month: 3,
            periodStart: utc(date(1, 3)),
            periodEnd: utc(date(31, 3)),
            cutoffDate: utc(date(31, 3)),
            payDate: utc(date(31, 3)),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('asks which half a semi-monthly period is, and only for one', async () => {
      const base = {
        year: YEAR,
        month: 4,
        periodStart: date(1, 4),
        periodEnd: date(15, 4),
        payDate: date(16, 4),
      };
      const noHalf = await api.post('/payroll/periods', payrollToken, {
        ...base,
        payFrequency: 'SEMI_MONTHLY',
      });
      expect(noHalf.body.code).toBe('INVALID_PERIOD_HALF');
      const monthlyHalf = await api.post('/payroll/periods', payrollToken, { ...base, half: 1 });
      expect(monthlyHalf.body.code).toBe('INVALID_PERIOD_HALF');
      const daily = await api.post('/payroll/periods', payrollToken, {
        ...base,
        payFrequency: 'DAILY',
      });
      expect(daily.status).toBe(400);
    });

    it('holds a half to its days: the 1st to the 15th, the 16th to the month end', async () => {
      const wrong = await api.post('/payroll/periods', payrollToken, {
        year: YEAR,
        month: 4,
        payFrequency: 'SEMI_MONTHLY',
        half: 2,
        periodStart: date(15, 4),
        periodEnd: date(30, 4),
        payDate: date(30, 4),
      });
      expect(wrong.body.code).toBe('INVALID_PERIOD_DATES');
      expect(wrong.body.details).toEqual({ periodStart: date(16, 4), periodEnd: date(30, 4) });
    });
  });

  describe('a daily wage', () => {
    it('is paid instead of a salary, twice a month, and nothing else is accepted', async () => {
      const base = { employeeId: factoryWorker, effectiveFrom: `${YEAR}-01-01` };
      const cases: Array<[Record<string, unknown>, string]> = [
        [
          { baseSalary: 9_000, dailyRate: 500, payFrequency: 'SEMI_MONTHLY' },
          'DAILY_RATE_WITH_SALARY',
        ],
        [
          { baseSalary: 0, dailyRate: 500, payFrequency: 'MONTHLY' },
          'DAILY_RATE_NEEDS_SEMI_MONTHLY',
        ],
        [{ baseSalary: 0, dailyRate: 500 }, 'DAILY_RATE_NEEDS_SEMI_MONTHLY'],
        [{ baseSalary: 0, dailyRate: 500, payFrequency: 'DAILY' }, 'PAY_FREQUENCY_NOT_SUPPORTED'],
        [{ baseSalary: 0, payFrequency: 'SEMI_MONTHLY' }, 'DAILY_RATE_REQUIRED'],
      ];
      for (const [body, code] of cases) {
        const res = await compensation({ ...base, ...body });
        expect({ body, code: res.body.code }).toEqual({ body, code });
      }
    });

    it('is checked against the work location minimum, and says when there is none', async () => {
      const notSet = await compensation({
        employeeId: factoryWorker,
        effectiveFrom: `${YEAR}-01-01`,
        baseSalary: 0,
        dailyRate: 500,
        payFrequency: 'SEMI_MONTHLY',
      });
      expect(notSet.status).toBe(201);
      expect(notSet.body.warnings).toEqual([
        { code: 'MINIMUM_WAGE_NOT_SET', params: { location: 'โรงงานบางนา' } },
      ]);

      const noSource = await api.patch(`/work-locations/${locationId}`, hrToken, {
        minimumDailyWage: 400,
      });
      expect(noSource.body.code).toBe('MINIMUM_WAGE_SOURCE_REQUIRED');
      const set = await api.patch(`/work-locations/${locationId}`, hrToken, {
        minimumDailyWage: 400,
        minimumDailyWageSource: 'ประกาศคณะกรรมการค่าจ้าง (ฉบับที่ 14)',
      });
      expect(set.status).toBe(200);

      const below = await compensation({
        employeeId: factoryWorker,
        effectiveFrom: `${YEAR}-06-01`,
        baseSalary: 0,
        dailyRate: 350,
        payFrequency: 'SEMI_MONTHLY',
      });
      expect(below.body.warnings).toEqual([
        {
          code: 'BELOW_MINIMUM_WAGE',
          params: {
            dailyRate: 350,
            minimum: 400,
            location: 'โรงงานบางนา',
            source: 'ประกาศคณะกรรมการค่าจ้าง (ฉบับที่ 14)',
          },
        },
      ]);

      const fixed = await compensation({
        employeeId: factoryWorker,
        effectiveFrom: `${YEAR}-10-01`,
        baseSalary: 0,
        dailyRate: 500,
        payFrequency: 'SEMI_MONTHLY',
      });
      expect(fixed.body.warnings).toEqual([]);

      const noLocation = await compensation({
        employeeId: movedOver,
        effectiveFrom: `${YEAR}-01-01`,
        baseSalary: 0,
        dailyRate: 2_600,
        payFrequency: 'SEMI_MONTHLY',
      });
      expect(noLocation.body.warnings).toEqual([{ code: 'NO_WORK_LOCATION' }]);
    });
  });

  describe('November in two halves', () => {
    let firstHalfRun: string;
    /** Created early, refused until the first half was paid. */
    let secondHalfRun: string;

    beforeAll(async () => {
      // November 2031 starts on a Saturday. The factory worker's first half:
      // Mon 3 – Fri 7 present, but Wed 5 left without clocking out; Mon 10
      // absent; Tue 11 a holiday at the factory; Wed 12 – Thu 13 present; Fri
      // 14 not closed. Sat 15 is another factory holiday, on the day off.
      await attend(factoryWorker, [3, 4, 6, 7, 12, 13], AttendanceStatus.PRESENT);
      await attend(factoryWorker, [5], AttendanceStatus.INCOMPLETE);
      await attend(factoryWorker, [10], AttendanceStatus.ABSENT);
      await prisma.holiday.createMany({
        data: [
          {
            organizationId,
            workLocationId: locationId,
            date: utc(date(11)),
            name: 'วันหยุดโรงงาน',
          },
          { organizationId, workLocationId: locationId, date: utc(date(15)), name: 'วันหยุดเสาร์' },
        ],
      });
      // Second half: every weekday present.
      await attend(
        factoryWorker,
        [17, 18, 19, 20, 21, 24, 25, 26, 27, 28],
        AttendanceStatus.PRESENT,
      );

      // The other one was paid January to October before Cwork, 52,000 a
      // month: 520,000 taxable, 1,916.67 withheld a month, 750 social security.
      await prisma.payrollOpeningBalance.create({
        data: {
          organizationId,
          employeeId: movedOver,
          taxYear: YEAR,
          throughMonth: 10,
          taxableIncome: 520_000,
          withholdingTax: 19_166.7,
          ssoEmployee: 7_500,
        },
      });
      await attend(
        movedOver,
        [3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 24, 25, 26, 27, 28],
        AttendanceStatus.PRESENT,
      );
    });

    it('pays only daily-wage employees in a half, and refuses the second before the first is paid', async () => {
      const first = await period(1);
      const second = await period(2);
      expect([first.code, second.code]).toEqual([`${YEAR}-11-H1`, `${YEAR}-11-H2`]);

      const { runId, calculated } = await calculatedRun(first.id);
      expect(calculated.status).toBe(201);
      firstHalfRun = runId;
      const slips = await prisma.payslip.findMany({
        where: { runId },
        select: { employeeId: true },
      });
      expect(slips.map((s) => s.employeeId).sort()).toEqual([factoryWorker, movedOver].sort());

      const early = await calculatedRun(second.id);
      expect(early.calculated.body.code).toBe('FIRST_HALF_NOT_PAID');
      secondHalfRun = early.runId;

      // The run page can say why: the first half is calculated, not paid.
      const page = await api.get(`/payroll/runs/${secondHalfRun}`, payrollToken);
      expect(page.body.firstHalf).toMatchObject({ id: runId, status: PayrollRunStatus.CALCULATED });
    });

    it('counts the first half by attendance and holidays, and flags what HR should check', async () => {
      // Paid: 3, 4, 5 (incomplete), 6, 7, 11 (holiday), 12, 13 = 8 days × 500.
      const slip = await slipOf(firstHalfRun, factoryWorker);
      expect(Number(slip.workedDays)).toBe(8);
      expect(Number(slip.grossEarnings)).toBe(4_000);
      expect(Number(slip.ssoEmployee)).toBe(200); // 5% of 4,000, no floor
      expect(slip.warnings).toEqual([
        { code: 'INCOMPLETE_PUNCH_COUNTED', params: { days: 1, dates: date(5) } },
        { code: 'NO_ATTENDANCE_RECORD', params: { days: 1, dates: date(14) } },
        { code: 'HOLIDAY_ON_DAY_OFF', params: { days: 1, dates: date(15) } },
      ]);

      // The run page reads the warnings with the payslips.
      const run = await api.get(`/payroll/runs/${firstHalfRun}`, payrollToken);
      const onPage = run.body.payslips.find(
        (p: { employeeId: string }) => p.employeeId === factoryWorker,
      );
      expect(onPage.warnings).toHaveLength(3);
      const other = run.body.payslips.find(
        (p: { employeeId: string }) => p.employeeId === movedOver,
      );
      expect(other.warnings).toEqual([{ code: 'NO_WORK_LOCATION' }]);
    });

    it('builds the second half on the paid first half, so the month adds up', async () => {
      expect((await api.post(`/payroll/runs/${firstHalfRun}/approve`, ceoToken)).status).toBe(201);
      const paid = await api.post(`/payroll/runs/${firstHalfRun}/pay`, ceoToken);
      expect(paid.body.status).toBe(PayrollRunStatus.PAID);
      const page = await api.get(`/payroll/runs/${secondHalfRun}`, payrollToken);
      expect(page.body.firstHalf.status).toBe(PayrollRunStatus.PAID);

      // The run refused earlier calculates now.
      const runId = secondHalfRun;
      const calculated = await api.post(`/payroll/runs/${runId}/calculate`, payrollToken);
      expect(calculated.status).toBe(201);

      // Ten days × 500 = 5,000. The month, 9,000, contributes 450; the first
      // half took 200, so the second takes 250: what a monthly run would take.
      const factory = await slipOf(runId, factoryWorker);
      expect(Number(factory.grossEarnings)).toBe(5_000);
      expect(Number(factory.ssoEmployee)).toBe(250);
      expect(factory.warnings).toEqual([]);

      // The opening balance is the year so far. November projects 520,000 +
      // 52,000 × 2 = 624,000: net 624,000 − 100,000 − 60,000 − 10,500 (the
      // social security relief from 2026) = 453,500, tax 22,850; less 19,166.70
      // withheld, 3,683.30 over the last two months is 1,841.65 for November.
      // The first half withheld half of it, 920.83 (half up); the second
      // withholds the rest, 920.82.
      const firstSlip = await slipOf(firstHalfRun, movedOver);
      const secondSlip = await slipOf(runId, movedOver);
      expect(Number(firstSlip.grossEarnings)).toBe(26_000); // 10 days × 2,600
      expect(Number(firstSlip.withholdingTax)).toBe(920.83);
      expect(Number(secondSlip.withholdingTax)).toBe(920.82);
      // Both halves are over the 2031 ceiling wage, so the first already pays
      // the month's contribution and the second takes none. From the rules for
      // the year, not written down (CW-075).
      const rules = taxRulesFor(YEAR);
      const { rate, maxMonthlyWage } = rules.socialSecurity;
      expect(Number(firstSlip.ssoEmployee)).toBe(maxMonthlyWage * rate);
      expect(Number(secondSlip.ssoEmployee)).toBe(0);
      expect(Number(firstSlip.ssoEmployee) + Number(secondSlip.ssoEmployee)).toBe(
        computeSocialSecurity(52_000, rules).employeeContribution.toNumber(),
      );
    });

    it('leaves daily-wage employees out of the monthly run', async () => {
      const monthly = await api.post('/payroll/periods', payrollToken, {
        year: YEAR,
        month: 11,
        periodStart: date(1),
        periodEnd: date(30),
        payDate: date(30),
      });
      expect(monthly.status).toBe(201);
      const { runId, calculated } = await calculatedRun(monthly.body.id);
      expect(calculated.status).toBe(201);
      const ids = (
        await prisma.payslip.findMany({ where: { runId }, select: { employeeId: true } })
      ).map((s) => s.employeeId);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).not.toContain(factoryWorker);
      expect(ids).not.toContain(movedOver);
    });
  });
});
