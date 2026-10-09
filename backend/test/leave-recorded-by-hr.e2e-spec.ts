// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * HR records leave for an employee (CW-067).
 *
 * At the pilot company nobody but HR uses Cwork, so leave enters it only if HR
 * can file it for someone else. What has to hold is that leave entered this way
 * is the same leave as any other: the balance, the attendance for those days and
 * the payroll period all see it, the same rules refuse it with the same words,
 * and the audit trail says who entered it and for whom.
 *
 * The scenario is the common one: someone phoned in sick, the day was closed
 * out overnight as an absence, and HR records the sick day afterwards. It is
 * set in June 2024, a month no other spec runs payroll for.
 */
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { AttendanceService } from 'src/modules/attendance/attendance.service';
import { addDays, isoDate } from './utils/dates';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR_OFFICER = 'hr.officer@cwork.example';
const EMPLOYEE = 'dev2@cwork.example';
const PAYROLL = 'payroll@cwork.example';

/** A Tuesday, closed out as an absence before HR records it as sick leave. */
const SICK_DAY = '2024-06-11';
/** The Wednesday after, recorded as unpaid leave. */
const UNPAID_DAY = '2024-06-12';

interface Balance {
  code: string;
  used: number;
  pending: number;
  available: number;
}

describe('Leave recorded by HR (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let attendance: AttendanceService;
  let hrToken: string;
  let employeeToken: string;
  let payrollToken: string;
  let organizationId: string;
  let hrUserId: string;
  let hrEmployeeId: string;
  let somchaiId: string;
  const types = new Map<string, string>();

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    attendance = ctx.app.get(AttendanceService);
    hrToken = await api.token(HR_OFFICER);
    employeeToken = await api.token(EMPLOYEE);
    payrollToken = await api.token(PAYROLL);

    const hr = await prisma.user.findFirstOrThrow({
      where: { email: HR_OFFICER },
      include: { employee: { select: { id: true } } },
    });
    organizationId = hr.organizationId;
    hrUserId = hr.id;
    hrEmployeeId = hr.employee!.id;

    for (const type of (await api.get('/leave/types', hrToken)).body) types.set(type.code, type.id);

    // Someone with no account, as everyone at the pilot company is.
    const created = await api.post('/employees', hrToken, {
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      hireDate: '2024-01-02',
    });
    expect(created.status).toBe(201);
    somchaiId = created.body.id;
    expect(created.body.userId ?? null).toBeNull();
    // Working, as an imported employee is: a new hire starts as pre-boarding.
    await prisma.employee.update({ where: { id: somchaiId }, data: { status: 'ACTIVE' } });
    const pay = await api.post('/payroll/compensation', payrollToken, {
      employeeId: somchaiId,
      effectiveFrom: '2024-01-02',
      baseSalary: 30000,
    });
    expect(pay.status).toBeLessThan(300);

    // The night after the sick day: no punch, so the day is an absence.
    await attendance.closeOutDay(organizationId, new Date(`${SICK_DAY}T00:00:00Z`));
    expect(await dayStatus(SICK_DAY)).toBe(AttendanceStatus.ABSENT);
  });

  afterAll(async () => {
    // Other specs count the demo company's people; this one leaves as it came.
    await prisma?.employee.update({
      where: { id: somchaiId },
      data: { deletedAt: new Date(), status: 'TERMINATED' },
    });
    await ctx?.close();
  });

  async function dayStatus(day: string) {
    const record = await prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: somchaiId, workDate: new Date(day) } },
      select: { status: true },
    });
    return record?.status ?? null;
  }

  async function balance(code: string, year = 2024): Promise<Balance> {
    const res = await api.get<Balance[]>(`/leave/balances/${somchaiId}?year=${year}`, hrToken);
    return res.body.find((b) => b.code === code)!;
  }

  const record = (body: Record<string, unknown>, token = hrToken) =>
    api.post('/leave/requests/record', token, body);

  describe('a sick day recorded the morning after', () => {
    let requestId: string;
    let before: Balance;

    beforeAll(async () => {
      before = await balance('SICK');
    });

    it('previews the cost without warning about notice', async () => {
      const res = await api.post('/leave/requests/record/preview', hrToken, {
        employeeId: somchaiId,
        leaveTypeId: types.get('SICK'),
        startDate: SICK_DAY,
        endDate: SICK_DAY,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        employee: { id: somchaiId, name: 'สมชาย ใจดี' },
        totalDays: 1,
        balanceAfter: before.available - 1,
        warnings: [],
      });
    });

    it('records it as approved, naming HR as the one who entered it', async () => {
      const res = await record({
        employeeId: somchaiId,
        leaveTypeId: types.get('SICK'),
        startDate: SICK_DAY,
        endDate: SICK_DAY,
        reason: 'โทรแจ้งป่วยเช้านี้',
      });

      expect(res.status).toBe(201);
      requestId = res.body.id;
      expect(res.body).toMatchObject({
        status: 'APPROVED',
        employeeId: somchaiId,
        recordedByUserId: hrUserId,
        recordedBy: { id: hrUserId, email: HR_OFFICER },
      });
    });

    it('takes the day from the balance as used', async () => {
      expect(await balance('SICK')).toMatchObject({
        used: before.used + 1,
        pending: before.pending,
        available: before.available - 1,
      });
    });

    it('turns the day closed out as an absence into leave', async () => {
      expect(await dayStatus(SICK_DAY)).toBe(AttendanceStatus.ON_LEAVE);
    });

    it('audits HR as the actor and the employee as the one on leave', async () => {
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { entityType: 'LeaveRequest', entityId: requestId },
      });

      expect(entry.actorUserId).toBe(hrUserId);
      expect(entry.summary).toContain('สมชาย ใจดี');
      expect(entry.changes).toMatchObject({
        employeeId: somchaiId,
        employeeName: 'สมชาย ใจดี',
        status: 'APPROVED',
      });
    });

    it('shows who recorded it in the leave list', async () => {
      const res = await api.get(`/leave/requests?employeeId=${somchaiId}`, hrToken);
      const row = res.body.data.find((r: { id: string }) => r.id === requestId);
      expect(row.recordedBy).toMatchObject({ id: hrUserId });
    });

    it('turns the day back into an absence if HR cancels the leave', async () => {
      const unpaid = await record({
        employeeId: somchaiId,
        leaveTypeId: types.get('SICK'),
        startDate: '2024-06-13',
        endDate: '2024-06-13',
      });
      expect(unpaid.status).toBe(201);
      await attendance.closeOutDay(organizationId, new Date('2024-06-13T00:00:00Z'));

      const cancelled = await api.post(`/leave/requests/${unpaid.body.id}/cancel`, hrToken, {
        reason: 'บันทึกผิดวัน',
      });

      expect(cancelled.status).toBe(201);
      expect(await dayStatus('2024-06-13')).toBe(AttendanceStatus.ABSENT);
    });
  });

  it('leaves a day payroll has locked as it was paid', async () => {
    const day = '2024-06-20';
    await attendance.closeOutDay(organizationId, new Date(`${day}T00:00:00Z`));
    await prisma.attendanceRecord.update({
      where: { employeeId_workDate: { employeeId: somchaiId, workDate: new Date(day) } },
      data: { lockedAt: new Date() },
    });

    const res = await record({
      employeeId: somchaiId,
      leaveTypeId: types.get('SICK'),
      startDate: day,
      endDate: day,
    });

    expect(res.status).toBe(201);
    expect(await dayStatus(day)).toBe(AttendanceStatus.ABSENT);
  });

  it('carries recorded leave into the payroll period', async () => {
    const unpaid = await record({
      employeeId: somchaiId,
      leaveTypeId: types.get('UNPAID'),
      startDate: UNPAID_DAY,
      endDate: UNPAID_DAY,
    });
    expect(unpaid.status).toBe(201);

    const period = await api.post('/payroll/periods', payrollToken, {
      year: 2024,
      month: 6,
      periodStart: '2024-06-01',
      periodEnd: '2024-06-30',
      payDate: '2024-06-30',
    });
    expect(period.status).toBe(201);
    const run = await api.post('/payroll/runs', payrollToken, { periodId: period.body.id });
    const calculated = await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken);
    expect(calculated.body.status).toBe('CALCULATED');

    const slip = await prisma.payslip.findUniqueOrThrow({
      where: { runId_employeeId: { runId: run.body.id, employeeId: somchaiId } },
    });
    // June 2024 has 20 working days. The unpaid day is deducted; the sick day,
    // closed out as an absence before it was recorded, is not; the cancelled
    // day and the day payroll had locked are the absences left.
    expect(Number(slip.unpaidLeaveDays)).toBe(1);
    expect(Number(slip.workedDays)).toBe(20 - 1 - 2);
  });

  describe('the same rules as the employee’s own request', () => {
    // A Saturday: no working day to take, whoever files it.
    const saturday = { startDate: '2024-06-15', endDate: '2024-06-15' };

    it('refuses with the same code and message the employee gets', async () => {
      const own = await api.post('/leave/requests', employeeToken, {
        leaveTypeId: types.get('SICK'),
        ...saturday,
      });
      const employee = (await api.get('/employees/me', employeeToken)).body.id;
      const recorded = await record({
        employeeId: employee,
        leaveTypeId: types.get('SICK'),
        ...saturday,
      });

      expect(own.status).toBe(422);
      expect(recorded.status).toBe(own.status);
      expect(recorded.body.code).toBe('NO_WORKING_DAYS_SELECTED');
      expect(recorded.body.message).toBe(own.body.message);
    });

    it('refuses a day the employee already has leave on', async () => {
      const again = await record({
        employeeId: somchaiId,
        leaveTypeId: types.get('SICK'),
        startDate: SICK_DAY,
        endDate: SICK_DAY,
      });

      expect(again.status).toBe(422);
      expect(again.body.code).toBe('OVERLAPPING_LEAVE');
    });

    it('holds leave sent for approval to the notice rule, and not leave recorded as approved', async () => {
      // Annual leave needs three days' notice; the first working day from today has less.
      const nextWorkingDay = [0, 1, 2]
        .map((n) => addDays(new Date(), n))
        .find((d) => {
          const day = d.getUTCDay();
          return day !== 0 && day !== 6;
        })!;
      const date = isoDate(nextWorkingDay);
      const body = {
        employeeId: somchaiId,
        leaveTypeId: types.get('ANNUAL'),
        startDate: date,
        endDate: date,
      };

      const forApproval = await record({ ...body, recordAsApproved: false });
      expect(forApproval.status).toBe(422);
      expect(forApproval.body.code).toBe('LEAVE_NOTICE_TOO_SHORT');

      const approved = await record(body);
      expect(approved.status).toBe(201);
      expect(approved.body.status).toBe('APPROVED');
    });

    it('says so in the preview, before HR saves', async () => {
      const preview = await api.post('/leave/requests/record/preview', hrToken, {
        employeeId: somchaiId,
        leaveTypeId: types.get('SICK'),
        startDate: '2024-06-18',
        endDate: '2024-06-18',
        recordAsApproved: false,
      });

      expect(preview.status).toBe(422);
      expect(preview.body.code).toBe('LEAVE_NOTICE_TOO_SHORT');
    });

    it('refuses to send a day already past to the manager, as the employee could not', async () => {
      const res = await record({
        employeeId: somchaiId,
        leaveTypeId: types.get('SICK'),
        startDate: '2024-06-18',
        endDate: '2024-06-18',
        recordAsApproved: false,
      });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('LEAVE_NOTICE_TOO_SHORT');
    });

    it('sends leave ahead for approval when HR chooses to, still recorded by HR', async () => {
      // Two weeks out, on a day that is a working day for this company.
      let ahead = addDays(new Date(), 14);
      for (;;) {
        const preview = await api.post('/leave/requests/record/preview', hrToken, {
          employeeId: somchaiId,
          leaveTypeId: types.get('SICK'),
          startDate: isoDate(ahead),
          endDate: isoDate(ahead),
        });
        if (preview.status === 201 && preview.body.totalDays === 1) break;
        ahead = addDays(ahead, 1);
      }
      // A manager to approve it; with none, the chain resolves to nobody and approves.
      const manager = await prisma.user.findFirstOrThrow({
        where: { email: 'eng.manager@cwork.example' },
        include: { employee: { select: { id: true } } },
      });
      await prisma.employee.update({
        where: { id: somchaiId },
        data: { managerId: manager.employee!.id },
      });
      const before = await balance('SICK', ahead.getUTCFullYear());
      const res = await record({
        employeeId: somchaiId,
        leaveTypeId: types.get('SICK'),
        startDate: isoDate(ahead),
        endDate: isoDate(ahead),
        recordAsApproved: false,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'PENDING', recordedByUserId: hrUserId });
      expect(res.body.approval).toBeTruthy();
      expect((await balance('SICK', ahead.getUTCFullYear())).pending).toBe(before.pending + 1);
    });
  });

  describe('who may record', () => {
    it('refuses someone without leave:record, even for themselves', async () => {
      const own = (await api.get('/employees/me', employeeToken)).body.id;
      const res = await record(
        {
          employeeId: own,
          leaveTypeId: types.get('SICK'),
          startDate: '2024-06-19',
          endDate: '2024-06-19',
        },
        employeeToken,
      );

      expect(res.status).toBe(403);
    });

    it('does not let HR approve their own leave', async () => {
      const res = await record({
        employeeId: hrEmployeeId,
        leaveTypeId: types.get('SICK'),
        startDate: '2024-06-19',
        endDate: '2024-06-19',
      });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('CANNOT_RECORD_OWN_LEAVE');
    });
  });
});
