// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The nightly close-out meets a scanner file that is imported afterwards (CW-111).
 *
 * The close-out runs at 01:00 in Bangkok and closes the day that has just ended. The
 * pilot company does not send scans live: HR imports the scanner's file day by day,
 * later. So a day is closed with no punches (absent) before its scans arrive, and the
 * scans must then put the day right. The pay run counts the days whose record is
 * `ABSENT` (`payroll.service.ts`, `absentDays`), so a record that stays absent after the
 * file is imported would cost the employee a day.
 *
 * A week of its own in 2040, a number of its own, and a clock set in each call.
 */
import { AttendanceStatus, PrismaClient } from '@prisma/client';
import { ScheduledTasksService } from 'src/modules/jobs/scheduled-tasks.service';
import { resolveDatabaseUrl } from './utils/database';
import { giveNumber, takeNumbers } from './utils/scanner-numbers';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.officer@cwork.example';
const NUMBER = '9401';
/** Thursday 10 May 2040, a working day. */
const DAY = '2040-05-10';
/** 18:00 UTC is 01:00 the next morning in Bangkok: the run that closes DAY. */
const NIGHT_AFTER = new Date('2040-05-10T18:00:00Z');

const scannerFile = (lines: string[]) => ({
  filename: 'Export.xls',
  contentType: 'application/vnd.ms-excel',
  content: Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(lines.join('\r\n') + '\r\n', 'utf16le'),
  ]),
});
const line = (times: string) =>
  [`ทดสอบ ,`, `${NUMBER} ,`, `10/05/2040 ,`, `${times} ,`, ''].join('\t');

describe('The close-out and a scanner file imported afterwards (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaClient;
  let hr: string;
  let employeeId: string;

  const record = () =>
    prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: new Date(`${DAY}T00:00:00Z`) } },
    });
  const closeOut = () => ctx.app.get(ScheduledTasksService).closeOutAttendance(NIGHT_AFTER);

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
    hr = await api.token(HR);
    employeeId = (
      await prisma.employee.findFirstOrThrow({
        where: { workEmail: 'dev1@cwork.example' },
        select: { id: true },
      })
    ).id;
    await takeNumbers(prisma, [employeeId]);
    await giveNumber(prisma, employeeId, NUMBER);
  });

  afterAll(async () => {
    if (prisma) {
      await takeNumbers(prisma, [employeeId]);
      await prisma.$disconnect();
    }
    await ctx?.close();
  });

  it('closes a day with no punches as absent, and the scans imported afterwards put it right', async () => {
    await closeOut();
    expect((await record())?.status).toBe(AttendanceStatus.ABSENT);

    const imported = await api.upload(
      '/attendance/scanner/import',
      hr,
      scannerFile([line('08:00 17:00')]),
    );
    expect(imported.status).toBeLessThan(300);

    const day = await record();
    expect(day?.status).not.toBe(AttendanceStatus.ABSENT);
    expect(day?.firstClockInAt).not.toBeNull();
    expect(day?.lastClockOutAt).not.toBeNull();
    expect(day?.workedMinutes).toBeGreaterThan(0);
    // The pay run counts absent records; none is left for this person on this day.
    expect(
      await prisma.attendanceRecord.count({
        where: {
          employeeId,
          workDate: new Date(`${DAY}T00:00:00Z`),
          status: AttendanceStatus.ABSENT,
        },
      }),
    ).toBe(0);
  });

  it('does not close it as absent again when the job runs once more', async () => {
    await closeOut();
    const day = await record();
    expect(day?.status).not.toBe(AttendanceStatus.ABSENT);
    expect(day?.workedMinutes).toBeGreaterThan(0);
  });
});
