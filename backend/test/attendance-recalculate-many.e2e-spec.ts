// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Rebuilding many days at once gives the days that rebuilding each one does.
 *
 * The scanner import rebuilds thousands of days, so it reads what they need in
 * groups instead of once a day. That is only a faster way to the same answer,
 * and this is the check: the same punches, rebuilt both ways, leave identical
 * rows, including the weekend, a day with one scan, a day with none, and a day
 * that already had a row.
 */
import { PrismaClient, PunchMethod, PunchType } from '@prisma/client';
import { AttendanceService } from 'src/modules/attendance/attendance.service';
import { resolveDatabaseUrl } from './utils/database';
import { createTestApp, type TestContext } from './utils/test-app';

const TIMEZONE = 'Asia/Bangkok';
const day = (d: number) => new Date(Date.UTC(2035, 2, d));

describe('Rebuilding many days at once (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaClient;
  let attendance: AttendanceService;
  let organizationId: string;
  let employeeIds: string[];

  const punch = (employeeId: string, d: number, time: string, type: PunchType) =>
    prisma.attendancePunch.create({
      data: {
        organizationId,
        employeeId,
        type,
        method: PunchMethod.BIOMETRIC,
        punchedAt: new Date(`2035-03-${String(d).padStart(2, '0')}T${time}:00+07:00`),
        workDate: day(d),
        clientPunchId: `many:${employeeId}:${d}:${time}:${type}`,
      },
    });

  const records = async () =>
    (
      await prisma.attendanceRecord.findMany({
        where: { employeeId: { in: employeeIds }, workDate: { gte: day(1), lte: day(31) } },
        orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
      })
    ).map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => rest);

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
    attendance = ctx.app.get(AttendanceService);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));
    employeeIds = (
      await prisma.employee.findMany({
        where: {
          organizationId,
          workEmail: { in: ['dev1@cwork.example', 'sales1@cwork.example'] },
        },
        select: { id: true },
      })
    ).map((e) => e.id);
    expect(employeeIds).toHaveLength(2);

    const [a, b] = employeeIds as [string, string];
    // A normal day, a day with one scan, a Saturday, and a day for the second person only.
    await punch(a, 5, '08:05', PunchType.CLOCK_IN);
    await punch(a, 5, '17:10', PunchType.CLOCK_OUT);
    await punch(a, 6, '08:30', PunchType.CLOCK_IN);
    await punch(a, 10, '09:00', PunchType.CLOCK_IN);
    await punch(a, 10, '13:00', PunchType.CLOCK_OUT);
    await punch(b, 5, '07:55', PunchType.CLOCK_IN);
    await punch(b, 5, '18:40', PunchType.CLOCK_OUT);
    await punch(b, 7, '08:00', PunchType.CLOCK_IN);
    await punch(b, 7, '17:00', PunchType.CLOCK_OUT);
  });

  afterAll(async () => {
    await prisma?.attendanceRecord.deleteMany({
      where: { employeeId: { in: employeeIds }, workDate: { gte: day(1), lte: day(31) } },
    });
    // Punches are append-only and these are dated 2035, in a database made for the run.
    await prisma?.$disconnect();
    await ctx?.close();
  });

  const everyDay = () => {
    const days: Array<{ employeeId: string; workDate: Date }> = [];
    for (const employeeId of employeeIds) {
      for (const d of [4, 5, 6, 7, 8, 10, 11]) days.push({ employeeId, workDate: day(d) });
    }
    return days;
  };

  it('leaves the rows that rebuilding each day on its own leaves', async () => {
    for (const { employeeId, workDate } of everyDay()) {
      await attendance.recalculateDay(organizationId, employeeId, workDate, TIMEZONE);
    }
    const onEachDay = await records();
    expect(onEachDay.length).toBe(14);

    await prisma.attendanceRecord.deleteMany({
      where: { employeeId: { in: employeeIds }, workDate: { gte: day(1), lte: day(31) } },
    });
    await attendance.recalculateDays(organizationId, everyDay(), TIMEZONE);

    expect(await records()).toEqual(onEachDay);
  });

  it('leaves the same rows when the days already have a row', async () => {
    const before = await records();

    await attendance.recalculateDays(organizationId, everyDay(), TIMEZONE);

    expect(await records()).toEqual(before);
  });

  it('rebuilds a day whose punches changed since its row was written', async () => {
    const [a] = employeeIds as [string];
    await punch(a, 6, '17:20', PunchType.CLOCK_OUT);

    await attendance.recalculateDays(
      organizationId,
      [{ employeeId: a, workDate: day(6) }],
      TIMEZONE,
    );

    const row = await prisma.attendanceRecord.findFirstOrThrow({
      where: { employeeId: a, workDate: day(6) },
    });
    expect(row.lastClockOutAt?.toISOString()).toBe('2035-03-06T10:20:00.000Z');
  });
});
