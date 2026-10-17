// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Importing a fingerprint scanner's export (CW-061), against a real database.
 *
 * Every file here is synthetic: written in the scanner's layout (UTF-16LE text
 * with a byte-order mark, tab-separated, a trailing space and comma on every
 * field, a fifth empty field) from made-up names and numbers. None is a real
 * export and none is derived from one.
 *
 * What is being held to account is the part a layout test cannot show: that a
 * day with one time or three is never counted until a person decides it, that
 * HR's decisions are kept apart from the raw days and can change, that an
 * overlapping file adds only what is new, and that the append-only punch stream
 * and the day it feeds stay in step when a decision changes.
 */
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './utils/database';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.officer@cwork.example';
const EMPLOYEE_TOKEN_USER = 'dev2@cwork.example';

const YEAR = 2037;
const date = (day: number) => `${String(day).padStart(2, '0')}/03/${YEAR}`;
const iso = (day: number) => `${YEAR}-03-${String(day).padStart(2, '0')}`;

/** A line the way the scanner writes it: every field padded and closed with a comma, a fifth empty. */
const line = (name: string, number: string, day: number, times: string) =>
  [`${name} ,`, `${number} ,`, `${date(day)} ,`, `${times} ,`, ''].join('\t');

function scannerFile(lines: string[]): { filename: string; contentType: string; content: Buffer } {
  const text = lines.join('\r\n') + '\r\n';
  return {
    // Named like an Excel file; it is not one.
    filename: 'Export.xls',
    contentType: 'application/vnd.ms-excel',
    content: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
  };
}

describe('Fingerprint scanner import (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaClient;
  let hr: string;
  let organizationId: string;
  let ann: { id: string; code: string };
  let ben: { id: string; code: string };
  let cat: { id: string; code: string };

  const A = '9001';
  const B = '9002';
  const TEMP = '9099';

  /** The first file: a day of each kind for Ann, a normal day for Ben, a temporary number nobody registered. */
  const FIRST = () =>
    scannerFile([
      line('แอน ทดสอบ', A, 1, ''),
      line('แอน ทดสอบ', A, 2, '08:01 17:05'),
      line('แอน ทดสอบ', A, 3, '08:00'),
      line('แอน ทดสอบ', A, 4, '08:00 12:00 17:00'),
      line('แอน ทดสอบ', A, 5, '08:02 17:00'),
      line('เบน ทดสอบ', B, 1, '08:30 17:30'),
      line('เบน ทดสอบ', B, 2, ''),
      line('ชั่วคราว', TEMP, 2, '09:00 18:00'),
      line('ชั่วคราว', TEMP, 3, '09:00'),
    ]);

  const days = async (query = '') => (await api.get(`/attendance/scanner/days${query}`, hr)).body;
  const dayId = async (number: string, day: number) =>
    (
      await prisma.scannerDay.findFirstOrThrow({
        where: { scannerNumber: number, workDate: new Date(`${iso(day)}T00:00:00Z`) },
      })
    ).id;
  const punchesOf = (employeeId: string, day: number) =>
    prisma.attendancePunch.findMany({
      where: { employeeId, workDate: new Date(`${iso(day)}T00:00:00Z`) },
      orderBy: { punchedAt: 'asc' },
      include: { scannerLink: true },
    });
  const activeOf = async (employeeId: string, day: number) =>
    (await punchesOf(employeeId, day)).filter(
      (p) => p.scannerLink && p.scannerLink.supersededAt === null,
    );
  const recordOf = (employeeId: string, day: number) =>
    prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: new Date(`${iso(day)}T00:00:00Z`) } },
    });

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
    hr = await api.token(HR);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));

    const person = async (email: string, scannerId: string | null) => {
      const found = await prisma.employee.findFirstOrThrow({
        where: { workEmail: email, organizationId },
        select: { id: true, employeeCode: true },
      });
      if (scannerId) await prisma.employee.update({ where: { id: found.id }, data: { scannerId } });
      return { id: found.id, code: found.employeeCode };
    };
    ann = await person('dev1@cwork.example', A);
    ben = await person('sales1@cwork.example', B);
    cat = await person('eng.manager@cwork.example', null);
  });

  afterAll(async () => {
    // Out of the register again, so no other spec finds a scanner number on them.
    await prisma?.employee.updateMany({
      where: { id: { in: [ann?.id, ben?.id, cat?.id].filter(Boolean) as string[] } },
      data: { scannerId: null },
    });
    await prisma?.$disconnect();
    await ctx?.close();
  });

  it('checks the file without writing anything, and says what every day is', async () => {
    const res = await api.upload('/attendance/scanner/preview', hr, FIRST());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      problems: [],
      dateFrom: iso(1),
      dateTo: iso(5),
      lines: 9,
      days: { added: 9, changed: 0, unchanged: 0 },
      // Ann: none, two, one, three, two. Ben: two, none. The temporary number: two, one.
      byStatus: {
        NO_PUNCH: 2,
        COUNTED: 3,
        WAITING: 2,
        UNMAPPED: 2,
        DECIDED_USE: 0,
        DECIDED_IGNORE: 0,
      },
      punchesToAdd: 6,
      unmapped: [{ scannerNumber: TEMP, name: 'ชั่วคราว', days: 2, daysWithTimes: 2 }],
    });
    expect(await prisma.scannerImport.count()).toBe(0);
    expect(await prisma.scannerDay.count()).toBe(0);
    expect(
      await prisma.attendancePunch.count({
        where: { employeeId: ann.id, workDate: new Date(`${iso(2)}T00:00:00Z`) },
      }),
    ).toBe(0);
  });

  it('is for people who manage attendance, and nobody else', async () => {
    const employee = await api.token(EMPLOYEE_TOKEN_USER);
    for (const path of ['/attendance/scanner/preview', '/attendance/scanner/import']) {
      expect((await api.upload(path, employee, FIRST())).status).toBe(403);
    }
    for (const path of [
      '/attendance/scanner/days',
      '/attendance/scanner/unmapped',
      '/attendance/scanner/imports',
    ]) {
      expect((await api.get(path, employee)).status).toBe(403);
    }
  });

  describe('once the first file is imported', () => {
    let imported: any;

    beforeAll(async () => {
      imported = await api.upload('/attendance/scanner/import', hr, FIRST());
    });

    it('counts two times as in and out, and only those: three BIOMETRIC punches for each normal day', async () => {
      expect(imported.status).toBe(201);
      expect(imported.body).toMatchObject({
        dateFrom: iso(1),
        dateTo: iso(5),
        lines: 9,
        punchesAdded: 6,
        lockedDays: 0,
        days: { added: 9, changed: 0, unchanged: 0 },
      });

      const day2 = await punchesOf(ann.id, 2);
      expect(day2.map((p) => [p.type, p.method, p.clientPunchId])).toEqual([
        ['CLOCK_IN', 'BIOMETRIC', `scan:${A}:${iso(2)}:08:01:IN`],
        ['CLOCK_OUT', 'BIOMETRIC', `scan:${A}:${iso(2)}:17:05:OUT`],
      ]);
      // Times in the file are read in the organisation's time zone (Bangkok, UTC+7).
      expect(day2[0]!.punchedAt.toISOString()).toBe(`${iso(2)}T01:01:00.000Z`);
      expect(day2[1]!.punchedAt.toISOString()).toBe(`${iso(2)}T10:05:00.000Z`);

      const record = await recordOf(ann.id, 2);
      expect(record?.firstClockInAt?.toISOString()).toBe(`${iso(2)}T01:01:00.000Z`);
      expect(record?.lastClockOutAt?.toISOString()).toBe(`${iso(2)}T10:05:00.000Z`);
      expect((await punchesOf(ben.id, 1)).length).toBe(2);
      expect(
        await prisma.attendancePunch.count({ where: { method: 'BIOMETRIC', organizationId } }),
      ).toBe(6);
    });

    it('counts nothing for no time, one time, three times, or a number nobody registered', async () => {
      for (const day of [1, 3, 4]) expect(await punchesOf(ann.id, day)).toEqual([]);
      expect(await punchesOf(ben.id, 2)).toEqual([]);
      expect(
        await prisma.attendancePunch.count({ where: { clientPunchId: { contains: TEMP } } }),
      ).toBe(0);
    });

    it('flags nothing about a missing location, as the file has none to give', async () => {
      const punches = await prisma.attendancePunch.findMany({
        where: { method: 'BIOMETRIC', organizationId },
      });
      expect(punches.length).toBeGreaterThan(0);
      for (const p of punches) {
        expect(p.anomalyFlags).toEqual([]);
        expect(p.workLocationId).toBeNull();
        expect(p.isOutsideGeofence).toBe(false);
      }
      expect((await recordOf(ann.id, 2))?.anomalyFlags).not.toContain('NO_LOCATION');
    });

    it('keeps every raw day, as written, and lists the unregistered number with its rows', async () => {
      const all = await days('?status=ALL');
      expect(all.total).toBe(9);
      expect(all.items.map((d: any) => [d.scannerNumber, d.workDate, d.times])).toEqual(
        expect.arrayContaining([
          [A, iso(3), ['08:00']],
          [A, iso(4), ['08:00', '12:00', '17:00']],
          [TEMP, iso(2), ['09:00', '18:00']],
          [A, iso(1), []],
        ]),
      );
      expect(all.items.find((d: any) => d.scannerNumber === TEMP)).toMatchObject({
        status: 'UNMAPPED',
        employee: null,
      });

      const unmapped = (await api.get('/attendance/scanner/unmapped', hr)).body;
      expect(unmapped).toEqual([
        {
          scannerNumber: TEMP,
          name: 'ชั่วคราว',
          days: 2,
          daysWithTimes: 2,
          firstDay: iso(2),
          lastDay: iso(3),
        },
      ]);
    });

    it('lists what waits for HR on one page, with totals', async () => {
      const waiting = await days();
      expect(waiting.items.map((d: any) => [d.scannerNumber, d.workDate, d.reason])).toEqual([
        [A, iso(3), 'ONE_TIME'],
        [A, iso(4), 'MANY_TIMES'],
      ]);
      expect(waiting.totals).toMatchObject({
        days: 9,
        waiting: 2,
        counted: 3,
        decidedUse: 0,
        decidedIgnore: 0,
        noPunch: 2,
        unmapped: 2,
      });
    });

    it('audits the import as one event naming the file, its dates and the punches added', async () => {
      const entries = await prisma.auditLog.findMany({
        where: { entityType: 'ScannerImport', organizationId },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.changes).toMatchObject({
        fileName: 'Export.xls',
        dateFrom: iso(1),
        dateTo: iso(5),
        punchesAdded: 6,
        lines: 9,
      });
      const history = (await api.get('/attendance/scanner/imports', hr)).body;
      expect(history).toMatchObject([
        { fileName: 'Export.xls', dateFrom: iso(1), dateTo: iso(5), punchesAdded: 6 },
      ]);
    });

    it('adds only what is new when an overlapping export is imported, and none twice', async () => {
      const again = await api.upload('/attendance/scanner/import', hr, FIRST());
      expect(again.body).toMatchObject({
        punchesAdded: 0,
        days: { added: 0, changed: 0, unchanged: 9 },
      });
      expect(
        await prisma.attendancePunch.count({ where: { method: 'BIOMETRIC', organizationId } }),
      ).toBe(6);

      // A cumulative export: the same five days again, then two more of Ann's.
      const cumulative = await api.upload(
        '/attendance/scanner/import',
        hr,
        scannerFile([
          line('แอน ทดสอบ', A, 1, ''),
          line('แอน ทดสอบ', A, 2, '08:01 17:05'),
          line('แอน ทดสอบ', A, 3, '08:00'),
          line('แอน ทดสอบ', A, 4, '08:00 12:00 17:00'),
          line('แอน ทดสอบ', A, 5, '08:02 17:00'),
          line('แอน ทดสอบ', A, 6, '08:10 17:10'),
          line('แอน ทดสอบ', A, 7, '08:11 17:11'),
        ]),
      );
      expect(cumulative.body).toMatchObject({
        punchesAdded: 4,
        days: { added: 2, changed: 0, unchanged: 5 },
      });
      expect(
        await prisma.attendancePunch.count({ where: { method: 'BIOMETRIC', organizationId } }),
      ).toBe(10);
    });

    it('lets HR decide a day, and puts only the chosen times into attendance', async () => {
      const one = await dayId(A, 3);
      const decided = await api.post(`/attendance/scanner/days/${one}/decision`, hr, {
        action: 'USE',
        clockIn: '08:00',
        note: 'Forgot to scan out',
      });
      expect(decided.status).toBe(200);
      expect(decided.body).toMatchObject({
        status: 'DECIDED_USE',
        punchesCounted: 1,
        decision: { action: 'USE', clockIn: '08:00', clockOut: null },
      });
      expect((await activeOf(ann.id, 3)).map((p) => p.type)).toEqual(['CLOCK_IN']);
      expect((await recordOf(ann.id, 3))?.firstClockInAt?.toISOString()).toBe(
        `${iso(3)}T01:00:00.000Z`,
      );

      const many = await dayId(A, 4);
      const picked = await api.post(`/attendance/scanner/days/${many}/decision`, hr, {
        action: 'USE',
        clockIn: '08:00',
        clockOut: '17:00',
      });
      expect(picked.body).toMatchObject({ status: 'DECIDED_USE', punchesCounted: 2 });

      // The totals follow the decisions.
      expect((await days()).totals).toMatchObject({ waiting: 0, decidedUse: 2, counted: 5 });
      expect((await days()).items).toEqual([]);
    });

    it('keeps the earlier decisions as history when HR changes their mind, and the stream in step', async () => {
      const many = await dayId(A, 4);

      // Not counted after all: the two punches stay in the stream, but stop counting.
      const ignored = await api.post(`/attendance/scanner/days/${many}/decision`, hr, {
        action: 'IGNORE',
      });
      expect(ignored.body).toMatchObject({ status: 'DECIDED_IGNORE', punchesCounted: 0 });
      expect(await punchesOf(ann.id, 4)).toHaveLength(2);
      expect(await activeOf(ann.id, 4)).toHaveLength(0);
      expect((await recordOf(ann.id, 4))?.firstClockInAt).toBeNull();

      // Used again, with a different out: the in-punch counts again and only the new out is written.
      const again = await api.post(`/attendance/scanner/days/${many}/decision`, hr, {
        action: 'USE',
        clockIn: '08:00',
        clockOut: '12:00',
      });
      expect(again.body).toMatchObject({ status: 'DECIDED_USE', punchesCounted: 2 });
      expect(await punchesOf(ann.id, 4)).toHaveLength(3);
      expect((await activeOf(ann.id, 4)).map((p) => p.clientPunchId)).toEqual([
        `scan:${A}:${iso(4)}:08:00:IN`,
        `scan:${A}:${iso(4)}:12:00:OUT`,
      ]);
      expect((await recordOf(ann.id, 4))?.lastClockOutAt?.toISOString()).toBe(
        `${iso(4)}T05:00:00.000Z`,
      );

      const detail = (await api.get(`/attendance/scanner/days/${many}`, hr)).body;
      expect(detail.history.map((h: any) => [h.action, h.inForce])).toEqual([
        ['USE', true],
        ['IGNORE', false],
        ['USE', false],
      ]);
    });

    it('refuses a decision that makes no sense, and one on a number nobody registered', async () => {
      const many = await dayId(A, 4);
      const offDay = await api.post(`/attendance/scanner/days/${many}/decision`, hr, {
        action: 'USE',
        clockIn: '08:05',
      });
      expect(offDay.status).toBe(422);
      expect(offDay.body.code).toBe('DECISION_TIME_NOT_ON_DAY');
      expect(
        (await api.post(`/attendance/scanner/days/${many}/decision`, hr, { action: 'USE' })).body
          .code,
      ).toBe('DECISION_NOTHING_TO_USE');
      expect(
        (
          await api.post(`/attendance/scanner/days/${many}/decision`, hr, {
            action: 'USE',
            clockIn: '17:00',
            clockOut: '08:00',
          })
        ).body.code,
      ).toBe('DECISION_OUT_NOT_AFTER_IN');

      const temp = await dayId(TEMP, 2);
      const unregistered = await api.post(`/attendance/scanner/days/${temp}/decision`, hr, {
        action: 'IGNORE',
      });
      expect(unregistered.status).toBe(422);
      expect(unregistered.body.code).toBe('SCANNER_NUMBER_NOT_REGISTERED');
    });

    it('audits each decision', async () => {
      const entries = await prisma.auditLog.findMany({
        where: { entityType: 'ScannerDay', organizationId },
      });
      expect(entries.length).toBe(4);
      expect(entries.every((e) => e.actorUserId)).toBe(true);
    });

    it('takes a decision back to waiting when the day later gains a time, and stops counting its punches', async () => {
      const many = await dayId(A, 4);
      const grown = await api.upload(
        '/attendance/scanner/import',
        hr,
        scannerFile([line('แอน ทดสอบ', A, 4, '08:00 12:00 17:00 19:00')]),
      );
      expect(grown.body).toMatchObject({ days: { added: 0, changed: 1, unchanged: 0 } });

      const detail = (await api.get(`/attendance/scanner/days/${many}`, hr)).body;
      expect(detail).toMatchObject({
        status: 'WAITING',
        reason: 'MANY_TIMES',
        decision: null,
        decisionOutdated: true,
        punchesCounted: 0,
        times: ['08:00', '12:00', '17:00', '19:00'],
      });
      expect(await activeOf(ann.id, 4)).toHaveLength(0);
      expect((await days()).items.map((d: any) => d.id)).toEqual([many]);
    });

    it('leaves a day alone once a payroll run has used it', async () => {
      const five = await dayId(A, 5);
      await prisma.attendanceRecord.update({
        where: {
          employeeId_workDate: { employeeId: ann.id, workDate: new Date(`${iso(5)}T00:00:00Z`) },
        },
        data: { lockedAt: new Date() },
      });

      const refused = await api.post(`/attendance/scanner/days/${five}/decision`, hr, {
        action: 'IGNORE',
      });
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe('DAY_LOCKED');

      // A later file gives the locked day a third time. It would now wait for HR; it is left as it is.
      const grown = await api.upload(
        '/attendance/scanner/import',
        hr,
        scannerFile([line('แอน ทดสอบ', A, 5, '08:02 17:00 18:30')]),
      );
      expect(grown.body).toMatchObject({ punchesAdded: 0, lockedDays: 1 });
      expect(await activeOf(ann.id, 5)).toHaveLength(2);
      expect((await api.get(`/attendance/scanner/days/${five}`, hr)).body.locked).toBe(true);
    });

    it('registers a scanner number nobody had, and counts the days that were waiting on it', async () => {
      const bound = await api.post('/attendance/scanner/unmapped/bind', hr, {
        scannerNumber: TEMP,
        employeeId: cat.id,
      });
      expect(bound.status).toBe(200);
      expect(bound.body).toMatchObject({ daysMatched: 2, punchesAdded: 2 });

      expect((await prisma.employee.findUniqueOrThrow({ where: { id: cat.id } })).scannerId).toBe(
        TEMP,
      );
      expect((await activeOf(cat.id, 2)).map((p) => p.type)).toEqual(['CLOCK_IN', 'CLOCK_OUT']);
      // The day with one time waits for HR like any other.
      expect(await punchesOf(cat.id, 3)).toEqual([]);
      expect((await api.get('/attendance/scanner/unmapped', hr)).body).toEqual([]);

      const again = await api.post('/attendance/scanner/unmapped/bind', hr, {
        scannerNumber: '9100',
        employeeId: cat.id,
      });
      expect(again.status).toBe(422);
      expect(again.body.code).toBe('EMPLOYEE_HAS_SCANNER_NUMBER');
    });

    describe('a number edited on the employee page (CW-090)', () => {
      const WAITING = '0090';

      it('keeps 0090 as 0090, counts the days waiting on it, and leaves earlier days where they were', async () => {
        const waiting = await api.upload(
          '/attendance/scanner/import',
          hr,
          scannerFile([
            line('รอเจ้าของ', WAITING, 10, '08:10 17:10'),
            line('รอเจ้าของ', WAITING, 11, '08:00'),
          ]),
        );
        expect(waiting.status).toBeLessThan(300);
        const ownedBefore = await prisma.scannerDay.count({ where: { employeeId: cat.id } });
        expect(await punchesOf(cat.id, 10)).toEqual([]);

        const edited = await api.patch(`/employees/${cat.id}`, hr, { scannerId: WAITING });
        expect(edited.status).toBe(200);
        expect(edited.body.scannerId).toBe('0090');

        // The two waiting days are hers now; the one with two times is counted, the other waits for HR.
        const mine = await prisma.scannerDay.findMany({
          where: { scannerNumber: WAITING },
          select: { employeeId: true },
        });
        expect(mine.map((d) => d.employeeId)).toEqual([cat.id, cat.id]);
        expect((await activeOf(cat.id, 10)).map((p) => p.type)).toEqual(['CLOCK_IN', 'CLOCK_OUT']);
        expect(await punchesOf(cat.id, 11)).toEqual([]);
        // The days of her old number stay hers, with their punches.
        expect(await prisma.scannerDay.count({ where: { employeeId: cat.id } })).toBe(
          ownedBefore + 2,
        );
        expect((await activeOf(cat.id, 2)).map((p) => p.type)).toEqual(['CLOCK_IN', 'CLOCK_OUT']);
        expect((await api.get('/attendance/scanner/unmapped', hr)).body).toEqual([]);
      });

      it('records the old and the new number, and how many days were counted', async () => {
        const entries = await prisma.auditLog.findMany({
          where: { entityType: 'Employee', entityId: cat.id },
          orderBy: { createdAt: 'asc' },
        });
        const changed = entries.find(
          (e) =>
            (e.changes as { scannerId?: { from: string; to: string } } | null)?.scannerId?.to ===
            WAITING,
        );
        expect(changed?.changes).toMatchObject({ scannerId: { from: TEMP, to: WAITING } });
        const counted = entries.find(
          (e) =>
            e.summary?.includes(WAITING) &&
            (e.changes as { daysMatched?: number } | null)?.daysMatched === 2,
        );
        expect(counted).toBeDefined();
      });

      it('leaves a day alone once a payroll run has used it, when the number changes again', async () => {
        const eight = await dayId(WAITING, 10);
        await prisma.attendanceRecord.update({
          where: {
            employeeId_workDate: { employeeId: cat.id, workDate: new Date(`${iso(10)}T00:00:00Z`) },
          },
          data: { lockedAt: new Date() },
        });
        const moved = await api.patch(`/employees/${cat.id}`, hr, { scannerId: '0091' });
        expect(moved.status).toBe(200);
        expect(
          (await prisma.scannerDay.findUniqueOrThrow({ where: { id: eight } })).employeeId,
        ).toBe(cat.id);
        expect(await activeOf(cat.id, 10)).toHaveLength(2);
        expect((await api.get(`/attendance/scanner/days/${eight}`, hr)).body.locked).toBe(true);
      });

      it('refuses a number that belongs to someone else, and lets a number be cleared', async () => {
        const taken = await api.patch(`/employees/${cat.id}`, hr, { scannerId: B });
        expect(taken.status).toBe(409);
        expect(taken.body.code).toBe('DUPLICATE_SCANNER_ID');
        expect((await prisma.employee.findUniqueOrThrow({ where: { id: cat.id } })).scannerId).toBe(
          '0091',
        );

        const cleared = await api.patch(`/employees/${cat.id}`, hr, { scannerId: null });
        expect(cleared.status).toBe(200);
        expect(cleared.body.scannerId).toBeNull();
      });
    });
  });

  describe('a file that is not what the scanner writes', () => {
    const before = () => prisma.scannerImport.count();

    it('is refused whole, naming the row and column, and writes nothing', async () => {
      const count = await before();
      const bad = scannerFile([
        line('แอน ทดสอบ', A, 8, '08:00 17:00'),
        line('แอน ทดสอบ', 'x', 9, '08:00'),
        line('แอน ทดสอบ', A, 10, '8.00'),
      ]);
      const preview = await api.upload('/attendance/scanner/preview', hr, bad);
      expect(preview.status).toBe(200);
      expect(preview.body.problems.map((p: any) => [p.row, p.column, p.code])).toEqual([
        [2, 'B', 'INVALID_SCANNER_NUMBER'],
        [3, 'D', 'INVALID_TIME'],
      ]);

      const refused = await api.upload('/attendance/scanner/import', hr, bad);
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe('IMPORT_HAS_PROBLEMS');
      expect(await before()).toBe(count);
      expect(
        await prisma.scannerDay.count({ where: { workDate: new Date(`${iso(8)}T00:00:00Z`) } }),
      ).toBe(0);
    });

    it('is refused when a year looks Buddhist, instead of being read as one', async () => {
      const be = scannerFile(['แอน ,\t9001 ,\t08/03/2580 ,\t08:00 17:00 ,\t']);
      const res = await api.upload('/attendance/scanner/preview', hr, be);
      expect(res.body.problems).toMatchObject([{ row: 1, code: 'YEAR_OUT_OF_RANGE' }]);
    });

    it('is refused when it has no byte-order mark, however it is named', async () => {
      const bare = {
        filename: 'Export.xls',
        contentType: 'application/vnd.ms-excel',
        content: Buffer.from(line('แอน', A, 8, '08:00 17:00'), 'utf16le'),
      };
      const res = await api.upload('/attendance/scanner/preview', hr, bare);
      expect(res.body.problems).toMatchObject([{ row: 0, code: 'UNSUPPORTED_ENCODING' }]);
    });

    it('takes nothing but name, number, date and times: a fifth field is refused, not kept', async () => {
      const count = await before();
      const withExtra = scannerFile([
        [
          'แอน ,',
          `${A} ,`,
          `${date(8)} ,`,
          '08:00 17:00 ,',
          'UEsDBBQAAAAIAFpingerprintTemplateBytes',
        ].join('\t'),
      ]);
      const res = await api.upload('/attendance/scanner/import', hr, withExtra);
      expect(res.status).toBe(422);
      expect(res.body.details?.problems ?? res.body.problems).toBeDefined();
      expect(await before()).toBe(count);

      // And nothing a template could live in exists: the day's columns are the ones listed.
      const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name LIKE 'scanner_%'
        ORDER BY table_name, ordinal_position`;
      const of = (table: string) =>
        columns.filter((c) => c.table_name === table).map((c) => c.column_name);
      expect(of('scanner_days')).toEqual([
        'id',
        'organizationId',
        'scannerNumber',
        'name',
        'workDate',
        'times',
        'employeeId',
        'firstImportId',
        'lastImportId',
        'createdAt',
        'updatedAt',
      ]);
    });
  });
});
