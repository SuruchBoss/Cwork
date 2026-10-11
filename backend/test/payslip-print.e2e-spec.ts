// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Printed payslips and the wage-receipt sheet (CW-071).
 *
 * A daily-wage worker whose name HR entered in English is paid November 2036 in
 * two halves, with nothing mocked: a cash advance taken back in the first half
 * and a holiday on Saturday the 15th whose substitute day falls in the second.
 * Each printed slip is checked against the payslip the API returns — the record
 * a person sees — line by line, rather than inspected by eye. The text pdfkit is
 * asked to draw is captured in process, since a PDF's own text layer depends on
 * the viewer. No other spec touches 2036.
 */
import { AttendanceStatus, EmployeeStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example'; // prepares runs, may print
const CEO = 'ceo@cwork.example'; // approves and pays
const NO_PAY_ACCESS = 'dev2@cwork.example'; // an ordinary employee
const YEAR = 2036;

const date = (day: number) => `${YEAR}-11-${String(day).padStart(2, '0')}`;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Written independently of the renderer's own formatter: 1234.5 → "1,234.50". */
const money = (value: unknown) =>
  Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;

interface SlipItem {
  code: string;
  name: string;
  type: string;
  amount: string | number;
  quantity: string | number | null;
  rate: string | number | null;
}

describe('Printed payslips and wage receipts (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let payrollToken: string;
  let ceoToken: string;
  let organizationId: string;
  let worker: string;
  let h1: { id: string; runId: string };
  let h2: { id: string; runId: string };

  /** Every string handed to pdfkit's text() while `fn` runs. */
  async function drawn<T>(fn: () => Promise<T>): Promise<{ result: T; texts: string[] }> {
    const texts: string[] = [];
    const original = PDFDocument.prototype.text;
    const spy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
      this: PDFKit.PDFDocument,
      ...args: unknown[]
    ) {
      texts.push(String(args[0]));
      return (original as (...a: unknown[]) => PDFKit.PDFDocument).apply(this, args);
    });
    try {
      return { result: await fn(), texts };
    } finally {
      spy.mockRestore();
    }
  }

  const slipId = async (runId: string) =>
    (await prisma.payslip.findFirstOrThrow({ where: { runId, employeeId: worker } })).id;

  /** The payslip as the API shows it. */
  async function onScreen(runId: string) {
    const res = await api.get(`/payroll/payslips/${await slipId(runId)}`, payrollToken);
    expect(res.status).toBe(200);
    return res.body as {
      id: string;
      items: SlipItem[];
      netPay: string;
      warnings: Array<{ code: string; params?: Record<string, unknown> }>;
    };
  }

  async function newPeriod(half: 1 | 2) {
    const res = await api.post('/payroll/periods', payrollToken, {
      year: YEAR,
      month: 11,
      payFrequency: 'SEMI_MONTHLY',
      half,
      periodStart: half === 1 ? date(1) : date(16),
      periodEnd: half === 1 ? date(15) : date(30),
      payDate: half === 1 ? date(16) : date(30),
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function newRun(periodId: string) {
    const run = await api.post('/payroll/runs', payrollToken, { periodId });
    expect(run.status).toBe(201);
    const calculated = await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken);
    expect(calculated.status).toBe(201);
    return run.body.id as string;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    payrollToken = await api.token(PAYROLL);
    ceoToken = await api.token(CEO);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));

    // Entered in English only, which Cwork stores in the Thai name fields (CW-068).
    ({ id: worker } = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: 'PRN-2036-1',
        firstNameTh: 'Nguyen',
        lastNameTh: 'Van An',
        nationalIdEnc: 'ENCRYPTED',
        status: EmployeeStatus.ACTIVE,
        hireDate: utc(`${YEAR}-01-01`),
      },
      select: { id: true },
    }));
    // November 2036 starts on a Saturday. First half: Mon 3 – Fri 7 and Mon 10 –
    // Fri 14. The 15th, a Saturday, is a holiday nobody gave a substitute for, so
    // Monday 17 is closed instead and paid in the second half.
    const days = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 18, 19, 20, 21, 24, 25, 26, 27, 28];
    await prisma.attendanceRecord.createMany({
      data: days.map((day) => ({
        organizationId,
        employeeId: worker,
        workDate: utc(date(day)),
        status: AttendanceStatus.PRESENT,
      })),
    });
    await prisma.holiday.create({
      data: { organizationId, date: utc(date(15)), name: 'วันหยุดพิเศษ' },
    });
    const pay = await api.post('/payroll/compensation', payrollToken, {
      employeeId: worker,
      effectiveFrom: `${YEAR}-01-01`,
      baseSalary: 0,
      payFrequency: 'SEMI_MONTHLY',
      dailyRate: 500,
    });
    expect(pay.status).toBe(201);
    const advance = await api.post('/payroll/advances', payrollToken, {
      employeeId: worker,
      amount: 1_000,
      paidOn: '2026-10-01',
    });
    expect(advance.status).toBe(201);

    h1 = { id: await newPeriod(1), runId: '' };
    h2 = { id: await newPeriod(2), runId: '' };
    h1.runId = await newRun(h1.id);
  });

  afterAll(async () => {
    // Out of the employee lists other specs count; the payslips keep them.
    if (worker) {
      await prisma?.employee.update({ where: { id: worker }, data: { deletedAt: new Date() } });
    }
    await ctx?.close();
  });

  it('refuses to print a run that is not yet approved, and says why', async () => {
    for (const path of [
      `/payroll/runs/${h1.runId}/print/payslips`,
      `/payroll/runs/${h1.runId}/print/receipts`,
    ]) {
      const res = await api.get(path, payrollToken);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PAYROLL_RUN_NOT_PRINTABLE');
    }
    const one = await api.get(`/payroll/payslips/${await slipId(h1.runId)}/print`, payrollToken);
    expect(one.status).toBe(422);
    expect(one.body.code).toBe('PAYROLL_RUN_NOT_PRINTABLE');
    expect(await prisma.auditLog.count({ where: { entityId: h1.runId, action: 'EXPORT' } })).toBe(
      0,
    );
  });

  describe('once the first half is approved', () => {
    beforeAll(async () => {
      expect((await api.post(`/payroll/runs/${h1.runId}/approve`, ceoToken)).status).toBe(201);
    });

    it('prints every line of the payslip the API shows, with the cash advance, and nothing else', async () => {
      const slip = await onScreen(h1.runId);
      const lines = slip.items.filter((i) => ['EARNING', 'DEDUCTION'].includes(i.type));
      expect(lines.map((i) => i.code)).toContain('CASH_ADVANCE');

      const { result, texts } = await drawn(() =>
        api.getRaw(`/payroll/payslips/${slip.id}/print`, payrollToken),
      );
      expect(result.status).toBe(200);
      expect(result.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pageCount(result.body)).toBe(1);

      for (const item of lines) {
        const row = texts.find((t) => t.startsWith(item.name));
        expect({ code: item.code, printed: row !== undefined }).toEqual({
          code: item.code,
          printed: true,
        });
        expect(texts).toContain(money(item.amount));
      }
      expect(texts).toContain(money(slip.netPay));
      // What the employer pays and what is only information stays off the slip.
      for (const item of slip.items.filter((i) => !['EARNING', 'DEDUCTION'].includes(i.type))) {
        expect(texts.some((t) => t.startsWith(item.name))).toBe(false);
      }
    });

    it('shows a foreign worker’s name as HR entered it, and Buddhist-era dates', async () => {
      const id = await slipId(h1.runId);
      const printed = await drawn(() => api.getRaw(`/payroll/payslips/${id}/print`, payrollToken));
      expect(printed.texts.some((t) => t === 'PRN-2036-1  Nguyen Van An')).toBe(true);
      expect(printed.texts.some((t) => t.includes('1 – 15 พฤศจิกายน 2579'))).toBe(true);
      expect(printed.texts.some((t) => t.includes('16 พฤศจิกายน 2579'))).toBe(true);
    });

    it('prints the run’s slips to a sheet of 1, 2 or 4, and refuses any other layout', async () => {
      for (const perPage of [1, 2, 4]) {
        const res = await api.getRaw(
          `/payroll/runs/${h1.runId}/print/payslips?perPage=${perPage}`,
          payrollToken,
        );
        expect(res.status).toBe(200);
        expect(pageCount(res.body)).toBe(1);
      }
      const bad = await api.get(`/payroll/runs/${h1.runId}/print/payslips?perPage=3`, payrollToken);
      expect(bad.status).toBe(400);
    });

    it('prints the wage-receipt sheet with a row and the net pay for the worker', async () => {
      const slip = await onScreen(h1.runId);
      const { result, texts } = await drawn(() =>
        api.getRaw(`/payroll/runs/${h1.runId}/print/receipts`, payrollToken),
      );
      expect(result.status).toBe(200);
      expect(result.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(texts).toContain('PRN-2036-1');
      expect(texts).toContain('Nguyen Van An');
      expect(texts).toContain(money(slip.netPay));
      expect(texts).toContain('ลายมือชื่อผู้รับเงิน');
    });

    it('is for people who can see pay: an ordinary employee gets nothing', async () => {
      const employee = await api.token(NO_PAY_ACCESS);
      for (const path of [
        `/payroll/runs/${h1.runId}/print/payslips`,
        `/payroll/runs/${h1.runId}/print/receipts`,
        `/payroll/payslips/${await slipId(h1.runId)}/print`,
      ]) {
        expect((await api.get(path, employee)).status).toBe(403);
      }
    });

    it('audits each print with who printed what and how many', async () => {
      const entries = await prisma.auditLog.findMany({
        where: { entityType: 'PayrollRun', entityId: h1.runId, action: 'EXPORT' },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries.length).toBeGreaterThanOrEqual(5);
      expect(entries.every((e) => e.actorUserId)).toBe(true);
      const kinds = new Set(entries.map((e) => (e.changes as { kind: string }).kind));
      expect(kinds).toEqual(new Set(['payslips', 'wage-receipts']));
      expect(entries.every((e) => (e.changes as { count: number }).count === 1)).toBe(true);
    });

    it('refuses to print a slip whose lines do not add up, and prints nothing', async () => {
      const id = await slipId(h1.runId);
      const before = await prisma.auditLog.count({
        where: { entityId: h1.runId, action: 'EXPORT' },
      });
      // The database will not hold a net that disagrees with gross less deductions,
      // so the way a slip's lines come apart from its totals is a line changed.
      const earning = await prisma.payslipItem.findFirstOrThrow({
        where: { payslipId: id, type: 'EARNING' },
      });
      await prisma.payslipItem.update({
        where: { id: earning.id },
        data: { amount: Number(earning.amount) + 1 },
      });
      try {
        const res = await api.get(`/payroll/runs/${h1.runId}/print/payslips`, payrollToken);
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('PAYSLIP_DOES_NOT_ADD_UP');
        expect(res.body.message).toContain('PRN-2036-1');
      } finally {
        await prisma.payslipItem.update({
          where: { id: earning.id },
          data: { amount: earning.amount },
        });
      }
      expect(await prisma.auditLog.count({ where: { entityId: h1.runId, action: 'EXPORT' } })).toBe(
        before,
      );
    });
  });

  describe('the second half, with the holiday’s substitute day', () => {
    beforeAll(async () => {
      expect((await api.post(`/payroll/runs/${h1.runId}/pay`, ceoToken)).status).toBe(201);
      h2.runId = await newRun(h2.id);
      expect((await api.post(`/payroll/runs/${h2.runId}/approve`, ceoToken)).status).toBe(201);
    });

    it('prints the daily wage with the days paid, and the substitute day as a note', async () => {
      const slip = await onScreen(h2.runId);
      const lines = slip.items.filter((i) => ['EARNING', 'DEDUCTION'].includes(i.type));
      const wage = lines.find((i) => i.code === 'BASE');
      // Nine days worked and Monday the 17th, standing in for the holiday on the 15th.
      expect(Number(wage?.quantity)).toBe(10);
      expect(Number(wage?.rate)).toBe(500);
      expect(slip.warnings).toEqual(
        expect.arrayContaining([
          {
            code: 'SUBSTITUTE_HOLIDAY',
            params: { days: 1, dates: `${date(15)} → ${date(17)}` },
          },
        ]),
      );

      const { result, texts } = await drawn(() =>
        api.getRaw(`/payroll/runs/${h2.runId}/print/payslips?perPage=4`, payrollToken),
      );
      expect(result.status).toBe(200);
      for (const item of lines) {
        expect(texts.some((t) => t.startsWith(item.name))).toBe(true);
        expect(texts).toContain(money(item.amount));
      }
      expect(texts).toContain(money(slip.netPay));
      expect(texts.some((t) => t.startsWith(`${wage!.name} (10 × 500.00)`))).toBe(true);
      expect(texts.some((t) => t.includes('15 พฤศจิกายน 2579 → 17 พฤศจิกายน 2579'))).toBe(true);
    });
  });
});
