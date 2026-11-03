// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * A day with one scan (CW-106).
 *
 * A past day with a clock-in and no clock-out is INCOMPLETE, as the nightly
 * close-out would make it, so payroll shows its warning; a day with only a
 * clock-out is INCOMPLETE with no minutes, never an error; a complete day is
 * as it was. The scanner import tells HR how many days were scanned once.
 */
import { AttendanceStatus, PrismaClient, PunchMethod, PunchType } from '@prisma/client';
import { AttendanceService } from 'src/modules/attendance/attendance.service';
import { resolveDatabaseUrl } from './utils/database';
import { createTestApp, type Api, type TestContext } from './utils/test-app';
import { giveNumber, takeNumbers } from './utils/scanner-numbers';

const HR = 'hr.officer@cwork.example';
const TIMEZONE = 'Asia/Bangkok';
const day = (d: number) => new Date(Date.UTC(2025, 5, d));
const SCANNER = '8801';

describe('A day with one scan (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaClient;
  let attendance: AttendanceService;
  let organizationId: string;
  let employeeId: string;
  let hr: string;

  const punch = (d: number, time: string, type: PunchType) =>
    prisma.attendancePunch.create({
      data: {
        organizationId,
        employeeId,
        type,
        method: PunchMethod.BIOMETRIC,
        punchedAt: new Date(`2025-06-${String(d).padStart(2, '0')}T${time}:00+07:00`),
        workDate: day(d),
        clientPunchId: `single:${d}:${time}:${type}`,
      },
    });

  const recordOf = async (d: number) => {
    await attendance.recalculateDay(organizationId, employeeId, day(d), TIMEZONE);
    return prisma.attendanceRecord.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: day(d) } },
    });
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
    attendance = ctx.app.get(AttendanceService);
    hr = await api.token(HR);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));
    employeeId = (
      await prisma.employee.findFirstOrThrow({
        where: { organizationId, workEmail: 'dev1@cwork.example' },
        select: { id: true },
      })
    ).id;
    await giveNumber(prisma, employeeId, SCANNER);
  });

  afterAll(async () => {
    if (prisma) await takeNumbers(prisma, [employeeId]);
    await prisma?.$disconnect();
    await ctx?.close();
  });

  it('is INCOMPLETE when a past day has a clock-in and no clock-out', async () => {
    await punch(2, '08:55', PunchType.CLOCK_IN);

    const record = await recordOf(2);

    expect(record.status).toBe(AttendanceStatus.INCOMPLETE);
    expect(record.workedMinutes).toBe(0);
  });

  it('is INCOMPLETE with no minutes when a past day has only a clock-out', async () => {
    await punch(3, '18:02', PunchType.CLOCK_OUT);

    const record = await recordOf(3);

    expect(record.status).toBe(AttendanceStatus.INCOMPLETE);
    expect(record.workedMinutes).toBe(0);
    expect(record.firstClockInAt).toBeNull();
  });

  it('leaves a complete day as it was', async () => {
    await punch(4, '08:55', PunchType.CLOCK_IN);
    await punch(4, '18:02', PunchType.CLOCK_OUT);

    const record = await recordOf(4);

    expect(record.status).toBe(AttendanceStatus.PRESENT);
    expect(record.workedMinutes).toBeGreaterThan(0);
  });

  it('is counted in the scanner import summary, before and after the import', async () => {
    const line = (d: number, times: string) =>
      [`ทดสอบ ,`, `${SCANNER} ,`, `${String(d).padStart(2, '0')}/07/2025 ,`, `${times} ,`, ''].join(
        '\t',
      );
    const text = [line(1, '08:00'), line(2, '08:00 17:00'), line(3, '09:00')].join('\r\n') + '\r\n';
    const file = {
      filename: 'Export.xls',
      contentType: 'application/vnd.ms-excel',
      content: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
    };

    const preview = await api.upload('/attendance/scanner/preview', hr, file);
    expect(preview.status).toBe(200);
    expect(preview.body.singleScanDays).toBe(2);

    const imported = await api.upload('/attendance/scanner/import', hr, file);
    expect(imported.status).toBe(201);
    expect(imported.body.singleScanDays).toBe(2);
  });
});
