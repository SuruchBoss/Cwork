// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Shift and roster management in the console (CW-010).
 *
 * The models existed and attendance already measured against them, but nothing
 * could define a shift or assign one — so this proves the write side end to end:
 * a shift and schedule created here become what attendance actually measures a
 * punch against (the late-minute acceptance), a schedule assignment that would
 * overlap another for the same employee is refused (the overlap acceptance), and
 * only a `shift:manage` holder can write. The overlap arithmetic itself is proven
 * exhaustively in `domain/roster.spec.ts`; this proves it is wired to real rows.
 */
import { EmployeeStatus, PunchMethod, PunchType } from '@prisma/client';
import { AttendanceService } from 'src/modules/attendance/attendance.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { toDateOnly } from 'src/core/utils/date.util';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.manager@cwork.example'; // HR_ADMIN — holds shift:manage
const EMPLOYEE = 'dev2@cwork.example'; // EMPLOYEE — no shift:manage

// A stamp keeps codes unique across runs of the shared database; a future window
// keeps this spec's assignments clear of every other spec's.
const stamp = Date.now().toString(36).toUpperCase().slice(-5);

describe('Shift & roster management (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let attendance: AttendanceService;
  let hrToken: string;
  let employeeToken: string;

  let organizationId: string;
  let timezone: string;
  let rosterDeptId: string;
  // emp1 has no department and carries the assignment/overlap/late-calc cases; two
  // more employees live in rosterDept purely so the bulk-by-department case has a set.
  let emp1: string;
  let shiftId: string;
  let scheduleId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    attendance = ctx.app.get(AttendanceService);
    hrToken = await api.token(HR);
    employeeToken = await api.token(EMPLOYEE);

    const org = await prisma.organization.findFirstOrThrow({
      select: { id: true, timezone: true },
    });
    organizationId = org.id;
    timezone = org.timezone;

    const dept = await prisma.department.create({
      data: { organizationId, code: `RT-${stamp}`, name: `Roster QA ${stamp}` },
    });
    rosterDeptId = dept.id;

    const hireDate = new Date(Date.UTC(2020, 0, 1));
    const ids = await Promise.all(
      [
        { code: `RE1-${stamp}`, departmentId: null },
        { code: `RE2-${stamp}`, departmentId: rosterDeptId },
        { code: `RE3-${stamp}`, departmentId: rosterDeptId },
      ].map((who) =>
        prisma.employee
          .create({
            data: {
              organizationId,
              employeeCode: who.code,
              firstNameTh: 'ทดสอบ',
              lastNameTh: who.code,
              hireDate,
              status: EmployeeStatus.ACTIVE,
              departmentId: who.departmentId,
            },
            select: { id: true },
          })
          .then((e) => e.id),
      ),
    );
    emp1 = ids[0];
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('creates a shift, lists it, and rejects a duplicate code', async () => {
    const created = await api.post('/shifts', hrToken, {
      code: `SH-${stamp}`,
      name: 'กะทดสอบ',
      startTime: '09:00',
      endTime: '18:00',
      graceInMinutes: 5,
    });
    expect(created.status).toBe(201);
    shiftId = created.body.id;

    const list = await api.get('/shifts', hrToken);
    expect(list.body.map((s: { id: string }) => s.id)).toContain(shiftId);

    const dup = await api.post('/shifts', hrToken, {
      code: `SH-${stamp}`,
      name: 'ซ้ำ',
      startTime: '08:00',
      endTime: '17:00',
    });
    expect(dup.status).toBe(409);
  });

  it('deactivates a throwaway shift so it drops out of the active list', async () => {
    const throwaway = await api.post('/shifts', hrToken, {
      code: `SHX-${stamp}`,
      name: 'จะปิด',
      startTime: '10:00',
      endTime: '19:00',
    });
    expect(throwaway.status).toBe(201);

    expect((await api.delete(`/shifts/${throwaway.body.id}`, hrToken)).status).toBe(204);

    const active = await api.get('/shifts', hrToken);
    expect(active.body.map((s: { id: string }) => s.id)).not.toContain(throwaway.body.id);
    const all = await api.get('/shifts?includeInactive=true', hrToken);
    expect(all.body.map((s: { id: string }) => s.id)).toContain(throwaway.body.id);
  });

  it('creates a weekly schedule with the new shift as its default', async () => {
    const created = await api.post('/work-schedules', hrToken, {
      code: `WS-${stamp}`,
      name: 'ทุกวัน',
      workingDays: [1, 2, 3, 4, 5, 6, 7],
      defaultShiftId: shiftId,
    });
    expect(created.status).toBe(201);
    scheduleId = created.body.id;
  });

  it('assigns a schedule, then refuses an overlapping range for the same employee', async () => {
    const first = await api.post('/schedule-assignments', hrToken, {
      employeeId: emp1,
      scheduleId,
      effectiveFrom: '2027-03-01',
      effectiveTo: '2027-06-30',
    });
    expect(first.status).toBe(201);

    // Shares June with the first assignment — ambiguous roster, must be refused.
    const overlap = await api.post('/schedule-assignments', hrToken, {
      employeeId: emp1,
      scheduleId,
      effectiveFrom: '2027-06-15',
      effectiveTo: '2027-09-30',
    });
    expect(overlap.status).toBe(409);
    expect(JSON.stringify(overlap.body)).toMatch(/ทับซ้อน/);

    // Starts the day after the first ends — no shared day, so it is allowed.
    const clear = await api.post('/schedule-assignments', hrToken, {
      employeeId: emp1,
      scheduleId,
      effectiveFrom: '2027-07-01',
    });
    expect(clear.status).toBe(201);
  });

  it('bulk-assigns a schedule to a whole department, then reports the overlap on a re-run', async () => {
    const bulk = await api.post('/schedule-assignments/bulk', hrToken, {
      scheduleId,
      effectiveFrom: '2028-01-01',
      effectiveTo: '2028-06-30',
      departmentId: rosterDeptId,
    });
    expect(bulk.status).toBe(201);
    expect(bulk.body.assigned).toBe(2); // emp2 and emp3

    const again = await api.post('/schedule-assignments/bulk', hrToken, {
      scheduleId,
      effectiveFrom: '2028-03-01',
      effectiveTo: '2028-09-30',
      departmentId: rosterDeptId,
    });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toMatch(/ทับซ้อน/);
  });

  it('makes a console-created shift the one attendance measures a late punch against', async () => {
    // A per-day roster override puts emp1 on the new shift for this date.
    const override = await api.post('/roster', hrToken, {
      employeeId: emp1,
      date: '2027-04-15',
      shiftId,
    });
    expect(override.status).toBe(201);

    // A clock-in at 10:00 Bangkok (03:00 UTC) is an hour past the 09:00 start.
    const workDate = toDateOnly('2027-04-15');
    await prisma.attendancePunch.create({
      data: {
        organizationId,
        employeeId: emp1,
        type: PunchType.CLOCK_IN,
        method: PunchMethod.WEB,
        punchedAt: new Date(Date.UTC(2027, 3, 15, 3, 0, 0)),
        workDate,
      },
    });

    await attendance.recalculateDay(organizationId, emp1, workDate, timezone);

    const record = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: emp1, workDate } },
      select: { shiftId: true, lateMinutes: true },
    });
    // The shift created in the console is what the day was measured against…
    expect(record.shiftId).toBe(shiftId);
    // …and being an hour late against its 09:00 start is now counted.
    expect(record.lateMinutes).toBeGreaterThan(0);
  });

  it('shows who is on which shift in the roster calendar', async () => {
    const roster = await api.get(
      `/roster?from=2027-04-13&to=2027-04-17&employeeId=${emp1}`,
      hrToken,
    );
    expect(roster.status).toBe(200);

    const row = roster.body.employees.find((e: { employeeId: string }) => e.employeeId === emp1);
    expect(row).toBeDefined();
    const cell = row.days.find((d: { date: string }) => d.date === '2027-04-15');
    expect(cell).toMatchObject({ shiftId, source: 'override', isDayOff: false });
  });

  it('refuses roster writes to a caller without shift:manage', async () => {
    const shift = await api.post('/shifts', employeeToken, {
      code: `NOPE-${stamp}`,
      name: 'ไม่ได้',
      startTime: '09:00',
      endTime: '18:00',
    });
    expect(shift.status).toBe(403);

    const assignment = await api.post('/schedule-assignments', employeeToken, {
      employeeId: emp1,
      scheduleId,
      effectiveFrom: '2029-01-01',
    });
    expect(assignment.status).toBe(403);
  });
});
