// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * A monthly salary is prorated over the employee's own work calendar (CW-082).
 *
 * December 2026 on a Monday-to-Friday week has 23 weekdays. Saturday the 5th,
 * Father's Day, moves to Monday the 7th (Labour Protection Act s.29), and
 * Thursday the 10th, Constitution Day, and Thursday the 31st, New Year's Eve,
 * are holidays, so the month has 20 working days: 23 less the 7th, the 10th
 * and the 31st. A salary of 20,000 makes a day worth exactly 1,000, which
 * keeps every figure below checkable by hand.
 * Everyone and everything the spec creates is removed afterwards.
 */
import { AttendanceStatus, EmployeeStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example';
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const dec = (day: number) => `2026-12-${String(day).padStart(2, '0')}`;

describe('Prorating a monthly salary over the work calendar (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let payrollToken: string;
  let organizationId: string;
  let fullMonth: string;
  let absentOnce: string;
  let joiner: string;
  let leaver: string;
  let periodId: string;
  let runId: string;
  const createdHolidays: string[] = [];

  async function holidayOn(date: string, name: string) {
    const existing = await prisma.holiday.findFirst({
      where: { organizationId, date: utc(date), workLocationId: null },
      select: { id: true },
    });
    if (existing) return;
    const { id } = await prisma.holiday.create({
      data: { organizationId, date: utc(date), name },
      select: { id: true },
    });
    createdHolidays.push(id);
  }

  async function person(code: string, hireDate: string, lastWorkingDate: string | null) {
    const { id } = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: code,
        firstNameTh: 'สัดส่วน',
        lastNameTh: code,
        nationalIdEnc: 'ENCRYPTED',
        status: EmployeeStatus.ACTIVE,
        hireDate: utc(hireDate),
        lastWorkingDate: lastWorkingDate ? utc(lastWorkingDate) : null,
      },
      select: { id: true },
    });
    const pay = await api.post('/payroll/compensation', payrollToken, {
      employeeId: id,
      effectiveFrom: hireDate > '2026-01-01' ? hireDate : '2026-01-01',
      baseSalary: 20_000,
    });
    expect(pay.status).toBe(201);
    return id;
  }

  async function slipOf(employeeId: string) {
    const slip = await prisma.payslip.findUniqueOrThrow({
      where: { runId_employeeId: { runId, employeeId } },
      include: { items: true },
    });
    const base = slip.items.find((item) => item.code === 'BASE')!;
    return {
      base: Number(base.amount),
      workedDays: Number(slip.workedDays),
      snapshot: slip.snapshot as { workingDaysInPeriod: number; employeeWorkingDays: number },
    };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    payrollToken = await api.token(PAYROLL);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({
      select: { id: true },
    }));
    await holidayOn(dec(5), 'วันพ่อแห่งชาติ');
    await holidayOn(dec(10), 'วันรัฐธรรมนูญ');
    await holidayOn(dec(31), 'วันสิ้นปี');

    fullMonth = await person('PRO-082-1', '2024-01-15', null);
    absentOnce = await person('PRO-082-2', '2024-01-15', null);
    joiner = await person('PRO-082-3', dec(9), null);
    leaver = await person('PRO-082-4', '2024-01-15', dec(4));
    await prisma.attendanceRecord.create({
      data: {
        organizationId,
        employeeId: absentOnce,
        workDate: utc(dec(14)),
        status: AttendanceStatus.ABSENT,
      },
    });

    const period = await api.post('/payroll/periods', payrollToken, {
      year: 2026,
      month: 12,
      periodStart: dec(1),
      periodEnd: dec(31),
      payDate: dec(31),
    });
    expect(period.status).toBe(201);
    periodId = period.body.id;
    const run = await api.post('/payroll/runs', payrollToken, { periodId });
    expect(run.status).toBe(201);
    runId = run.body.id;
    const calculated = await api.post(`/payroll/runs/${runId}/calculate`, payrollToken);
    expect(calculated.status).toBe(201);
  });

  afterAll(async () => {
    if (prisma) {
      if (runId) await prisma.payrollRun.delete({ where: { id: runId } });
      if (periodId) await prisma.payrollPeriod.delete({ where: { id: periodId } });
      await prisma.holiday.deleteMany({ where: { id: { in: createdHolidays } } });
      const people = [fullMonth, absentOnce, joiner, leaver].filter(Boolean);
      await prisma.attendanceRecord.deleteMany({ where: { employeeId: { in: people } } });
      // Out of the lists other specs count.
      await prisma.employee.updateMany({
        where: { id: { in: people } },
        data: { deletedAt: new Date(), status: EmployeeStatus.TERMINATED },
      });
    }
    await ctx?.close();
  });

  it('pays a full month in full, to the satang', async () => {
    expect(await slipOf(fullMonth)).toMatchObject({
      base: 20_000,
      workedDays: 20,
      snapshot: { workingDaysInPeriod: 20, employeeWorkingDays: 20 },
    });
  });

  it('values an absent day over the 20 working days, not 21', async () => {
    // 19 of 20 days: 20,000 × 19 ÷ 20 = 19,000, a day worth 1,000. Over 21
    // days it was 20 of 21 = 19,047.62, a day worth 952.38.
    expect(await slipOf(absentOnce)).toMatchObject({ base: 19_000, workedDays: 19 });
  });

  it('prorates a joiner on the 9th over December without the 7th and the 10th', async () => {
    // Worked: the 9th and 11th, then the 14th to 18th, 21st to 25th and 28th
    // to 30th = 2 + 5 + 5 + 3 = 15 of 20. 20,000 × 15 ÷ 20 = 15,000. The 7th is
    // before they joined, yet still comes out of the month (over 21 it was
    // 14,285.71).
    expect(await slipOf(joiner)).toMatchObject({
      base: 15_000,
      workedDays: 15,
      snapshot: { workingDaysInPeriod: 20, employeeWorkingDays: 15 },
    });
  });

  it('prorates a leaver after the 4th over the same 20 days', async () => {
    // The 1st to the 4th, four days of 20: 20,000 × 4 ÷ 20 = 4,000. Over 21
    // it was 3,809.52.
    expect(await slipOf(leaver)).toMatchObject({
      base: 4_000,
      workedDays: 4,
      snapshot: { workingDaysInPeriod: 20, employeeWorkingDays: 4 },
    });
  });
});
