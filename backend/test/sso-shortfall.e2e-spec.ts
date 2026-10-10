// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The social security ceiling by year and the shortfall report (CW-075).
 *
 * 2026 is the first year of the ฿17,500 ceiling. Runs paid before Cwork knew
 * it took 5% of ฿15,000; the report shows what HR owes the Social Security
 * Office for them, and changes nothing. The spec uses past months of 2026
 * only (March to June): the general spec opens a period for the current
 * month, which a later month would one day collide with.
 */
import {
  AuditAction,
  EmployeeStatus,
  PayFrequency,
  PayrollPeriodStatus,
  PayrollRunStatus,
  PayComponentType,
} from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { computeSocialSecurity, taxRulesFor } from 'src/modules/payroll/domain/thai-tax';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example'; // prepares runs, may export
const CEO = 'ceo@cwork.example'; // approves and pays
const HR_OFFICER = 'hr.officer@cwork.example'; // no payroll permissions
const YEAR = 2026;
const SALARY = 30_000;

const rules = taxRulesFor(YEAR);
const oldRules = taxRulesFor(YEAR - 1);
const owed = (wage: number) => computeSocialSecurity(wage, rules).employeeContribution.toNumber();
const paidOld = (wage: number) =>
  computeSocialSecurity(wage, oldRules).employeeContribution.toNumber();
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Row {
  employeeCode: string;
  month: number;
  wage: number;
  wageRebuilt: boolean;
  deductedEmployee: number;
  deductedEmployer: number;
  owed: number;
  employeeDifference: number;
  employerDifference: number;
}
interface Report {
  year: number;
  ceiling: number;
  payslipsChecked: number;
  rows: Row[];
  byMonth: Array<{ month: number; employee: number; employer: number }>;
  total: { employee: number; employer: number };
}

describe('Social security shortfall (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let payrollToken: string;
  let ceoToken: string;
  let organizationId: string;
  const people: Record<'monthly' | 'halves' | 'rebuilt' | 'exempt', string> = {
    monthly: '',
    halves: '',
    rebuilt: '',
    exempt: '',
  };
  const code = (key: keyof typeof people) => `SSO-${YEAR}-${key}`;

  const report = async (year = YEAR): Promise<Report> => {
    const res = await api.get(`/payroll/reports/sso-shortfall?year=${year}`, payrollToken);
    expect(res.status).toBe(200);
    return res.body as Report;
  };
  /** This spec's rows: other specs pay people in 2026 too. */
  const ours = (r: Report) => r.rows.filter((row) => row.employeeCode.startsWith(`SSO-${YEAR}-`));

  async function employee(key: keyof typeof people) {
    const { id } = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: code(key),
        firstNameTh: 'ประกัน',
        lastNameTh: key,
        nationalIdEnc: 'ENCRYPTED',
        status: EmployeeStatus.ACTIVE,
        hireDate: utc(`${YEAR - 1}-01-01`),
      },
      select: { id: true },
    });
    people[key] = id;
    return id;
  }

  /** A period and run made outside the API, for payslips Cwork wrote before CW-069 or CW-075. */
  async function storedRun(options: {
    month: number;
    half?: 0 | 1 | 2;
    periodStatus: PayrollPeriodStatus;
    runStatus: PayrollRunStatus;
  }) {
    const half = options.half ?? 0;
    const start = new Date(Date.UTC(YEAR, options.month - 1, half === 2 ? 16 : 1));
    const end = new Date(Date.UTC(YEAR, options.month - (half === 1 ? 1 : 0), half === 1 ? 15 : 0));
    const tag = `SSO${YEAR}${String(options.month).padStart(2, '0')}${half}${options.periodStatus[0]}`;
    const period = await prisma.payrollPeriod.create({
      data: {
        organizationId,
        code: tag,
        year: YEAR,
        month: options.month,
        payFrequency: half ? PayFrequency.SEMI_MONTHLY : PayFrequency.MONTHLY,
        half,
        periodStart: start,
        periodEnd: end,
        cutoffDate: end,
        payDate: end,
        status: options.periodStatus,
      },
    });
    return prisma.payrollRun.create({
      data: { organizationId, periodId: period.id, runNo: `RUN-${tag}`, status: options.runStatus },
    });
  }

  async function storedSlip(
    runId: string,
    employeeId: string,
    slip: { wage: number; storeWage: boolean; sso: number; compensationId?: string },
  ) {
    return prisma.payslip.create({
      data: {
        runId,
        employeeId,
        baseSalary: slip.wage,
        grossEarnings: slip.wage,
        totalDeductions: slip.sso,
        netPay: slip.wage - slip.sso,
        ssoEmployee: slip.sso,
        ssoEmployer: slip.sso,
        snapshot: {
          ...(slip.compensationId ? { compensationId: slip.compensationId } : {}),
          ...(slip.storeWage ? { ssoWage: slip.wage } : {}),
        },
        items: {
          create: [
            {
              code: 'BASE',
              name: 'เงินเดือน',
              type: PayComponentType.EARNING,
              amount: slip.wage,
            },
            {
              code: 'SSO',
              name: 'ประกันสังคม',
              type: PayComponentType.DEDUCTION,
              amount: slip.sso,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    payrollToken = await api.token(PAYROLL);
    ceoToken = await api.token(CEO);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));

    await employee('monthly');
    const pay = await api.post('/payroll/compensation', payrollToken, {
      employeeId: people.monthly,
      effectiveFrom: `${YEAR}-01-01`,
      baseSalary: SALARY,
    });
    expect(pay.status).toBe(201);
    await employee('halves');
    await employee('rebuilt');
    await employee('exempt');
  });

  afterAll(async () => {
    // Out of the employee lists other specs count; the payslips keep them.
    const ids = Object.values(people).filter(Boolean);
    if (ids.length) {
      await prisma?.employee.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: new Date() },
      });
    }
    await ctx?.close();
  });

  /** A month run through the API: created, calculated, approved and paid. */
  async function paidMonth(month: number) {
    const start = new Date(Date.UTC(YEAR, month - 1, 1));
    const end = new Date(Date.UTC(YEAR, month, 0));
    const period = await api.post('/payroll/periods', payrollToken, {
      year: YEAR,
      month,
      periodStart: iso(start),
      periodEnd: iso(end),
      payDate: iso(end),
    });
    expect(period.status).toBe(201);
    const run = await api.post('/payroll/runs', payrollToken, { periodId: period.body.id });
    expect(run.status).toBe(201);
    const calc = await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken);
    expect(calc.body.status).toBe('CALCULATED');
    return run.body.id as string;
  }

  const slipOf = (runId: string, employeeId: string) =>
    prisma.payslip.findUniqueOrThrow({
      where: { runId_employeeId: { runId, employeeId } },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    });

  it('deducts 5% of the 2026 ceiling from a ฿30,000 salary, for the employee and the employer', async () => {
    const runId = await paidMonth(3);
    const slip = await slipOf(runId, people.monthly);
    const { rate, maxMonthlyWage } = rules.socialSecurity;

    expect(maxMonthlyWage).toBe(17_500);
    expect(Number(slip.ssoEmployee)).toBe(maxMonthlyWage * rate);
    expect(Number(slip.ssoEmployer)).toBe(maxMonthlyWage * rate);
    // Calculated on the new ceiling, the month comes out even: not in the report.
    expect(ours(await report()).filter((row) => row.month === 3)).toEqual([]);
  });

  it('shows what a paid month on the old ceiling owes, and leaves the payslip and the run as they were', async () => {
    const runId = await paidMonth(4);
    expect((await api.post(`/payroll/runs/${runId}/approve`, ceoToken)).status).toBe(201);
    expect((await api.post(`/payroll/runs/${runId}/pay`, ceoToken)).status).toBe(201);

    // What a run paid before CW-075 deducted: 5% of ฿15,000.
    const old = paidOld(SALARY);
    const slip = await slipOf(runId, people.monthly);
    const delta = Number(slip.ssoEmployee) - old;
    await prisma.payslip.update({
      where: { id: slip.id },
      data: {
        ssoEmployee: old,
        ssoEmployer: old,
        totalDeductions: Number(slip.totalDeductions) - delta,
        netPay: Number(slip.netPay) + delta,
        items: { updateMany: { where: { code: 'SSO' }, data: { amount: old } } },
      },
    });

    const before = await prisma.payslip.findUniqueOrThrow({
      where: { id: slip.id },
      include: { items: true, run: true },
    });

    const rows = ours(await report()).filter((row) => row.month === 4);
    expect(rows).toEqual([
      expect.objectContaining({
        employeeCode: code('monthly'),
        wage: SALARY,
        wageRebuilt: false,
        deductedEmployee: old,
        deductedEmployer: old,
        owed: owed(SALARY),
        employeeDifference: owed(SALARY) - old,
        employerDifference: owed(SALARY) - old,
      }),
    ]);
    expect(owed(SALARY) - old).toBe(125);

    const after = await prisma.payslip.findUniqueOrThrow({
      where: { id: slip.id },
      include: { items: true, run: true },
    });
    expect(after).toEqual(before);
    expect(after.run.status).toBe(PayrollRunStatus.PAID);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.run.updatedAt).toEqual(before.run.updatedAt);
  });

  it('adds two paid halves up as one month before comparing', async () => {
    // Each half ฿9,000: ฿18,000 for the month. On the old rules the first half
    // took 5% of 9,000 and the second the rest of the month's 750.
    const first = await storedRun({
      month: 5,
      half: 1,
      periodStatus: PayrollPeriodStatus.LOCKED,
      runStatus: PayrollRunStatus.PAID,
    });
    const second = await storedRun({
      month: 5,
      half: 2,
      periodStatus: PayrollPeriodStatus.LOCKED,
      runStatus: PayrollRunStatus.PAID,
    });
    const firstTook = 9_000 * oldRules.socialSecurity.rate;
    await storedSlip(first.id, people.halves, { wage: 9_000, storeWage: true, sso: firstTook });
    await storedSlip(second.id, people.halves, {
      wage: 9_000,
      storeWage: true,
      sso: paidOld(18_000) - firstTook,
    });

    const rows = ours(await report()).filter((row) => row.employeeCode === code('halves'));
    expect(rows).toEqual([
      expect.objectContaining({
        month: 5,
        wage: 18_000,
        deductedEmployee: paidOld(18_000),
        owed: owed(18_000),
        employeeDifference: owed(18_000) - paidOld(18_000),
      }),
    ]);
  });

  it('rebuilds the wage of a locked payslip that never stored it, and leaves out what is not owed', async () => {
    // A locked period, its run not yet paid: counted. An open one: not yet final.
    const locked = await storedRun({
      month: 6,
      periodStatus: PayrollPeriodStatus.LOCKED,
      runStatus: PayrollRunStatus.APPROVED,
    });
    await storedSlip(locked.id, people.rebuilt, {
      wage: 20_000,
      storeWage: false,
      sso: paidOld(20_000),
    });
    const open = await storedRun({
      month: 6,
      half: 1,
      periodStatus: PayrollPeriodStatus.OPEN,
      runStatus: PayrollRunStatus.CALCULATED,
    });
    await storedSlip(open.id, people.rebuilt, { wage: 20_000, storeWage: true, sso: 0 });

    // Not covered by social security: nothing was owed, nothing is now.
    const { id: compensationId } = await prisma.employeeCompensation.create({
      data: {
        employeeId: people.exempt,
        effectiveFrom: utc(`${YEAR}-01-01`),
        baseSalary: 40_000,
        isSsoEligible: false,
      },
    });
    await storedSlip(locked.id, people.exempt, {
      wage: 40_000,
      storeWage: true,
      sso: 0,
      compensationId,
    });

    const rows = ours(await report()).filter((row) => row.month === 6);
    expect(rows).toEqual([
      expect.objectContaining({
        employeeCode: code('rebuilt'),
        wage: 20_000,
        wageRebuilt: true,
        employeeDifference: owed(20_000) - paidOld(20_000),
      }),
    ]);
  });

  it('totals by month and for the year', async () => {
    const r = await report();
    expect(r.year).toBe(YEAR);
    expect(r.ceiling).toBe(rules.socialSecurity.maxMonthlyWage);
    const sum = (rows: Row[], key: 'employeeDifference' | 'employerDifference') =>
      Math.round(rows.reduce((acc, row) => acc + row[key] * 100, 0)) / 100;
    for (const month of r.byMonth) {
      const rows = r.rows.filter((row) => row.month === month.month);
      expect(month.employee).toBe(sum(rows, 'employeeDifference'));
      expect(month.employer).toBe(sum(rows, 'employerDifference'));
    }
    expect(r.total.employee).toBe(sum(r.rows, 'employeeDifference'));
    expect(r.byMonth.map((m) => m.month)).toEqual(expect.arrayContaining([4, 5, 6]));
  });

  it('downloads the report as a CSV, recorded in the audit log', async () => {
    const res = await api.getRaw(
      `/payroll/reports/sso-shortfall?year=${YEAR}&format=csv&lang=en`,
      payrollToken,
    );
    expect(res.status).toBe(200);
    const text = res.body.toString('utf8');
    expect(text.startsWith('\uFEFFEmployee code,Name,Month,')).toBe(true);
    expect(text).toContain(
      `${code('monthly')},ประกัน monthly,${YEAR}-04,30000.00,750.00,750.00,875.00,125.00,125.00,`,
    );
    expect(text).toContain(`Year total,,${YEAR},`);

    const thai = await api.getRaw(
      `/payroll/reports/sso-shortfall?year=${YEAR}&format=csv`,
      payrollToken,
    );
    expect(thai.body.toString('utf8')).toContain('รหัสพนักงาน');

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId, entityType: 'SsoShortfallReport', action: AuditAction.EXPORT },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.summary).toContain(String(YEAR));
  });

  it('gives an empty report, not an error, for a year with no locked or paid run', async () => {
    const r = await report(2035);
    expect(r).toMatchObject({
      year: 2035,
      payslipsChecked: 0,
      rows: [],
      byMonth: [],
      total: { employee: 0, employer: 0 },
    });
  });

  it('is for payroll only', async () => {
    const officer = await api.token(HR_OFFICER);
    const res = await api.get(`/payroll/reports/sso-shortfall?year=${YEAR}`, officer);
    expect(res.status).toBe(403);
    const noYear = await api.get('/payroll/reports/sso-shortfall', payrollToken);
    expect(noYear.status).toBe(400);
  });
});
