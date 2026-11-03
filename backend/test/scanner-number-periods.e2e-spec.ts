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
  let admin: string;
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
    admin = await api.token('hr.manager@cwork.example');
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

  it('gives every one of many rounds of the same race one winner and a refusal in words, never a server error', async () => {
    // Two inserts for one number at the same moment can wait on each other and
    // one used to be rolled back as a deadlock and answered as a server error,
    // about once in a hundred rounds. The writes now take their turn.
    const seen = new Set<string>();
    await takeNumbers(prisma, [ben, cat]);
    for (let round = 0; round < 150; round += 1) {
      const number = `97${String(round).padStart(3, '0')}`;
      const answers = await Promise.all([bind(number, ben, 'ALWAYS'), bind(number, cat, 'ALWAYS')]);
      seen.add(
        answers
          .map((a) => `${a.status}${a.body.code ? `:${a.body.code}` : ''}`)
          .sort()
          .join(' + '),
      );
      await takeNumbers(prisma, [ben, cat]);
    }

    expect([...seen]).toEqual(['200 + 409:DUPLICATE_SCANNER_ID']);
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

  describe('ending a number gives the later days back (CW-109)', () => {
    const X = '9310';
    const Y = '9311';
    const Z = '9312';
    const activeLinksOf = (day: number, number: string) =>
      prisma.scannerPunchLink.count({
        where: {
          supersededAt: null,
          scannerDay: {
            scannerNumber: number,
            workDate: new Date(`${iso(day)}T00:00:00Z`),
          },
        },
      });
    const bindingOf = async (number: string, employeeId: string) =>
      prisma.employeeScannerNumber.findFirstOrThrow({
        where: { scannerNumber: number, employeeId, validTo: null },
      });

    beforeAll(async () => {
      await takeNumbers(prisma, [ann, ben, cat]);
    });

    afterAll(async () => {
      await takeNumbers(prisma, [ann, ben, cat]);
    });

    it('sends the days after the end back to no one, sets their punches aside, and counts them for the next holder', async () => {
      expect((await bind(X, cat, 'ALWAYS')).status).toBe(200);
      await importDays(X, [10, 12]);
      expect(await ownerOfDay(X, 10)).toBe(cat);
      expect(await ownerOfDay(X, 12)).toBe(cat);
      expect(await activeLinksOf(12, X)).toBeGreaterThan(0);

      const open = await bindingOf(X, cat);
      const preview = await api.get(
        `/attendance/scanner/numbers/${open.id}/end-preview?endDate=${iso(10)}`,
        hr,
      );
      expect(preview.status).toBe(200);
      expect(preview.body).toMatchObject({
        daysReleased: 1,
        firstDay: iso(12),
        lastDay: iso(12),
        daysKept: 0,
        blocked: null,
      });
      // Asking changes nothing.
      expect(await ownerOfDay(X, 12)).toBe(cat);

      const ended = await api.post(`/attendance/scanner/numbers/${open.id}/end`, hr, {
        endDate: iso(10),
      });
      expect(ended.status).toBe(200);
      expect(ended.body).toMatchObject({ validTo: iso(10), daysReleased: 1, daysMatched: 0 });

      expect(await ownerOfDay(X, 10)).toBe(cat);
      expect(await ownerOfDay(X, 12)).toBeNull();
      expect(await activeLinksOf(12, X)).toBe(0);
      expect(await activeLinksOf(10, X)).toBeGreaterThan(0);
      expect(await unownedDaysOf(X)).toBe(1);

      // The next holder, from the day after the end, takes the day that went back.
      const next = await bind(X, ben, 'ALWAYS');
      expect(next.status).toBe(200);
      expect(next.body).toMatchObject({ daysMatched: 1 });
      expect(await ownerOfDay(X, 12)).toBe(ben);
      expect(await activeLinksOf(12, X)).toBeGreaterThan(0);
    });

    it('gives every round of two ends of one number at once one winner and a refusal in words (CW-112)', async () => {
      // Ending checked the number and then wrote, without the lock a bind takes, so
      // two ends of one period could both pass the check and both write.
      const seen = new Set<string>();
      for (let round = 0; round < 40; round += 1) {
        const number = `95${String(round).padStart(3, '0')}`;
        await takeNumbers(prisma, [cat]);
        expect((await bind(number, cat, 'ALWAYS')).status).toBe(200);
        const open = await bindingOf(number, cat);
        const ends = [iso(10), iso(11)];
        const answers = await Promise.all(
          ends.map((endDate) =>
            api.post(`/attendance/scanner/numbers/${open.id}/end`, hr, { endDate }),
          ),
        );
        seen.add(
          answers
            .map((a) => `${a.status}${a.body.code ? `:${a.body.code}` : ''}`)
            .sort()
            .join(' + '),
        );
        const winner = answers.findIndex((a) => a.status === 200);
        const row = await prisma.employeeScannerNumber.findUniqueOrThrow({
          where: { id: open.id },
        });
        expect(row.validTo?.toISOString().slice(0, 10)).toBe(ends[winner]);
        expect(
          await prisma.auditLog.count({
            where: {
              entityId: cat,
              summary: { startsWith: `Ended scanner number ${number} ` },
            },
          }),
        ).toBe(1);
      }
      expect([...seen]).toEqual(['200 + 422:SCANNER_NUMBER_ALREADY_ENDED']);
    });

    it('keeps a later day somebody decided with whom it was decided for', async () => {
      expect((await bind(Y, cat, 'ALWAYS')).status).toBe(200);
      await importDays(Y, [10, 12, 14]);
      const decided = await prisma.scannerDay.findFirstOrThrow({
        where: { scannerNumber: Y, workDate: new Date(`${iso(14)}T00:00:00Z`) },
      });
      const decision = await api.post(`/attendance/scanner/days/${decided.id}/decision`, hr, {
        action: 'IGNORE',
      });
      expect(decision.status).toBeLessThan(300);

      const open = await bindingOf(Y, cat);
      const ended = await api.post(`/attendance/scanner/numbers/${open.id}/end`, hr, {
        endDate: iso(10),
      });
      expect(ended.status).toBe(200);
      expect(ended.body).toMatchObject({ daysReleased: 1 });
      expect(await ownerOfDay(Y, 12)).toBeNull();
      expect(await ownerOfDay(Y, 14)).toBe(cat);
    });

    it('refuses the end before a day a payroll run has calculated, and changes nothing', async () => {
      expect((await bind(Z, cat, 'ALWAYS')).status).toBe(200);
      await importDays(Z, [14]);
      const period = await api.post('/payroll/periods', admin, {
        year: YEAR,
        month: 3,
        periodStart: `${YEAR}-03-01`,
        periodEnd: `${YEAR}-03-31`,
        payDate: `${YEAR}-03-31`,
      });
      expect(period.body.id).toBeTruthy();
      const run = await api.post('/payroll/runs', admin, { periodId: period.body.id });
      expect(run.body.id).toBeTruthy();
      const calculated = await api.post(`/payroll/runs/${run.body.id}/calculate`, admin);
      expect(calculated.body.status).toBe('CALCULATED');

      try {
        const open = await bindingOf(Z, cat);
        const blocked = await api.get(
          `/attendance/scanner/numbers/${open.id}/end-preview?endDate=${iso(10)}`,
          hr,
        );
        expect(blocked.body.blocked).toMatchObject({ date: iso(14), runNo: run.body.runNo });

        const refused = await api.post(`/attendance/scanner/numbers/${open.id}/end`, hr, {
          endDate: iso(10),
        });
        expect(refused.status).toBe(422);
        expect(refused.body.code).toBe('SCANNER_DAY_IN_PAYROLL_RUN');
        expect(refused.body.message).toContain(iso(14));
        expect(refused.body.message).toContain(run.body.runNo);
        expect(refused.body.message).toMatch(/[\u0E00-\u0E7F]/);

        expect((await bindingOf(Z, cat)).validTo).toBeNull();
        expect(await ownerOfDay(Z, 14)).toBe(cat);
        expect(await activeLinksOf(14, Z)).toBeGreaterThan(0);

        // Ending on or after that day does not touch it.
        const later = await api.post(`/attendance/scanner/numbers/${open.id}/end`, hr, {
          endDate: iso(20),
        });
        expect(later.status).toBe(200);
        expect(await ownerOfDay(Z, 14)).toBe(cat);
      } finally {
        await api.post(`/payroll/runs/${run.body.id}/cancel`, admin);
      }
    });
  });

  describe('a day that changes hands is counted for its new holder (CW-109)', () => {
    const K1 = '9340';
    const K2 = '9341';
    const atDay = (day: number) => new Date(`${iso(day)}T00:00:00Z`);
    /** Every punch link of a day, with whose punch it is and whether it is in force. */
    const linksOfDay = async (number: string, day: number) =>
      (
        await prisma.scannerPunchLink.findMany({
          where: { scannerDay: { scannerNumber: number, workDate: atDay(day) } },
          select: { supersededAt: true, punch: { select: { employeeId: true, type: true } } },
        })
      ).map((l) => ({
        holder: l.punch.employeeId,
        type: l.punch.type,
        inForce: l.supersededAt === null,
      }));
    const inForceOf = async (number: string, day: number) =>
      (await linksOfDay(number, day)).filter((l) => l.inForce);
    const minutesOf = async (employeeId: string, day: number) =>
      (
        await prisma.attendanceRecord.findUnique({
          where: { employeeId_workDate: { employeeId, workDate: atDay(day) } },
        })
      )?.workedMinutes ?? 0;
    const endAt = async (number: string, employeeId: string, day: number) => {
      const open = await prisma.employeeScannerNumber.findFirstOrThrow({
        where: { scannerNumber: number, employeeId, validTo: null },
      });
      return api.post(`/attendance/scanner/numbers/${open.id}/end`, hr, { endDate: iso(day) });
    };

    beforeAll(async () => {
      await takeNumbers(prisma, [ann, ben, cat]);
    });
    afterAll(async () => {
      await takeNumbers(prisma, [ann, ben, cat]);
    });

    it('gives the next holder punches of their own and their worked time, and leaves the first holder’s punches set aside', async () => {
      expect((await bind(K1, cat, 'ALWAYS')).status).toBe(200);
      const file = scannerFile([
        line(K1, 10),
        line(K1, 12),
        // The 14th is a single scan: it waits for HR and has no punches.
        `ทดสอบ ,\t${K1} ,\t${date(14)} ,\t08:00 ,\t`,
      ]);
      expect((await api.upload('/attendance/scanner/import', hr, file)).status).toBeLessThan(300);
      expect(await minutesOf(cat, 12)).toBeGreaterThan(0);
      const catPunches = await linksOfDay(K1, 12);
      expect(catPunches).toHaveLength(2);

      const ended = await endAt(K1, cat, 11);
      expect(ended.body).toMatchObject({ daysReleased: 2 });
      expect(await ownerOfDay(K1, 12)).toBeNull();
      expect((await linksOfDay(K1, 12)).every((l) => !l.inForce)).toBe(true);
      expect(await minutesOf(cat, 12)).toBe(0);

      const next = await bind(K1, ben, 'ALWAYS');
      expect(next.status).toBe(200);
      expect(next.body).toMatchObject({ daysMatched: 2, punchesAdded: 2 });

      expect(await ownerOfDay(K1, 12)).toBe(ben);
      const links = await linksOfDay(K1, 12);
      // The first holder's two punches stay set aside; the new holder has two of their own.
      expect(links.filter((l) => l.holder === cat)).toHaveLength(2);
      expect(links.filter((l) => l.holder === cat).every((l) => !l.inForce)).toBe(true);
      expect(links.filter((l) => l.holder === ben)).toHaveLength(2);
      expect(links.filter((l) => l.holder === ben).every((l) => l.inForce)).toBe(true);
      expect((await inForceOf(K1, 12)).map((l) => l.type).sort()).toEqual([
        'CLOCK_IN',
        'CLOCK_OUT',
      ]);
      expect(await minutesOf(ben, 12)).toBeGreaterThan(0);
      expect(await minutesOf(cat, 12)).toBe(0);
      // The day before the end is still the first holder's, with its worked time.
      expect(await ownerOfDay(K1, 10)).toBe(cat);
      expect(await minutesOf(cat, 10)).toBeGreaterThan(0);
      expect((await inForceOf(K1, 10)).every((l) => l.holder === cat)).toBe(true);
    });

    it('does the same through three holders in a row, each with punches and time of their own', async () => {
      await takeNumbers(prisma, [ann, ben, cat]);
      expect((await bind(K2, cat, 'ALWAYS')).status).toBe(200);
      const file = scannerFile([20, 22, 23, 24].map((day) => line(K2, day)));
      expect((await api.upload('/attendance/scanner/import', hr, file)).status).toBeLessThan(300);

      expect((await endAt(K2, cat, 21)).body).toMatchObject({ daysReleased: 3 });
      const second = await bind(K2, ben, 'ALWAYS');
      expect(second.body).toMatchObject({ daysMatched: 3, punchesAdded: 6 });

      expect((await endAt(K2, ben, 22)).body).toMatchObject({ daysReleased: 2 });
      const third = await bind(K2, ann, 'ALWAYS');
      expect(third.body).toMatchObject({ daysMatched: 2, punchesAdded: 4 });

      const owners: Record<number, string> = { 20: cat, 22: ben, 23: ann, 24: ann };
      for (const [day, owner] of Object.entries(owners)) {
        const d = Number(day);
        expect(await ownerOfDay(K2, d)).toBe(owner);
        const inForce = await inForceOf(K2, d);
        expect(inForce).toHaveLength(2);
        expect(inForce.every((l) => l.holder === owner)).toBe(true);
        expect(await minutesOf(owner, d)).toBeGreaterThan(0);
        for (const other of [cat, ben, ann].filter((e) => e !== owner)) {
          expect(await minutesOf(other, d)).toBe(0);
        }
      }
      // The 23rd passed through two holders: the first two have a set-aside pair each, never in force.
      const thirteen = await linksOfDay(K2, 23);
      expect(thirteen.filter((l) => l.holder === cat && !l.inForce)).toHaveLength(2);
      expect(thirteen.filter((l) => l.holder === ben && !l.inForce)).toHaveLength(2);
      expect(thirteen.filter((l) => l.holder === ann && l.inForce)).toHaveLength(2);
    });
  });

  describe('a number asked for again names the period that stands in the way (CW-109)', () => {
    const W = '9320';

    it('points to whoever holds the number now, not to the first period it ever had', async () => {
      await takeNumbers(prisma, [ann, ben, cat]);
      await importDays(W, [1, 2, 6, 7]);
      expect((await bind(W, ann, 'THESE_DAYS')).status).toBe(200);
      // ann holds 1-7, ended; ben holds it from the day after.
      const holder = await prisma.employeeScannerNumber.findFirstOrThrow({
        where: { employeeId: ann, scannerNumber: W },
      });
      expect(holder.validTo).not.toBeNull();
      expect((await bind(W, ben, 'ALWAYS')).status).toBe(200);
      const benCode = (await prisma.employee.findUniqueOrThrow({ where: { id: ben } }))
        .employeeCode;
      const annCode = (await prisma.employee.findUniqueOrThrow({ where: { id: ann } }))
        .employeeCode;

      const typed = await api.patch(`/employees/${cat}`, hr, { scannerId: W });

      expect(typed.status).toBe(409);
      expect(typed.body.details).toMatchObject({ employeeCode: benCode });
      expect(typed.body.message).toContain(benCode);
      expect(typed.body.message).not.toContain(annCode);
      await takeNumbers(prisma, [ann, ben, cat]);
    });
  });

  describe('the numbers still waiting say what "from now on" would do (CW-109)', () => {
    const V = '9330';

    it('gives the day it would start and how many waiting days it would count', async () => {
      await takeNumbers(prisma, [ann, ben, cat]);
      await importDays(V, [3, 4, 9, 10]);
      expect((await bind(V, ann, 'THESE_DAYS')).status).toBe(200);
      const row = (
        (await api.get('/attendance/scanner/unmapped', hr)).body as Array<Record<string, unknown>>
      ).find((n) => n.scannerNumber === V);
      // Every waiting day was taken by the bound period (3 to 10), so none is left.
      expect(row).toBeUndefined();

      // Two more days after it wait; from now on starts the day after the period's end.
      await importDays(V, [15, 16]);
      const waiting = (
        (await api.get('/attendance/scanner/unmapped', hr)).body as Array<Record<string, unknown>>
      ).find((n) => n.scannerNumber === V);
      expect(waiting).toMatchObject({
        foreverPossible: true,
        foreverFrom: iso(11),
        foreverDays: 2,
      });
      await takeNumbers(prisma, [ann, ben, cat]);
    });

    it('says it cannot be bound from now on while someone holds the number', async () => {
      const U = '9331';
      await takeNumbers(prisma, [ann, ben, cat]);
      await importDays(U, [3]);
      expect((await bind(U, ann, 'ALWAYS')).status).toBe(200);
      await prisma.scannerDay.updateMany({
        where: { scannerNumber: U },
        data: { employeeId: null },
      });
      const row = (
        (await api.get('/attendance/scanner/unmapped', hr)).body as Array<Record<string, unknown>>
      ).find((n) => n.scannerNumber === U);
      expect(row).toMatchObject({ foreverPossible: false, foreverDays: 0 });
      await takeNumbers(prisma, [ann, ben, cat]);
    });
  });
});
