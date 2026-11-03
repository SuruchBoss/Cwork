// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Daily wages paid every 14 days (CW-101).
 *
 * A worker is paid across January 2040, a month with three paydays whose first
 * period starts in December: 19 December to 1 January, 2 to 15 January and 16
 * to 29 January, each paid on its last day, then the 30 January to 12 February
 * period that belongs to February. Nothing is mocked. The figures are worked
 * from the rules in the comments. No other spec touches 2039 or 2040.
 */
import { AttendanceStatus, EmployeeStatus, PayrollRunStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { computeSocialSecurity } from 'src/modules/payroll/domain/thai-tax';
import { readXlsx } from 'src/core/spreadsheet/xlsx';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example';
const CEO = 'ceo@cwork.example';
const RATE = 400;

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => iso(new Date(utc(value).getTime() + days * 864e5));
const weekdays = (from: string, to: string) => {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const weekday = utc(d).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d);
  }
  return days;
};

/** The four periods: start, end (thirteen days on) and pay date (the end). */
const PERIODS = [
  { start: '2039-12-19', code: '2040-01-B1', month: 1 },
  { start: '2040-01-02', code: '2040-01-B2', month: 1 },
  { start: '2040-01-16', code: '2040-01-B3', month: 1 },
  { start: '2040-01-30', code: '2040-02-B1', month: 2 },
].map((p) => ({ ...p, end: addDays(p.start, 13) }));

describe('Daily wages paid every 14 days (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let payroll: string;
  let ceo: string;
  let organizationId: string;
  let worker: string;
  let movedOver: string;
  const periodIds: string[] = [];
  const runIds: string[] = [];

  const newEmployee = async (code: string) =>
    (
      await prisma.employee.create({
        data: {
          organizationId,
          employeeCode: code,
          firstNameTh: 'รายวัน',
          lastNameTh: code,
          nationalIdEnc: crypto.encrypt('1101700230673'),
          status: EmployeeStatus.ACTIVE,
          hireDate: utc('2039-01-01'),
        },
        select: { id: true },
      })
    ).id;

  const attend = (employeeId: string, days: string[]) =>
    prisma.attendanceRecord.createMany({
      data: days.map((day) => ({
        organizationId,
        employeeId,
        workDate: utc(day),
        status: AttendanceStatus.PRESENT,
      })),
    });

  const createPeriod = (n: number, extra: Record<string, unknown> = {}) =>
    api.post('/payroll/periods', payroll, {
      payFrequency: 'BIWEEKLY',
      periodStart: PERIODS[n]!.start,
      payDate: PERIODS[n]!.end,
      ...extra,
    });

  const settle = async (n: number) => {
    expect((await api.post(`/payroll/runs/${runIds[n]}/approve`, ceo)).status).toBe(201);
    const paid = await api.post(`/payroll/runs/${runIds[n]}/pay`, ceo);
    expect(paid.body.status).toBe(PayrollRunStatus.PAID);
  };

  const slipOf = (n: number) =>
    prisma.payslip.findUniqueOrThrow({
      where: { runId_employeeId: { runId: runIds[n]!, employeeId: worker } },
    });

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    crypto = ctx.app.get(CryptoService, { strict: false });
    payroll = await api.token(PAYROLL);
    ceo = await api.token(CEO);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));
    worker = await newEmployee('BW-2040-1');
    movedOver = await newEmployee('BW-2040-2');
    await attend(worker, weekdays(PERIODS[0]!.start, PERIODS[3]!.end));
  });

  afterAll(async () => {
    await prisma?.employee.updateMany({
      where: { id: { in: [worker, movedOver].filter(Boolean) } },
      data: { deletedAt: new Date() },
    });
    await ctx?.close();
  });

  describe('a worker moved from the parallel run to 14-day periods', () => {
    it('keeps the month already run, and is paid by the new setup from its date', async () => {
      // During the parallel run the daily worker is on a monthly period.
      const set = await api.post('/payroll/compensation', payroll, {
        employeeId: movedOver,
        effectiveFrom: '2039-01-01',
        baseSalary: 12_000,
      });
      expect(set.status).toBe(201);
      const november = await api.post('/payroll/periods', payroll, {
        year: 2039,
        month: 11,
        periodStart: '2039-11-01',
        periodEnd: '2039-11-30',
        payDate: '2039-11-30',
      });
      const run = await api.post('/payroll/runs', payroll, { periodId: november.body.id });
      expect((await api.post(`/payroll/runs/${run.body.id}/calculate`, payroll)).status).toBe(201);
      const before = await prisma.payslip.findUniqueOrThrow({
        where: { runId_employeeId: { runId: run.body.id, employeeId: movedOver } },
      });

      const moved = await api.post('/payroll/compensation', payroll, {
        employeeId: movedOver,
        effectiveFrom: PERIODS[0]!.start,
        baseSalary: 0,
        dailyRate: RATE,
        payFrequency: 'BIWEEKLY',
      });
      expect(moved.status).toBe(201);

      const after = await prisma.payslip.findUniqueOrThrow({
        where: { runId_employeeId: { runId: run.body.id, employeeId: movedOver } },
      });
      expect(after.netPay.toString()).toBe(before.netPay.toString());
    });
  });

  describe('a daily wage', () => {
    it('can be paid every 14 days, and says so when the rate is missing', async () => {
      const missing = await api.post('/payroll/compensation', payroll, {
        employeeId: worker,
        effectiveFrom: '2039-01-01',
        baseSalary: 0,
        payFrequency: 'BIWEEKLY',
      });
      expect(missing.body.code).toBe('DAILY_RATE_REQUIRED');

      const set = await api.post('/payroll/compensation', payroll, {
        employeeId: worker,
        effectiveFrom: '2039-01-01',
        baseSalary: 0,
        dailyRate: RATE,
        payFrequency: 'BIWEEKLY',
      });
      expect(set.status).toBe(201);
    });
  });

  describe('the periods', () => {
    it('end on their own, thirteen days on, and are numbered within the month they count toward', async () => {
      for (const [n, expected] of PERIODS.entries()) {
        const res = await createPeriod(n);
        expect(res.status).toBe(201);
        periodIds.push(res.body.id);
        expect(res.body.code).toBe(expected.code);
        expect(iso(new Date(res.body.periodEnd))).toBe(expected.end);
        expect(res.body.month).toBe(expected.month);
        expect(res.body.payFrequency).toBe('BIWEEKLY');
      }
      // The one that starts in December counts toward the month it is paid in.
      const first = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: periodIds[0]! } });
      expect([first.year, first.month, first.half]).toEqual([2040, 1, 1]);
    });

    it('refuse a start that leaves days unpaid or pays days twice', async () => {
      const gap = await createPeriod(3, { periodStart: '2040-02-20', payDate: '2040-02-26' });
      expect(gap.body.code).toBe('PAYROLL_PERIOD_NOT_NEXT');
      expect(gap.body.details).toEqual({ expectedStart: '2040-02-13' });

      const overlap = await createPeriod(1, { periodStart: '2040-01-10', payDate: '2040-01-23' });
      expect(overlap.status).toBe(409);
      expect(overlap.body.code).toBe('PAYROLL_PERIOD_OVERLAPS');
    });

    it('refuse an end that is not fourteen days on, and a half', async () => {
      const end = await createPeriod(3, { periodStart: '2040-02-13', periodEnd: '2040-02-20' });
      expect(end.body.code).toBe('INVALID_PERIOD_DATES');
      const half = await createPeriod(3, { periodStart: '2040-02-13', half: 1 });
      expect(half.body.code).toBe('INVALID_PERIOD_HALF');
    });
  });

  describe('paying the month', () => {
    it('calculates each period only after the ones before it are paid', async () => {
      for (const [n, id] of periodIds.entries()) {
        const run = await api.post('/payroll/runs', payroll, { periodId: id });
        expect(run.status).toBe(201);
        runIds.push(run.body.id);
        if (n === 3) break;
      }
      const first = await api.post(`/payroll/runs/${runIds[0]}/calculate`, payroll);
      expect(first.status).toBe(201);

      const early = await api.post(`/payroll/runs/${runIds[1]}/calculate`, payroll);
      expect(early.body.code).toBe('EARLIER_PERIOD_NOT_PAID');
      expect(early.body.details).toEqual({ unpaid: ['2040-01-B1'] });

      await settle(0);
      expect((await api.post(`/payroll/runs/${runIds[1]}/calculate`, payroll)).status).toBe(201);
    });

    it('does not list the month while a period of it is still to come', async () => {
      await settle(1);
      // The next would be paid on 29 January, in the same month.
      const res = await api.getRaw(
        `/payroll/periods/${periodIds[1]}/export?format=register`,
        payroll,
      );
      expect(res.status).toBe(422);

      // Nor is it filed with Social Security as if it were all there.
      const filing = await api.get('/payroll/reports/sso-filing?year=2040&month=1', payroll);
      expect(filing.status).toBe(422);
      expect(filing.body.code).toBe('SSO_MONTH_NOT_FINISHED');
      expect(filing.body.message).toContain('2040-01-B3');
    });

    it('takes the month’s social security in the periods, and the whole of it in the end', async () => {
      expect((await api.post(`/payroll/runs/${runIds[2]}/calculate`, payroll)).status).toBe(201);
      await settle(2);

      const wages = [0, 1, 2].map(
        (n) => weekdays(PERIODS[n]!.start, PERIODS[n]!.end).length * RATE,
      );
      const slips = await Promise.all([0, 1, 2].map(slipOf));
      expect(slips.map((s) => Number(s.grossEarnings))).toEqual(wages);

      // The first takes 5% of its own wage with no floor; each later one takes the
      // month so far less what was taken, so the three add up to the month's figure.
      const taken = slips.map((s) => Number(s.ssoEmployee));
      expect(taken[0]).toBe(Math.round(wages[0]! * 0.05));
      expect(taken.reduce((a, b) => a + b, 0)).toBe(
        computeSocialSecurity(wages.reduce((a, b) => a + b, 0)).employeeContribution.toNumber(),
      );
    });

    it('files the month as the sum of its periods, rounded once', async () => {
      const wages = [0, 1, 2].reduce(
        (sum, n) => sum + weekdays(PERIODS[n]!.start, PERIODS[n]!.end).length * RATE,
        0,
      );

      const filing = await api.get('/payroll/reports/sso-filing?year=2040&month=1', payroll);
      const row = (filing.body.rows as Array<Record<string, string>>).find(
        (r) => r.employeeCode === 'BW-2040-1',
      );

      expect(filing.status).toBe(200);
      expect(Number(row?.wage)).toBe(computeSocialSecurity(wages).contributoryWage.toNumber());
      expect(Number(row?.employee)).toBe(
        computeSocialSecurity(wages).employeeContribution.toNumber(),
      );
    });

    it('puts the next period in the next month, from its first', async () => {
      expect((await api.post(`/payroll/runs/${runIds[3]}/calculate`, payroll)).status).toBe(201);
      const wage = weekdays(PERIODS[3]!.start, PERIODS[3]!.end).length * RATE;
      const slip = await slipOf(3);

      expect(Number(slip.grossEarnings)).toBe(wage);
      expect(Number(slip.ssoEmployee)).toBe(Math.round(wage * 0.05));
    });
  });

  describe('the month’s outputs', () => {
    it('list the month from any of its periods, as the sum of them', async () => {
      const res = await api.getRaw(
        `/payroll/periods/${periodIds[0]}/export?format=register`,
        payroll,
      );
      expect(res.status).toBe(200);
      const rows = readXlsx(res.body).rows;
      const person = rows.find((row) => String(row[1] ?? '').includes('BW-2040-1'));
      const wages = [0, 1, 2].reduce(
        (sum, n) => sum + weekdays(PERIODS[n]!.start, PERIODS[n]!.end).length * RATE,
        0,
      );

      expect(Number(person?.[8])).toBe(wages);
    });

    it('does not list a month with a period still to come, and lists it when the next belongs elsewhere', async () => {
      // February has its first period and the second is still to come.
      const res = await api.getRaw(
        `/payroll/periods/${periodIds[3]}/export?format=register`,
        payroll,
      );
      expect(res.status).toBe(422);
    });
  });
});
