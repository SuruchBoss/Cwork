// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * A scanner number bound to an employee for a period (CW-109), against a real
 * database. The files are synthetic, in the scanner's layout, from made-up
 * numbers. No other spec touches 2039 or these numbers.
 */
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './utils/database';
import { takeNumbers } from './utils/scanner-numbers';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.officer@cwork.example';
const YEAR = 2039;
const N = '9301';
const M1 = '9302';
const M2 = '9303';

const date = (day: number) => `${String(day).padStart(2, '0')}/03/${YEAR}`;
const iso = (day: number) => `${YEAR}-03-${String(day).padStart(2, '0')}`;
const line = (number: string, day: number) =>
  [`ทดสอบ ,`, `${number} ,`, `${date(day)} ,`, `08:00 17:00 ,`, ''].join('\t');
const scannerFile = (lines: string[]) => ({
  filename: 'Export.xls',
  contentType: 'application/vnd.ms-excel',
  content: Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(lines.join('\r\n') + '\r\n', 'utf16le'),
  ]),
});

describe('A scanner number bound for a period (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaClient;
  let hr: string;
  let ann: string;
  let ben: string;
  let cat: string;

  const person = async (email: string) =>
    (await prisma.employee.findFirstOrThrow({ where: { workEmail: email }, select: { id: true } }))
      .id;
  const importDays = async (number: string, days: number[]) => {
    const res = await api.upload(
      '/attendance/scanner/import',
      hr,
      scannerFile(days.map((day) => line(number, day))),
    );
    expect(res.status).toBeLessThan(300);
  };
  const ownerOfDay = async (number: string, day: number) =>
    (
      await prisma.scannerDay.findFirstOrThrow({
        where: { scannerNumber: number, workDate: new Date(`${iso(day)}T00:00:00Z`) },
        select: { employeeId: true },
      })
    ).employeeId;
  const unownedDaysOf = async (number: string) =>
    (
      (await api.get('/attendance/scanner/unmapped', hr)).body as {
        scannerNumber: string;
        days: number;
      }[]
    ).find((n) => n.scannerNumber === number)?.days ?? 0;
  const bind = (number: string, employeeId: string, scope?: 'ALWAYS' | 'THESE_DAYS') =>
    api.post('/attendance/scanner/unmapped/bind', hr, { scannerNumber: number, employeeId, scope });
  const periodsOf = (number: string) =>
    prisma.employeeScannerNumber.findMany({
      where: { scannerNumber: number },
      orderBy: { validFrom: 'asc' },
    });

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
    hr = await api.token(HR);
    ann = await person('dev1@cwork.example');
    ben = await person('sales1@cwork.example');
    cat = await person('eng.manager@cwork.example');
    await takeNumbers(prisma, [ann, ben, cat]);
  });

  afterAll(async () => {
    if (prisma) {
      await takeNumbers(prisma, [ann, ben, cat]);
      await prisma.$disconnect();
    }
    await ctx?.close();
  });

  it('binds a number for the days nobody owns only, and leaves the employee with no number in use', async () => {
    await importDays(N, [1, 2, 3]);
    expect(await unownedDaysOf(N)).toBe(3);

    const bound = await bind(N, ann, 'THESE_DAYS');
    expect(bound.status).toBe(200);
    expect(bound.body).toMatchObject({ daysMatched: 3 });
    expect(await unownedDaysOf(N)).toBe(0);

    const [period] = await periodsOf(N);
    expect(period.validFrom?.toISOString().slice(0, 10)).toBe(iso(1));
    expect(period.validTo?.toISOString().slice(0, 10)).toBe(iso(3));
    const employee = await api.get(`/employees/${ann}`, hr);
    expect(employee.body.scannerId).toBeNull();
    expect(employee.body.scannerNumbers).toHaveLength(1);
  });

  it('counts a day outside every period of the number as a number nobody owns', async () => {
    await importDays(N, [1, 2, 3, 4, 5]);

    expect(await ownerOfDay(N, 3)).toBe(ann);
    expect(await ownerOfDay(N, 4)).toBeNull();
    expect(await ownerOfDay(N, 5)).toBeNull();
    expect(await unownedDaysOf(N)).toBe(2);
  });

  it('gives the same number to someone else for the next days, and refuses a period that meets another', async () => {
    const second = await bind(N, ben, 'THESE_DAYS');
    expect(second.status).toBe(200);
    expect(await ownerOfDay(N, 4)).toBe(ben);
    expect(await ownerOfDay(N, 1)).toBe(ann);

    // From now on, from the day after the latest end: nothing meets the two periods.
    const forever = await bind(N, cat, 'ALWAYS');
    expect(forever.status).toBe(200);
    const periods = await periodsOf(N);
    expect(periods).toHaveLength(3);
    expect(periods[2].validFrom?.toISOString().slice(0, 10)).toBe(iso(6));
    expect(periods[2].validTo).toBeNull();

    // Now it is in use: nobody else can have it from now on, and the answer is in Thai.
    const again = await bind(N, ann, 'ALWAYS');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('DUPLICATE_SCANNER_ID');
    expect(again.body.message).toMatch(/[฀-๿]/);
    const typed = await api.patch(`/employees/${ann}`, hr, { scannerId: N });
    expect(typed.status).toBe(409);
    expect(await periodsOf(N)).toHaveLength(3);
  });

  it('counts a day of an imported file to whoever holds the number on that day', async () => {
    await importDays(N, [6, 7]);

    expect(await ownerOfDay(N, 6)).toBe(cat);
    expect(await ownerOfDay(N, 7)).toBe(cat);
    // Days already counted stay where they were.
    expect(await ownerOfDay(N, 2)).toBe(ann);
    expect(await ownerOfDay(N, 5)).toBe(ben);
  });

  it('ends a number on a date: it counts through that day and no later one', async () => {
    const open = (await periodsOf(N)).find((p) => p.validTo === null)!;

    const ended = await api.post(`/attendance/scanner/numbers/${open.id}/end`, hr, {
      endDate: iso(8),
    });
    expect(ended.status).toBe(200);
    expect(ended.body.validTo).toBe(iso(8));

    await importDays(N, [8, 9]);
    expect(await ownerOfDay(N, 8)).toBe(cat);
    expect(await ownerOfDay(N, 9)).toBeNull();

    const twice = await api.post(`/attendance/scanner/numbers/${open.id}/end`, hr, {
      endDate: iso(10),
    });
    expect(twice.status).toBe(422);
    expect(twice.body.code).toBe('SCANNER_NUMBER_ALREADY_ENDED');
  });

  it('refuses an end before the start', async () => {
    const [{ id }] = await prisma.employeeScannerNumber.findMany({
      where: { employeeId: cat, scannerNumber: N },
    });
    await prisma.employeeScannerNumber.update({ where: { id }, data: { validTo: null } });

    const early = await api.post(`/attendance/scanner/numbers/${id}/end`, hr, { endDate: iso(2) });
    expect(early.status).toBe(422);
    expect(early.body.code).toBe('SCANNER_PERIOD_ORDER');
    await prisma.employeeScannerNumber.update({
      where: { id },
      data: { validTo: new Date(`${iso(8)}T00:00:00Z`) },
    });
  });

  it('lets the ended number be given to another employee on the employee page, picking up the days that wait', async () => {
    const typed = await api.patch(`/employees/${ann}`, hr, { scannerId: N });

    expect(typed.status).toBe(200);
    expect(typed.body.scannerId).toBe(N);
    expect(await ownerOfDay(N, 9)).toBe(ann);
    const mine = (await periodsOf(N)).find((p) => p.employeeId === ann && p.validTo === null)!;
    expect(mine.validFrom?.toISOString().slice(0, 10)).toBe(iso(9));
  });

  describe('two requests at once', () => {
    it('give a number to one of two employees, and the other is told it is taken', async () => {
      const [first, second] = await Promise.all([bind(M1, ben, 'ALWAYS'), bind(M1, cat, 'ALWAYS')]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
      expect(await prisma.employeeScannerNumber.count({ where: { scannerNumber: M1 } })).toBe(1);
    });

    it('give one employee two numbers in use at most once', async () => {
      const spare = await person('hr.manager@cwork.example');
      const [first, second] = await Promise.all([
        bind(M2, spare, 'ALWAYS'),
        bind('9304', spare, 'ALWAYS'),
      ]);

      expect([first.status, second.status].filter((s) => s === 200)).toHaveLength(1);
      expect(
        await prisma.employeeScannerNumber.count({ where: { employeeId: spare, validTo: null } }),
      ).toBe(1);
      await takeNumbers(prisma, [spare]);
    });
  });

  it('refuses two periods of one number that overlap, whoever writes them', async () => {
    const [one] = await periodsOf(N);
    await expect(
      prisma.employeeScannerNumber.create({
        data: {
          organizationId: (await prisma.employee.findUniqueOrThrow({ where: { id: cat } }))
            .organizationId,
          employeeId: cat,
          scannerNumber: N,
          validFrom: one.validFrom,
          validTo: one.validTo,
        },
      }),
    ).rejects.toThrow();
  });

  it('refuses a period that ends before it starts', async () => {
    await expect(
      prisma.employeeScannerNumber.create({
        data: {
          organizationId: (await prisma.employee.findUniqueOrThrow({ where: { id: cat } }))
            .organizationId,
          employeeId: cat,
          scannerNumber: '9399',
          validFrom: new Date(`${iso(5)}T00:00:00Z`),
          validTo: new Date(`${iso(4)}T00:00:00Z`),
        },
      }),
    ).rejects.toThrow();
  });
});
