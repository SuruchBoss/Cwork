// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Checking a whole calendar month against HR's own register (CW-103, CW-104).
 *
 * March 2043 has salaried staff on a monthly period and a daily worker on the two
 * half-month periods. HR works the month, so the comparison page reads the month
 * whichever period it is opened from, adds each person's periods up by the same
 * logic as the payroll register, accepts HR's own register as it is (a title, stacked
 * headings, a total row) with one column of employee codes added, and holds back
 * what the first half pays so the second half can be calculated once the first is
 * approved, without waiting for anyone to record a payment. Nothing is mocked.
 */
import {
  AttendanceStatus,
  EmployeeStatus,
  ExpenseClaimStatus,
  PayrollRunStatus,
} from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { readXlsx, writeXlsx } from 'src/core/spreadsheet/xlsx';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example';
const CEO = 'ceo@cwork.example';
const YEAR = 2043;
const MONTH = 3;

const date = (day: number) => `${YEAR}-03-${String(day).padStart(2, '0')}`;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const weekdays = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((d) => {
    const w = utc(date(d)).getUTCDay();
    return w !== 0 && w !== 6;
  });

describe('A month compared with HR’s register (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let payroll: string;
  let ceo: string;
  let organizationId: string;
  let salaried: string;
  let daily: string;
  const periods: Record<'month' | 'h1' | 'h2', string> = { month: '', h1: '', h2: '' };
  const runs: Record<'month' | 'h1' | 'h2', string> = { month: '', h1: '', h2: '' };

  const newEmployee = async (code: string) =>
    (
      await prisma.employee.create({
        data: {
          organizationId,
          employeeCode: code,
          firstNameTh: 'ทดสอบ',
          lastNameTh: code,
          nationalIdEnc: crypto.encrypt('1101700230673'),
          status: EmployeeStatus.ACTIVE,
          hireDate: utc(`${YEAR}-01-01`),
        },
        select: { id: true },
      })
    ).id;

  const period = async (extra: Record<string, unknown>) => {
    const res = await api.post('/payroll/periods', payroll, {
      year: YEAR,
      month: MONTH,
      payDate: date(31),
      ...extra,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  const run = async (periodId: string) => {
    const created = await api.post('/payroll/runs', payroll, { periodId });
    expect(created.status).toBe(201);
    return created.body.id as string;
  };

  const calculate = (runId: string) => api.post(`/payroll/runs/${runId}/calculate`, payroll);
  const approve = async (runId: string) =>
    expect((await api.post(`/payroll/runs/${runId}/approve`, ceo)).status).toBe(201);

  /** What every payslip of the month says, one entry for each person. */
  async function monthFigures() {
    const slips = await prisma.payslip.findMany({
      where: { run: { period: { year: YEAR, month: MONTH } } },
      include: { employee: { select: { employeeCode: true } } },
    });
    const byCode = new Map<
      string,
      { code: string; gross: number; tax: number; sso: number; net: number }
    >();
    for (const slip of slips) {
      const person = byCode.get(slip.employee.employeeCode) ?? {
        code: slip.employee.employeeCode,
        gross: 0,
        tax: 0,
        sso: 0,
        net: 0,
      };
      person.gross += Number(slip.grossEarnings);
      person.tax += Number(slip.withholdingTax);
      person.sso += Number(slip.ssoEmployee);
      person.net += Number(slip.netPay);
      byCode.set(slip.employee.employeeCode, person);
    }
    return [...byCode.values()];
  }

  /** HR's register as it is kept (title, groups, stacked headings, a total row), plus a code column. */
  function hrRegister(figures: Awaited<ReturnType<typeof monthFigures>>) {
    const money = (n: number) => Math.round(n * 100) / 100;
    const rows: (string | number)[][] = [
      ['ทะเบียนเงินเดือนประจำเดือน มีนาคม ปี 2586', '', '', '', '', '', ''],
      ['', '', 'รายการเงินได้', '', 'รายการหัก', '', ''],
      ['', '', '', 'ภาษี', '', '', ''],
      ['ลำดับที่', 'ชื่อ-สกุล', 'รวมเงินได้', '', 'ประกันสังคม', 'รวมเงินได้สุทธิ', 'รหัสพนักงาน'],
      ...figures.map((p, i) => [
        i + 1,
        `ทดสอบ ${p.code}`,
        money(p.gross),
        money(p.tax),
        money(p.sso),
        money(p.net),
        p.code,
      ]),
      [
        '',
        'รวม',
        money(figures.reduce((a, p) => a + p.gross, 0)),
        money(figures.reduce((a, p) => a + p.tax, 0)),
        money(figures.reduce((a, p) => a + p.sso, 0)),
        money(figures.reduce((a, p) => a + p.net, 0)),
        '',
      ],
    ];
    return {
      filename: 'register.xlsx',
      contentType: 'application/octet-stream',
      content: Buffer.from(writeXlsx([{ name: 'Register', rows, headerRows: 4 }])),
    };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    crypto = ctx.app.get(CryptoService, { strict: false });
    payroll = await api.token(PAYROLL);
    ceo = await api.token(CEO);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));

    salaried = await newEmployee('CM-2043-1');
    daily = await newEmployee('CM-2043-2');
    expect(
      (
        await api.post('/payroll/compensation', payroll, {
          employeeId: salaried,
          effectiveFrom: `${YEAR}-01-01`,
          baseSalary: 30_000,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await api.post('/payroll/compensation', payroll, {
          employeeId: daily,
          effectiveFrom: `${YEAR}-01-01`,
          baseSalary: 0,
          dailyRate: 500,
          payFrequency: 'SEMI_MONTHLY',
        })
      ).status,
    ).toBe(201);
    await prisma.attendanceRecord.createMany({
      data: [...weekdays(1, 15), ...weekdays(16, 31)].map((day) => ({
        organizationId,
        employeeId: daily,
        workDate: utc(date(day)),
        status: AttendanceStatus.PRESENT,
      })),
    });

    periods.month = await period({ periodStart: date(1), periodEnd: date(31) });
    periods.h1 = await period({
      payFrequency: 'SEMI_MONTHLY',
      half: 1,
      periodStart: date(1),
      periodEnd: date(15),
      payDate: date(16),
    });
    periods.h2 = await period({
      payFrequency: 'SEMI_MONTHLY',
      half: 2,
      periodStart: date(16),
      periodEnd: date(31),
    });
    for (const key of ['month', 'h1', 'h2'] as const) runs[key] = await run(periods[key]);
  });

  afterAll(async () => {
    await prisma?.employee.updateMany({
      where: { id: { in: [salaried, daily].filter(Boolean) } },
      data: { deletedAt: new Date() },
    });
    await ctx?.close();
  });

  describe('the second half', () => {
    it('is refused while the first half is only calculated', async () => {
      expect((await calculate(runs.h1)).status).toBe(201);

      const early = await calculate(runs.h2);

      expect(early.body.code).toBe('FIRST_HALF_NOT_APPROVED');
    });

    it('is worked out once the first half is approved, though nobody has recorded its payment', async () => {
      // An approved claim for the daily worker, which the first half pays.
      await prisma.expenseClaim.create({
        data: {
          organizationId,
          claimNo: 'CL-CM-2043',
          employeeId: daily,
          title: 'ค่าเดินทาง',
          totalAmount: 200,
          approvedAmount: 200,
          status: ExpenseClaimStatus.APPROVED,
          paymentMethod: 'PAYROLL',
          decidedAt: utc(date(10)),
        },
      });
      expect((await api.post(`/payroll/runs/${runs.h1}/calculate`, payroll)).status).toBe(201);
      await approve(runs.h1);

      const second = await calculate(runs.h2);

      expect(second.status).toBe(201);
      const first = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runs.h1 } });
      expect(first.status).toBe(PayrollRunStatus.APPROVED);
    });

    it('does not pay again what the approved first half pays, before the first half is paid', async () => {
      const claim = await prisma.expenseClaim.findUniqueOrThrow({
        where: { organizationId_claimNo: { organizationId, claimNo: 'CL-CM-2043' } },
      });
      expect(claim.payrollRunId).toBe(runs.h1);

      const lines = (runId: string) =>
        prisma.payslipItem.findMany({
          where: { payslip: { runId, employeeId: daily }, code: 'CL-CM-2043' },
        });
      expect(await lines(runs.h1)).toHaveLength(1);
      expect(await lines(runs.h2)).toHaveLength(0);
    });

    it('still does not, after the first half is paid and the second is calculated again', async () => {
      const paid = await api.post(`/payroll/runs/${runs.h1}/pay`, ceo);
      expect(paid.body.status).toBe(PayrollRunStatus.PAID);
      const claim = await prisma.expenseClaim.findUniqueOrThrow({
        where: { organizationId_claimNo: { organizationId, claimNo: 'CL-CM-2043' } },
      });
      expect(claim.status).toBe(ExpenseClaimStatus.PAID);

      expect((await calculate(runs.h2)).status).toBe(201);

      expect(
        await prisma.payslipItem.count({
          where: { payslip: { runId: runs.h2 }, code: 'CL-CM-2043' },
        }),
      ).toBe(0);
    });

    it('is paid in full by the two halves together, as the month', async () => {
      expect((await calculate(runs.month)).status).toBe(201);
      await approve(runs.month);
      await approve(runs.h2);

      const first = await prisma.payslip.findUniqueOrThrow({
        where: { runId_employeeId: { runId: runs.h1, employeeId: daily } },
      });
      const second = await prisma.payslip.findUniqueOrThrow({
        where: { runId_employeeId: { runId: runs.h2, employeeId: daily } },
      });
      const wage = (weekdays(1, 15).length + weekdays(16, 31).length) * 500;

      // The claim (200) is in the first half only, and not taxable.
      expect(Number(first.grossEarnings) + Number(second.grossEarnings)).toBe(wage + 200);
    });
  });

  describe('a held claim', () => {
    it('goes back to be paid by the next run when the run that held it is cancelled', async () => {
      await prisma.expenseClaim.create({
        data: {
          organizationId,
          claimNo: 'CL-CM-2043-B',
          employeeId: salaried,
          title: 'ค่าอาหาร',
          totalAmount: 100,
          approvedAmount: 100,
          status: ExpenseClaimStatus.APPROVED,
          paymentMethod: 'PAYROLL',
          decidedAt: utc(date(5)),
        },
      });
      // A separate month so the run is not one of the three above.
      const extra = await api.post('/payroll/periods', payroll, {
        year: YEAR,
        month: 4,
        periodStart: `${YEAR}-04-01`,
        periodEnd: `${YEAR}-04-30`,
        payDate: `${YEAR}-04-30`,
      });
      const extraRun = await run(extra.body.id);
      expect((await calculate(extraRun)).status).toBe(201);
      await approve(extraRun);
      const held = await prisma.expenseClaim.findUniqueOrThrow({
        where: { organizationId_claimNo: { organizationId, claimNo: 'CL-CM-2043-B' } },
      });
      expect(held.payrollRunId).toBe(extraRun);

      expect((await api.post(`/payroll/runs/${extraRun}/cancel`, ceo)).status).toBe(201);

      const released = await prisma.expenseClaim.findUniqueOrThrow({
        where: { organizationId_claimNo: { organizationId, claimNo: 'CL-CM-2043-B' } },
      });
      expect(released.payrollRunId).toBeNull();
      expect(released.status).toBe(ExpenseClaimStatus.APPROVED);
    });
  });

  describe('the comparison page', () => {
    const upload = (periodId: string, file: ReturnType<typeof hrRegister>) =>
      api.upload(`/payroll/periods/${periodId}/parallel-run`, payroll, file);

    it('reads the same month from any period of it, and marks nothing for HR’s own register', async () => {
      const file = hrRegister(await monthFigures());

      for (const periodId of [periods.month, periods.h1, periods.h2]) {
        const res = await upload(periodId, file);

        expect(res.status).toBe(200);
        expect(res.body.problems).toEqual([]);
        expect(res.body.period).toEqual({ code: `${YEAR}-03`, year: YEAR, month: MONTH });
        expect(res.body.totals).toMatchObject({ differing: 0, onlyInFile: 0, onlyInCwork: 0 });
        expect(res.body.totals.people).toBeGreaterThanOrEqual(2);
      }
    });

    it('finds the daily worker, whose pay is in two periods, as one person with the month’s figures', async () => {
      const res = await upload(periods.h1, hrRegister(await monthFigures()));
      const person = res.body.people.find(
        (p: { employeeCode: string }) => p.employeeCode === 'CM-2043-2',
      );
      const slips = await monthFigures();
      const own = slips.find((p) => p.code === 'CM-2043-2')!;

      expect(Number(person.figures.gross.cwork)).toBeCloseTo(own.gross, 2);
      expect(res.body.onlyInFile).toEqual([]);
    });

    it('gives each person the figures of their row on the payroll register', async () => {
      const register = await api.getRaw(
        `/payroll/periods/${periods.h2}/export?format=register`,
        payroll,
      );
      expect(register.status).toBe(200);
      const rows = readXlsx(new Uint8Array(register.body)).rows;
      const report = await upload(periods.month, hrRegister(await monthFigures()));

      for (const code of ['CM-2043-1', 'CM-2043-2']) {
        const row = rows.find((r) => String(r[1] ?? '').includes(code))!;
        const person = report.body.people.find(
          (p: { employeeCode: string }) => p.employeeCode === code,
        );
        expect(Number(person.figures.gross.cwork)).toBeCloseTo(Number(row[8]), 2);
        expect(Number(person.figures.tax.cwork)).toBeCloseTo(Number(row[9]), 2);
        expect(Number(person.figures.sso.cwork)).toBeCloseTo(Number(row[10]), 2);
        expect(Number(person.figures.net.cwork)).toBeCloseTo(Number(row[13]), 2);
      }
    });

    it('says what to add when HR’s register has no employee codes', async () => {
      const figures = await monthFigures();
      const withCodes = hrRegister(figures);
      // The same register without its last column; an empty cell is written as empty.
      const rows = readXlsx(new Uint8Array(withCodes.content)).rows.map((r) =>
        r.slice(0, 6).map((cell) => cell ?? ''),
      );
      const noCodes = {
        ...withCodes,
        content: Buffer.from(writeXlsx([{ name: 'Register', rows, headerRows: 4 }])),
      };

      const res = await upload(periods.month, noCodes);

      expect(res.body.problems.map((p: { code: string }) => p.code)).toEqual([
        'MISSING_EMPLOYEE_CODE',
      ]);
    });

    it('compares the month’s tax and social security with what was filed', async () => {
      const figures = await monthFigures();
      const tax = figures.reduce((a, p) => a + p.tax, 0);
      const slips = await prisma.payslip.findMany({
        where: { run: { period: { year: YEAR, month: MONTH } } },
        select: { ssoEmployee: true, ssoEmployer: true },
      });
      const sso = slips.reduce((a, s) => a + Number(s.ssoEmployee) + Number(s.ssoEmployer), 0);

      for (const periodId of [periods.h1, periods.h2]) {
        const res = await api.post(`/payroll/periods/${periodId}/compare`, payroll, {
          taxFiled: tax.toFixed(2),
          ssoFiled: sso.toFixed(2),
        });

        expect(res.status).toBe(200);
        expect(res.body.tax).toMatchObject({ matches: true });
        expect(res.body.sso).toMatchObject({ matches: true });
        expect(res.body.period.code).toBe(`${YEAR}-03`);
      }
    });

    it('has the month’s social security equal to the filing for the month', async () => {
      const filing = await api.get(
        `/payroll/reports/sso-filing?year=${YEAR}&month=${MONTH}`,
        payroll,
      );
      expect(filing.status).toBe(200);
      const slips = await prisma.payslip.findMany({
        where: {
          run: { period: { year: YEAR, month: MONTH } },
          employee: { employeeCode: { in: ['CM-2043-1', 'CM-2043-2'] } },
        },
        select: { ssoEmployee: true },
      });
      const filed = (filing.body.rows as Array<Record<string, string>>).filter((r) =>
        ['CM-2043-1', 'CM-2043-2'].includes(r.employeeCode),
      );

      expect(filed.reduce((a, r) => a + Number(r.employee), 0)).toBeCloseTo(
        slips.reduce((a, s) => a + Number(s.ssoEmployee), 0),
        2,
      );
    });
  });

  describe('a month that is not all there', () => {
    it('is refused, in Thai, naming the period that is missing', async () => {
      const lonely = await api.post('/payroll/periods', payroll, {
        year: YEAR,
        month: 5,
        payFrequency: 'SEMI_MONTHLY',
        half: 1,
        periodStart: `${YEAR}-05-01`,
        periodEnd: `${YEAR}-05-15`,
        payDate: `${YEAR}-05-16`,
      });
      const lonelyRun = await run(lonely.body.id);
      expect((await calculate(lonelyRun)).status).toBe(201);
      await approve(lonelyRun);

      const res = await api.post(`/payroll/periods/${lonely.body.id}/compare`, payroll, {
        taxFiled: '0.00',
      });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('ยังเทียบยอดของเดือนพฤษภาคม 2586 ไม่ได้');
      expect(res.body.message).toContain('ครึ่งหลัง');
    });
  });
});
