// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Pay before Cwork (CW-059, the payroll half).
 *
 * The acceptance that matters is one sentence: a company that imports January
 * to August and runs September in Cwork withholds the same September tax as if
 * all nine months had run in Cwork. It is proven here the way it would happen,
 * with nothing mocked: in one year all nine months are run for real, one after
 * another; in another, the same eight months' totals are imported and
 * September is run on top of them. Salaries and tax rules are the same in both
 * years, so any difference is the import's.
 *
 * Around it: the months before Cwork count as this employer's and not a
 * previous employer's, a month they cover cannot be paid again, a file is
 * all-or-nothing and safe to import twice, and only payroll can import one.
 */
import { PayrollRunStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { readXlsx, writeXlsx } from 'src/core/spreadsheet/xlsx';
import { workDateFor } from 'src/core/utils/date.util';
import { createTestApp, type Api, type TestContext } from './utils/test-app';
import { isoDate } from './utils/dates';

const PAYROLL = 'payroll@cwork.example'; // PAYROLL_OFFICER: prepares runs, imports
const CEO = 'ceo@cwork.example'; // approves: whoever prepared a run cannot
const HR_OFFICER = 'hr.officer@cwork.example'; // HR, but not payroll
const EMPLOYEE_CODE = 'EMP-0007';

/** All nine months run in Cwork. No other spec touches this year. */
const IN_CWORK_YEAR = 2029;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADER = [
  'รหัสพนักงาน',
  'ชื่อ',
  'เงินได้ที่ต้องเสียภาษี',
  'ภาษีหัก ณ ที่จ่าย',
  'ประกันสังคม (ส่วนลูกจ้าง)',
];

function workbook(rows: (string | number)[][]): Buffer {
  return Buffer.from(writeXlsx([{ name: 'ยอดยกมา', header: true, rows: [HEADER, ...rows] }]));
}

/** Thai as Thai Excel's plain CSV writes it: Windows-874. */
function windows874(text: string): Buffer {
  return Buffer.from(
    [...text].map((char) => {
      const code = char.codePointAt(0)!;
      if (code >= 0x0e01 && code <= 0x0e5b) return code - 0x0e01 + 0xa1;
      if (code < 0x80) return code;
      throw new Error(`not in Windows-874: ${char}`);
    }),
  );
}

interface Figures {
  taxableIncome: number;
  withholdingTax: number;
  ssoEmployee: number;
}

describe('Pay before Cwork (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let payrollToken: string;
  let ceoToken: string;
  /** Last year in the organisation's time zone: the year the import goes into. */
  let importYear: number;
  let codes: Map<string, { code: string; name: string }>;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    payrollToken = await api.token(PAYROLL);
    ceoToken = await api.token(CEO);
    const organization = await prisma.organization.findFirstOrThrow({
      select: { timezone: true },
    });
    importYear = workDateFor(new Date(), organization.timezone).getUTCFullYear() - 1;
    const employees = await prisma.employee.findMany({
      select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true },
    });
    codes = new Map(
      employees.map((e) => [
        e.id,
        { code: e.employeeCode, name: `${e.firstNameTh} ${e.lastNameTh}` },
      ]),
    );
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const path = (route: string, month: number, year = importYear) =>
    `/payroll/opening-balances/${route}?year=${year}&month=${month}`;

  const upload = (
    route: 'import' | 'import/preview',
    content: Buffer,
    { month = 8, filename = 'ยอดยกมา.xlsx', token = payrollToken, year = importYear } = {},
  ) =>
    api.upload(path(route, month, year), token, {
      filename,
      contentType: filename.endsWith('.csv') ? 'text/csv' : XLSX,
      content,
    });

  const openingBalances = () =>
    prisma.payrollOpeningBalance.findMany({ where: { taxYear: importYear } });

  /** One month's regular run, calculated by payroll. */
  async function runMonth(year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    const period = await api.post('/payroll/periods', payrollToken, {
      year,
      month,
      periodStart: isoDate(start),
      periodEnd: isoDate(end),
      payDate: isoDate(end),
    });
    expect(period.status).toBe(201);
    const run = await api.post('/payroll/runs', payrollToken, { periodId: period.body.id });
    const calculated = await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken);
    return { periodId: period.body.id as string, runId: run.body.id as string, calculated };
  }

  async function payslips(runId: string) {
    const slips = await prisma.payslip.findMany({ where: { runId } });
    return new Map(slips.map((s) => [s.employeeId, s]));
  }

  describe('before anything is imported', () => {
    it('lets only payroll import, not HR without payroll rights', async () => {
      const officerToken = await api.token(HR_OFFICER);
      const file = workbook([[EMPLOYEE_CODE, 'อนุชา', 100_000, 1_000, 3_000]]);

      expect((await upload('import/preview', file, { token: officerToken })).status).toBe(403);
      expect((await upload('import', file, { token: officerToken })).status).toBe(403);
      expect((await api.getRaw(path('import/template', 8), officerToken)).status).toBe(403);
    });

    it('takes this year or last, and never a month that has not been paid yet', async () => {
      const file = workbook([[EMPLOYEE_CODE, 'อนุชา', 100_000, 1_000, 3_000]]);

      const tooOld = await upload('import/preview', file, { year: importYear - 1 });
      expect(tooOld.status).toBe(422);
      expect(tooOld.body.code).toBe('INVALID_OPENING_PERIOD');

      const future = await upload('import/preview', file, { year: importYear + 2 });
      expect(future.status).toBe(422);

      const notAMonth = await upload('import/preview', file, { month: 13 });
      expect(notAMonth.status).toBe(422);
      expect(notAMonth.body.code).toBe('INVALID_OPENING_PERIOD');
    });

    it('writes nothing from a file with one bad row, and names the row and the problem', async () => {
      const res = await upload(
        'import',
        workbook([
          [EMPLOYEE_CODE, 'อนุชา แก้วมณี', 480_000, 20_000, 6_000],
          ['EMP-0001', 'ผิดแถว', 480_000, 20_000, 12_000],
        ]),
      );

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('IMPORT_HAS_PROBLEMS');
      expect(res.body.details.problems).toEqual([
        expect.objectContaining({
          row: 3,
          column: 'E',
          header: 'ประกันสังคม (ส่วนลูกจ้าง)',
          code: 'SSO_OVER_LIMIT',
          params: { value: 12_000, max: 6_000, months: 8 },
        }),
      ]);
      expect(await openingBalances()).toEqual([]);
    });
  });

  it("reads Thai Excel's default CSV, amounts written with thousands separators", async () => {
    const csv = windows874(
      `${HEADER.join(',')}\r\n${EMPLOYEE_CODE},อนุชา แก้วมณี,"480,000.00","20,000.00","6,000.00"\r\n`,
    );

    const preview = await upload('import/preview', csv, { filename: 'ยอดยกมา.csv' });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      fileName: 'ยอดยกมา.csv',
      year: importYear,
      throughMonth: 8,
      problems: [],
      rows: [
        expect.objectContaining({
          employeeCode: EMPLOYEE_CODE,
          name: 'อนุชา แก้วมณี',
          taxableIncome: 480_000,
          withholdingTax: 20_000,
          ssoEmployee: 6_000,
          replaces: false,
        }),
      ],
      totals: { taxableIncome: 480_000, withholdingTax: 20_000, ssoEmployee: 6_000 },
    });
    expect(await openingBalances()).toEqual([]); // a preview writes nothing

    const res = await upload('import', csv, { filename: 'ยอดยกมา.csv' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ employees: 1, year: importYear, throughMonth: 8, recalculate: [] });
    const [stored] = await openingBalances();
    expect(stored).toMatchObject({ throughMonth: 8 });
    expect(Number(stored.taxableIncome)).toBe(480_000);
  });

  describe('January to August imported, September run in Cwork', () => {
    let inCworkSeptember: Awaited<ReturnType<typeof payslips>>;
    let importedSeptember: Awaited<ReturnType<typeof payslips>>;
    let importedRunId: string;
    let imported: Map<string, Figures>;
    let file: Buffer;

    beforeAll(async () => {
      // All nine months in Cwork, each approved before the next builds on it.
      for (let month = 1; month <= 8; month += 1) {
        const { runId, calculated } = await runMonth(IN_CWORK_YEAR, month);
        expect(calculated.body.status).toBe('CALCULATED');
        const approved = await api.post(`/payroll/runs/${runId}/approve`, ceoToken);
        expect(approved.body.status).toBe(PayrollRunStatus.APPROVED);
      }
      const september = await runMonth(IN_CWORK_YEAR, 9);
      inCworkSeptember = await payslips(september.runId);

      // What the old system's year-to-date report would say for January to August.
      const totals = await prisma.payslip.groupBy({
        by: ['employeeId'],
        where: {
          run: {
            status: PayrollRunStatus.APPROVED,
            period: { year: IN_CWORK_YEAR, month: { lte: 8 } },
          },
        },
        _sum: { taxableIncome: true, withholdingTax: true, ssoEmployee: true },
      });
      imported = new Map(
        totals.map((t) => [
          t.employeeId,
          {
            taxableIncome: Number(t._sum.taxableIncome),
            withholdingTax: Number(t._sum.withholdingTax),
            ssoEmployee: Number(t._sum.ssoEmployee),
          },
        ]),
      );
      file = workbook(
        [...imported].map(([id, f]) => [
          codes.get(id)!.code,
          codes.get(id)!.name,
          f.taxableIncome,
          f.withholdingTax,
          f.ssoEmployee,
        ]),
      );
    }, 180_000);

    it('previews every figure and the totals, and says which replace figures on file', async () => {
      const res = await upload('import/preview', file);

      expect(res.status).toBe(200);
      expect(res.body.problems).toEqual([]);
      expect(res.body.rows).toHaveLength(imported.size);
      const anucha = res.body.rows.find(
        (r: { employeeCode: string }) => r.employeeCode === EMPLOYEE_CODE,
      );
      expect(anucha.replaces).toBe(true); // imported from the CSV above
      const sum = (pick: (f: Figures) => number) =>
        Math.round([...imported.values()].reduce((a, f) => a + pick(f) * 100, 0)) / 100;
      expect(res.body.totals).toEqual({
        taxableIncome: sum((f) => f.taxableIncome),
        withholdingTax: sum((f) => f.withholdingTax),
        ssoEmployee: sum((f) => f.ssoEmployee),
      });
    });

    it('withholds the same September tax as if all nine months had run in Cwork', async () => {
      const res = await upload('import', file);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        employees: imported.size,
        year: importYear,
        throughMonth: 8,
        recalculate: [],
      });

      const september = await runMonth(importYear, 9);
      expect(september.calculated.body.status).toBe('CALCULATED');
      importedRunId = september.runId;
      importedSeptember = await payslips(september.runId);

      const compared = [...imported.keys()].filter(
        (id) => inCworkSeptember.has(id) && importedSeptember.has(id),
      );
      expect(compared.length).toBe(imported.size);
      const figures = (slip: {
        taxableIncome: unknown;
        withholdingTax: unknown;
        ssoEmployee: unknown;
        netPay: unknown;
      }) => ({
        taxableIncome: Number(slip.taxableIncome),
        withholdingTax: Number(slip.withholdingTax),
        ssoEmployee: Number(slip.ssoEmployee),
        netPay: Number(slip.netPay),
      });
      for (const id of compared) {
        expect({ employee: codes.get(id)!.code, ...figures(importedSeptember.get(id)!) }).toEqual({
          employee: codes.get(id)!.code,
          ...figures(inCworkSeptember.get(id)!),
        });
      }
      // The comparison means something only if September withholds tax at all.
      expect(compared.some((id) => Number(inCworkSeptember.get(id)!.withholdingTax) > 0)).toBe(
        true,
      );
    });

    it("records the months before Cwork on the payslip as this employer's own", async () => {
      const [id, figures] = [...imported][0];
      const snapshot = importedSeptember.get(id)!.snapshot as unknown as {
        yearToDate: {
          thisEmployer: Figures & { inCwork: Figures; beforeCwork: Figures };
          previousEmployer: { taxableIncome: number; withholdingTax: number };
        };
      };

      expect(snapshot.yearToDate.thisEmployer).toEqual({
        ...figures,
        inCwork: { taxableIncome: 0, withholdingTax: 0, ssoEmployee: 0 },
        beforeCwork: figures,
      });
      expect(snapshot.yearToDate.previousEmployer).toEqual({ taxableIncome: 0, withholdingTax: 0 });
    });

    it("keeps a previous employer's pay apart from this employer's months before Cwork", async () => {
      const [id, figures] = [...imported][0];
      const before = Number(importedSeptember.get(id)!.withholdingTax);
      // Written directly: the tax-profile API does not take these two figures.
      await prisma.employeeTaxProfile.upsert({
        where: { employeeId_taxYear: { employeeId: id, taxYear: importYear } },
        create: {
          employeeId: id,
          taxYear: importYear,
          priorEmployerIncome: 120_000,
          priorEmployerTax: 2_000,
        },
        update: { priorEmployerIncome: 120_000, priorEmployerTax: 2_000 },
      });

      const recalculated = await api.post(`/payroll/runs/${importedRunId}/calculate`, payrollToken);
      expect(recalculated.body.status).toBe('CALCULATED');
      const slip = (await payslips(importedRunId)).get(id)!;
      const { yearToDate } = slip.snapshot as unknown as {
        yearToDate: {
          thisEmployer: Figures;
          previousEmployer: { taxableIncome: number; withholdingTax: number };
          forThisMonth: Figures;
        };
      };

      expect(yearToDate.thisEmployer).toMatchObject(figures);
      expect(yearToDate.previousEmployer).toEqual({
        taxableIncome: 120_000,
        withholdingTax: 2_000,
      });
      expect(yearToDate.forThisMonth).toEqual({
        taxableIncome: figures.taxableIncome + 120_000,
        withholdingTax: figures.withholdingTax + 2_000,
        ssoEmployee: figures.ssoEmployee,
      });
      // More income in the year projects more tax.
      expect(Number(slip.withholdingTax)).toBeGreaterThan(before);
    });

    it('creates nothing new when the same file is imported again', async () => {
      const count = (await openingBalances()).length;

      const again = await upload('import', file);

      expect(again.status).toBe(201);
      // September was calculated and not yet approved: it is named, to be calculated again.
      expect(again.body.recalculate).toEqual([
        { runId: importedRunId, runNo: expect.any(String), period: `${importYear}-09` },
      ]);
      expect(await openingBalances()).toHaveLength(count);
      const stored = await prisma.payrollOpeningBalance.findFirstOrThrow({
        where: { taxYear: importYear, employee: { employeeCode: EMPLOYEE_CODE } },
      });
      const expected = [...imported].find(([id]) => codes.get(id)!.code === EMPLOYEE_CODE)![1];
      expect(Number(stored.taxableIncome)).toBe(expected.taxableIncome);
    });

    it('audits each import as one event naming the file and the row count', async () => {
      const entries = await prisma.auditLog.findMany({
        where: { entityType: 'PayrollOpeningBalance', summary: { contains: 'ยอดยกมา.xlsx' } },
      });
      // The import above and the one before it; the refused file wrote none.
      expect(entries).toHaveLength(2);
      expect(entries[0].summary).toBe(
        `Imported pay before Cwork (${importYear}, January to month 8) for ${imported.size} employee(s) from "ยอดยกมา.xlsx"`,
      );
      expect(entries[0].changes).toMatchObject({
        fileName: 'ยอดยกมา.xlsx',
        year: importYear,
        throughMonth: 8,
        rows: imported.size,
      });
    });

    it('refuses to calculate a month the imported figures already cover', async () => {
      const august = await runMonth(importYear, 8);

      expect(august.calculated.status).toBe(422);
      expect(august.calculated.body.code).toBe('PAID_BEFORE_CWORK');
      expect(august.calculated.body.message).toContain(`${importYear}-08`);
      expect(august.calculated.body.details.employees).toContain(EMPLOYEE_CODE);
      const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: august.runId } });
      expect(run.status).toBe(PayrollRunStatus.DRAFT); // refused before anything ran
      expect(await prisma.payslip.count({ where: { runId: august.runId } })).toBe(0);
    });

    it('refuses figures for a month Cwork has already paid, naming the employee and month', async () => {
      const res = await upload('import', file, { month: 9 });

      expect(res.status).toBe(422);
      const problems = res.body.details.problems as { code: string; params: { period: string } }[];
      expect(problems).toHaveLength(imported.size);
      expect(problems.every((p) => p.code === 'PAID_IN_CWORK')).toBe(true);
      expect(problems[0].params.period).toBe(`${importYear}-09`);
      expect((await openingBalances()).every((b) => b.throughMonth === 8)).toBe(true);
    });

    it('hands back a template with everyone employed and the figures on file', async () => {
      const res = await api.getRaw(`${path('import/template', 8)}&lang=en`, payrollToken);

      expect(res.status).toBe(200);
      const [header, ...rows] = readXlsx(res.body).rows;
      expect(header).toEqual([
        'Employee code',
        'Name',
        'Taxable income',
        'Tax withheld',
        'Social security (employee)',
      ]);
      const expected = [...imported].find(([id]) => codes.get(id)!.code === EMPLOYEE_CODE)![1];
      expect(rows.find((r) => r[0] === EMPLOYEE_CODE)).toEqual([
        EMPLOYEE_CODE,
        'อนุชา แก้วมณี',
        expected.taxableIncome,
        expected.withholdingTax,
        expected.ssoEmployee,
      ]);

      // Uploaded as it came, it changes nothing and is clean.
      const again = await upload('import/preview', res.body);
      expect(again.body.problems).toEqual([]);
      expect(again.body.rows).toHaveLength(imported.size);
    });
  });
});
