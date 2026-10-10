// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Cash advances taken back by the regular runs (CW-070).
 *
 * One daily-wage employee, 400 a day, is paid November 2021 in two halves.
 * An advance is recorded once it has been paid, so the month is in the past.
 * Eleven weekdays in each half: 4,400 gross, 220 social security and no tax,
 * so 4,180 is left before advances in either half. No other spec touches 2021.
 */
import { AttendanceStatus, EmployeeStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example'; // records advances, prepares runs
const CEO = 'ceo@cwork.example'; // approves: whoever prepared a run cannot
const HR_OFFICER = 'hr.officer@cwork.example'; // no payroll permissions
const YEAR = 2021;

const date = (day: number) => `${YEAR}-11-${String(day).padStart(2, '0')}`;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Monday to Friday, 1–15 and 16–30 November 2021. */
const FIRST_HALF = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15];
const SECOND_HALF = [16, 17, 18, 19, 22, 23, 24, 25, 26, 29, 30];

interface Advance {
  id: string;
  amount: number;
  status: string;
  deducted: number;
  outstanding: number;
  locked: boolean;
}

describe('Cash advances (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let payrollToken: string;
  let ceoToken: string;
  let organizationId: string;
  let worker: string;
  let h1: { id: string };
  let h1Run: string;
  const ids: Record<string, string> = {};

  const record = (body: Record<string, unknown>) =>
    api.post('/payroll/advances', payrollToken, { employeeId: worker, ...body });

  const advances = async (): Promise<Record<string, Advance>> => {
    const res = await api.get(`/payroll/advances?employeeId=${worker}`, payrollToken);
    expect(res.status).toBe(200);
    const byId: Record<string, Advance> = {};
    for (const advance of res.body as Advance[]) byId[advance.id] = advance;
    return byId;
  };

  const slip = (runId: string) =>
    prisma.payslip.findUniqueOrThrow({
      where: { runId_employeeId: { runId, employeeId: worker } },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
    });

  /** The warnings about advances; the worker has no work location, which is flagged too. */
  const advanceWarnings = async (runId: string) =>
    ((await slip(runId)).warnings as Array<{ code: string }>).filter((w) =>
      w.code.startsWith('ADVANCE'),
    );

  const advanceLines = async (runId: string) =>
    (await slip(runId)).items
      .filter((item) => item.code === 'ADVANCE')
      .map((item) => [item.name, Number(item.amount)]);

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
    return res.body as { id: string };
  }

  const calculate = async (runId: string) => {
    const res = await api.post(`/payroll/runs/${runId}/calculate`, payrollToken);
    expect(res.status).toBe(201);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    payrollToken = await api.token(PAYROLL);
    ceoToken = await api.token(CEO);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));

    ({ id: worker } = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: 'ADV-2021-1',
        firstNameTh: 'เบิก',
        lastNameTh: 'ล่วงหน้า',
        nationalIdEnc: 'ENCRYPTED',
        status: EmployeeStatus.ACTIVE,
        hireDate: utc(`${YEAR}-01-01`),
      },
      select: { id: true },
    }));
    await prisma.attendanceRecord.createMany({
      data: [...FIRST_HALF, ...SECOND_HALF].map((day) => ({
        organizationId,
        employeeId: worker,
        workDate: utc(date(day)),
        status: AttendanceStatus.PRESENT,
      })),
    });
    const pay = await api.post('/payroll/compensation', payrollToken, {
      employeeId: worker,
      effectiveFrom: `${YEAR}-01-01`,
      baseSalary: 0,
      payFrequency: 'SEMI_MONTHLY',
      dailyRate: 400,
    });
    expect(pay.status).toBe(201);
  });

  afterAll(async () => {
    // Out of the employee lists other specs count; the payslips keep them.
    if (worker) {
      await prisma?.employee.update({ where: { id: worker }, data: { deletedAt: new Date() } });
    }
    await ctx?.close();
  });

  it('is recorded only by someone who runs payroll, and never for a day to come', async () => {
    const officer = await api.token(HR_OFFICER);
    const refused = await api.post('/payroll/advances', officer, {
      employeeId: worker,
      amount: 500,
      paidOn: date(3),
    });
    expect(refused.status).toBe(403);

    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const future = await record({ amount: 500, paidOn: tomorrow });
    expect(future.status).toBe(422);
    expect(future.body.code).toBe('ADVANCE_IN_FUTURE');
  });

  it('takes back two advances in one period, each on its own line', async () => {
    const a1 = await record({ amount: 500, paidOn: date(3) });
    const a2 = await record({ amount: 300, paidOn: date(8), method: 'BANK_TRANSFER' });
    expect(a1.status).toBe(201);
    expect(a2.status).toBe(201);
    expect(a1.body).toMatchObject({ method: 'CASH', outstanding: 500, locked: false });
    ids.a1 = a1.body.id;
    ids.a2 = a2.body.id;

    h1 = await period(1);
    const run = await api.post('/payroll/runs', payrollToken, { periodId: h1.id });
    h1Run = run.body.id;
    await calculate(h1Run);

    expect(await advanceLines(h1Run)).toEqual([
      ['หักเงินเบิกล่วงหน้า (3 พ.ย. 2564)', 500],
      ['หักเงินเบิกล่วงหน้า (8 พ.ย. 2564)', 300],
    ]);
    const payslip = await slip(h1Run);
    expect(Number(payslip.ssoEmployee)).toBe(220);
    expect(Number(payslip.netPay)).toBe(4180 - 800);
    expect(await advanceWarnings(h1Run)).toEqual([]);

    const list = await advances();
    expect(list[ids.a1]).toMatchObject({ deducted: 500, outstanding: 0 });
  });

  it('leaves net pay at zero and carries the rest, visibly, when an advance is too big', async () => {
    const a3 = await record({ amount: 5000, paidOn: date(10) });
    ids.a3 = a3.body.id;
    // Recorded after the run was calculated: in it once it is calculated again.
    await calculate(h1Run);

    const payslip = await slip(h1Run);
    expect(Number(payslip.netPay)).toBe(0);
    expect(await advanceWarnings(h1Run)).toEqual([
      { code: 'ADVANCE_CARRIED_OVER', params: { amount: 5000 - (4180 - 800) } },
    ]);
    const owing = await api.get(`/payroll/advances?employeeId=${worker}&owing=true`, payrollToken);
    expect(owing.body.map((a: Advance) => [a.id, a.outstanding])).toEqual([[ids.a3, 1620]]);
  });

  it('will not approve a run on an advance that changed after it was calculated', async () => {
    const changed = await api.patch(`/payroll/advances/${ids.a1}`, payrollToken, { amount: 600 });
    expect(changed.status).toBe(200);
    expect(changed.body.amount).toBe(600);

    const stale = await api.post(`/payroll/runs/${h1Run}/approve`, ceoToken);
    expect(stale.status).toBe(422);
    expect(stale.body.code).toBe('ADVANCES_CHANGED_SINCE_CALCULATION');

    await calculate(h1Run);
    expect((await advanceLines(h1Run))[0]).toEqual(['หักเงินเบิกล่วงหน้า (3 พ.ย. 2564)', 600]);
    expect((await api.post(`/payroll/runs/${h1Run}/approve`, ceoToken)).status).toBe(201);
  });

  it('cannot be changed or cancelled once an approved run has taken it back', async () => {
    const edit = await api.patch(`/payroll/advances/${ids.a1}`, payrollToken, { amount: 700 });
    expect(edit.status).toBe(422);
    expect(edit.body.code).toBe('ADVANCE_LOCKED');
    const cancel = await api.delete(`/payroll/advances/${ids.a2}`, payrollToken);
    expect(cancel.status).toBe(422);
    expect(cancel.body.code).toBe('ADVANCE_LOCKED');

    expect((await advances())[ids.a1]).toMatchObject({ locked: true, amount: 600 });
    expect((await api.post(`/payroll/runs/${h1Run}/pay`, ceoToken)).status).toBe(201);
  });

  it('takes the carried balance back in the next period, and a cancelled advance not at all', async () => {
    const a4 = await record({ amount: 100, paidOn: date(20) });
    ids.a4 = a4.body.id;
    const cancelled = await api.delete(`/payroll/advances/${ids.a4}`, payrollToken);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', outstanding: 0 });

    const h2 = await period(2);
    const first = await api.post('/payroll/runs', payrollToken, { periodId: h2.id });
    await calculate(first.body.id);
    // 4,180 less 5,000 − 3,280 = 1,720 carried from the first half.
    expect(await advanceLines(first.body.id)).toEqual([
      ['หักเงินเบิกล่วงหน้า (10 พ.ย. 2564)', 1720],
    ]);

    // A cancelled run gives back what it took.
    expect((await api.post(`/payroll/runs/${first.body.id}/cancel`, payrollToken)).status).toBe(
      201,
    );
    expect((await advances())[ids.a3]).toMatchObject({ outstanding: 1720 });

    const second = await api.post('/payroll/runs', payrollToken, { periodId: h2.id });
    await calculate(second.body.id);
    const payslip = await slip(second.body.id);
    expect(Number(payslip.netPay)).toBe(4180 - 1720);
    expect(await advanceWarnings(second.body.id)).toEqual([]);
    const list = await advances();
    expect(list[ids.a3]).toMatchObject({ deducted: 5000, outstanding: 0 });
    expect(list[ids.a4]).toMatchObject({ status: 'CANCELLED', deducted: 0 });
  });

  it('keeps someone who left still owing on the list of what is owed', async () => {
    const a5 = await record({ amount: 250, paidOn: date(26) });
    ids.a5 = a5.body.id;
    await prisma.employee.update({
      where: { id: worker },
      data: { status: EmployeeStatus.RESIGNED, deletedAt: new Date() },
    });

    const owing = await api.get('/payroll/advances?owing=true', payrollToken);
    const theirs = (owing.body as Array<Advance & { employee: { status: string } }>).find(
      (a) => a.id === ids.a5,
    );
    expect(theirs).toMatchObject({ outstanding: 250, employee: { status: 'RESIGNED' } });
  });

  it('is audited', async () => {
    const trail = await prisma.auditLog.findMany({
      where: { entityType: 'PayrollAdvance', entityId: { in: [ids.a1, ids.a4] } },
      select: { action: true, entityId: true },
    });
    expect(trail).toEqual(
      expect.arrayContaining([
        { action: 'CREATE', entityId: ids.a1 },
        { action: 'UPDATE', entityId: ids.a1 },
        { action: 'CREATE', entityId: ids.a4 },
        { action: 'DELETE', entityId: ids.a4 },
      ]),
    );
  });
});
