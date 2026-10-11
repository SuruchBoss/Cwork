// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * A holiday's substitute day is the same day to attendance, leave, overtime
 * and payroll (CW-081).
 *
 * Saturday 5 December 2026, Father's Day, falls on the weekly day off of a
 * Monday-to-Friday week, so it moves to Monday the 7th (Labour Protection Act
 * s.29). The spec checks a salaried and a daily-wage employee first with no
 * substitute entered, then with HR entering the 7th as the substitute, and
 * expects the same answers both times. Everyone and everything it creates is
 * removed afterwards.
 */
import { randomUUID } from 'node:crypto';
import { AttendanceStatus, EmployeeStatus, OvertimeStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { AttendanceService } from 'src/modules/attendance/attendance.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example';
const HR = 'hr.officer@cwork.example';
const PASSWORD = `Substitute-${randomUUID()}`;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const dec = (day: number) => `2026-12-${String(day).padStart(2, '0')}`;

describe('Substitute holidays across the system (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let attendance: AttendanceService;
  let hrToken: string;
  let payrollToken: string;
  let organizationId: string;
  let timezone: string;
  /** Monthly salary, no account. */
  let salaried: string;
  /** 500 a day, paid twice a month, signs in to ask for overtime. */
  let dailyWorker: string;
  let dailyWorkerToken: string;
  let fathersDay: string;
  let periodId: string;
  let runId: string;
  let sickLeaveTypeId: string;
  const createdHolidays: string[] = [];

  /** The holiday on a date, created if this installation's seed has none for 2026. */
  async function holidayOn(date: string, name: string): Promise<string> {
    const existing = await prisma.holiday.findFirst({
      where: { organizationId, date: utc(date), workLocationId: null },
      select: { id: true },
    });
    if (existing) return existing.id;
    const { id } = await prisma.holiday.create({
      data: { organizationId, date: utc(date), name },
      select: { id: true },
    });
    createdHolidays.push(id);
    return id;
  }

  const statusOn = async (employeeId: string, day: number) => {
    await attendance.recalculateDay(organizationId, employeeId, utc(dec(day)), timezone);
    const record = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: utc(dec(day)) } },
      select: { status: true },
    });
    return record.status;
  };

  const sickLeave = (from: number, to: number) =>
    api.post('/leave/requests/record/preview', hrToken, {
      employeeId: salaried,
      leaveTypeId: sickLeaveTypeId,
      startDate: dec(from),
      endDate: dec(to),
    });

  const askOvertime = (startHour: number, hours: number) =>
    api.post('/overtime/requests', dailyWorkerToken, {
      workDate: dec(7),
      startAt: `${dec(7)}T${String(startHour - 7).padStart(2, '0')}:00:00Z`,
      endAt: `${dec(7)}T${String(startHour - 7 + hours).padStart(2, '0')}:00:00Z`,
      reason: 'นับสต็อกสิ้นปี',
    });

  async function dailyWorkerSlip() {
    const calculated = await api.post(`/payroll/runs/${runId}/calculate`, payrollToken);
    expect(calculated.status).toBe(201);
    return prisma.payslip.findUniqueOrThrow({
      where: { runId_employeeId: { runId, employeeId: dailyWorker } },
      include: { items: true },
    });
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    attendance = ctx.app.get(AttendanceService);
    hrToken = await api.token(HR);
    payrollToken = await api.token(PAYROLL);
    ({ id: organizationId, timezone } = await prisma.organization.findFirstOrThrow({
      select: { id: true, timezone: true },
    }));
    fathersDay = await holidayOn(dec(5), 'วันพ่อแห่งชาติ');
    await holidayOn(dec(10), 'วันรัฐธรรมนูญ');
    ({ id: sickLeaveTypeId } = await prisma.leaveType.findFirstOrThrow({
      where: { organizationId, code: 'SICK' },
      select: { id: true },
    }));

    ({ id: salaried } = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: 'SUB-081-1',
        firstNameTh: 'เงินเดือน',
        lastNameTh: 'ชดเชย',
        nationalIdEnc: 'ENCRYPTED',
        status: EmployeeStatus.ACTIVE,
        hireDate: utc('2024-01-15'),
      },
      select: { id: true },
    }));

    const email = `daily-${randomUUID().slice(0, 8)}@cwork.example`;
    const created = await api.post('/employees', hrToken, {
      firstNameTh: 'รายวัน',
      lastNameTh: 'ชดเชย',
      hireDate: '2024-01-15',
      workEmail: email,
      createUserAccount: true,
    });
    expect(created.status).toBe(201);
    dailyWorker = created.body.id;
    await prisma.user.update({
      where: { id: created.body.userId },
      data: {
        passwordHash: await ctx.app.get(CryptoService).hashPassword(PASSWORD),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const login = await api.post('/auth/login', undefined, { email, password: PASSWORD });
    expect(login.status).toBe(200);
    dailyWorkerToken = login.body.accessToken;

    const pay = await api.post('/payroll/compensation', payrollToken, {
      employeeId: dailyWorker,
      effectiveFrom: '2026-01-01',
      baseSalary: 0,
      dailyRate: 500,
      payFrequency: 'SEMI_MONTHLY',
    });
    expect(pay.status).toBe(201);

    // December's first half: present every working day but Tuesday 1 to
    // Tuesday 15 except Monday 7 (the substitute), Tuesday 8 (absent) and
    // Thursday 10 (Constitution Day).
    await prisma.attendanceRecord.createMany({
      data: [
        ...[1, 2, 3, 4, 9, 11, 14, 15].map((day) => ({
          organizationId,
          employeeId: dailyWorker,
          workDate: utc(dec(day)),
          status: AttendanceStatus.PRESENT,
        })),
        {
          organizationId,
          employeeId: dailyWorker,
          workDate: utc(dec(8)),
          status: AttendanceStatus.ABSENT,
        },
      ],
    });

    const period = await api.post('/payroll/periods', payrollToken, {
      year: 2026,
      month: 12,
      payFrequency: 'SEMI_MONTHLY',
      half: 1,
      periodStart: dec(1),
      periodEnd: dec(15),
      payDate: dec(16),
    });
    expect(period.status).toBe(201);
    periodId = period.body.id;
    const run = await api.post('/payroll/runs', payrollToken, { periodId });
    expect(run.status).toBe(201);
    runId = run.body.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (runId) await prisma.payrollRun.delete({ where: { id: runId } });
      if (periodId) await prisma.payrollPeriod.delete({ where: { id: periodId } });
      await prisma.holiday.deleteMany({ where: { substituteForId: fathersDay ?? '' } });
      await prisma.holiday.deleteMany({ where: { id: { in: createdHolidays } } });
      const people = [salaried, dailyWorker].filter(Boolean);
      await prisma.attendanceRecord.deleteMany({ where: { employeeId: { in: people } } });
      await prisma.overtimeRequest.deleteMany({ where: { employeeId: { in: people } } });
      // Out of the lists other specs count.
      await prisma.employee.updateMany({
        where: { id: { in: people } },
        data: { deletedAt: new Date(), status: EmployeeStatus.TERMINATED },
      });
      await prisma.user.updateMany({
        where: { employee: { id: { in: people } } },
        data: { status: 'DISABLED', sessionsValidFrom: new Date() },
      });
    }
    await ctx?.close();
  });

  /** The answers both cases must give. */
  async function expectMondayIsTheSubstitute() {
    // A salaried employee who stays home on the 7th is not absent: the day
    // reads as a holiday, which the nightly close-out leaves alone. The 8th
    // is an ordinary working day, which it would mark absent.
    expect(await statusOn(salaried, 7)).toBe(AttendanceStatus.HOLIDAY);
    expect(await statusOn(salaried, 8)).toBe(AttendanceStatus.NOT_STARTED);

    // A day of leave on the 7th takes none; the 7th and 8th take one.
    const monday = await sickLeave(7, 7);
    expect(monday.status).toBe(422);
    expect(monday.body.code).toBe('NO_WORKING_DAYS_SELECTED');
    const both = await sickLeave(7, 8);
    expect(both.status).toBe(201);
    expect(both.body.totalDays).toBe(1);

    // Paid: eight days worked, Constitution Day on the 10th, and the 7th for
    // the 5th, once; the 8th was a working day and is not paid. 10 × 500 =
    // 5,000. Four hours on the 7th at the holiday rate: 500 ÷ 8 = 62.50 an
    // hour, × 2 (the organisation's holiday rate, above the daily-wage
    // minimum of 1) × 4 = 500.
    const slip = await dailyWorkerSlip();
    expect(Number(slip.workedDays)).toBe(10);
    expect(Number(slip.grossEarnings)).toBe(5_500);
    expect(
      slip.items.filter((i) => i.code.startsWith('OT_')).map((i) => [i.code, Number(i.amount)]),
    ).toEqual([['OT_HOLIDAY', 500]]);
    expect(slip.warnings).toEqual([
      { code: 'SUBSTITUTE_HOLIDAY', params: { days: 1, dates: `${dec(5)} → ${dec(7)}` } },
      { code: 'NO_WORK_LOCATION' },
    ]);
  }

  it('works out the substitute by itself when HR entered none', async () => {
    // Asked for on the 7th, overtime is holiday work at the holiday rate.
    const overtime = await askOvertime(9, 4);
    expect(overtime.status).toBe(201);
    expect(overtime.body).toMatchObject({ type: 'HOLIDAY', rateMultiplier: '2' });
    await prisma.overtimeRequest.update({
      where: { id: overtime.body.id },
      data: { status: OvertimeStatus.APPROVED, approvedHours: 4 },
    });

    const holidays = await api.get('/holidays?year=2026', hrToken);
    const fifth = holidays.body.find((h: { id: string }) => h.id === fathersDay);
    expect(fifth).toMatchObject({ substituteForId: null, substituteOnWeekdays: dec(7) });

    await expectMondayIsTheSubstitute();
  });

  it('gives the same answers when HR enters the 7th as the substitute', async () => {
    const entered = await api.post('/holidays', await api.token('hr.manager@cwork.example'), {
      date: dec(7),
      name: 'ชดเชยวันพ่อแห่งชาติ',
      substituteForId: fathersDay,
    });
    expect(entered.status).toBe(201);
    const holidays = await api.get('/holidays?year=2026', hrToken);
    const seventh = holidays.body.find((h: { id: string }) => h.id === entered.body.id);
    expect(seventh).toMatchObject({
      substituteForId: fathersDay,
      substituteFor: { id: fathersDay },
      substituteOnWeekdays: null,
    });
    // The holiday itself no longer carries the automatic day: HR has chosen one.
    const fifth = holidays.body.find((h: { id: string }) => h.id === fathersDay);
    expect(fifth.substituteOnWeekdays).toBeNull();

    // Another request on the 7th is still holiday work.
    const more = await askOvertime(15, 1);
    expect(more.body).toMatchObject({ type: 'HOLIDAY' });
    await prisma.overtimeRequest.delete({ where: { id: more.body.id } });

    await expectMondayIsTheSubstitute();
  });

  it('keeps the substitute tied to its holiday', async () => {
    const hrManager = await api.token('hr.manager@cwork.example');
    const second = await api.post('/holidays', hrManager, {
      date: dec(8),
      name: 'ชดเชยซ้ำ',
      substituteForId: fathersDay,
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('HOLIDAY_ALREADY_HAS_SUBSTITUTE');

    const before = await api.post('/holidays', hrManager, {
      date: dec(4),
      name: 'ชดเชยก่อนวันหยุด',
      substituteForId: fathersDay,
    });
    expect(before.status).toBe(422);
    expect(before.body.code).toBe('SUBSTITUTE_NOT_AFTER_HOLIDAY');

    const removed = await api.delete(`/holidays/${fathersDay}`, hrManager);
    expect(removed.status).toBe(409);
    expect(removed.body.code).toBe('HOLIDAY_HAS_SUBSTITUTE');
  });
});
