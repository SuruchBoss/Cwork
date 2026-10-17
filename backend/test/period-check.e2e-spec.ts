// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The accountant's month, and the check against what was filed (CW-089).
 *
 * The pilot's ภ.ง.ด.1 is filed by an outside firm, so Cwork hands that firm the
 * month in one file and shows at once when what they filed differs from what
 * Cwork worked out, and when HR's own method differs person by person. This
 * proves the path end to end against a real period: the accountant's file is
 * the existing export plus its two columns, audited, with tax IDs printed there
 * and nowhere else; a filed total one satang out is shown as different; an
 * uploaded figure that differs marks that person and column only and changes no
 * payslip; and nothing is available without payroll:export.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';
import { isoDate } from './utils/dates';

const PAYROLL = 'payroll@cwork.example';
const CEO = 'ceo@cwork.example';
const EMPLOYEE = 'dev2@cwork.example'; // no payroll permissions

const NATIONAL_ID = '1111111111111';
const OWN_TAX_ID = '2222222222222';
const OTHER_NATIONAL_ID = '3333333333333';

describe('Payroll period check (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let payrollToken: string;
  let ceoToken: string;
  let approved: { periodId: string; periodCode: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    payrollToken = await api.token(PAYROLL);
    ceoToken = await api.token(CEO);

    // One employee with only a national ID, one with a tax ID of their own too.
    const crypto = ctx.app.get(CryptoService);
    await prisma.employee.updateMany({
      where: { workEmail: 'dev1@cwork.example' },
      data: { nationalIdEnc: crypto.encrypt(NATIONAL_ID), taxIdEnc: null },
    });
    await prisma.employee.updateMany({
      where: { workEmail: 'sales1@cwork.example' },
      data: {
        nationalIdEnc: crypto.encrypt(OTHER_NATIONAL_ID),
        taxIdEnc: crypto.encrypt(OWN_TAX_ID),
      },
    });
    approved = await preparePeriod(2035, 1, { approve: true });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function preparePeriod(year: number, month: number, options: { approve: boolean }) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    const period = await api.post('/payroll/periods', payrollToken, {
      year,
      month,
      periodStart: isoDate(start),
      periodEnd: isoDate(end),
      payDate: isoDate(end),
    });
    const run = await api.post('/payroll/runs', payrollToken, { periodId: period.body.id });
    const calc = await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken);
    expect(calc.body.status).toBe('CALCULATED');
    if (options.approve) {
      const done = await api.post(`/payroll/runs/${run.body.id}/approve`, ceoToken);
      expect(done.body.status).toBe('APPROVED');
    }
    return { periodId: period.body.id as string, periodCode: period.body.code as string };
  }

  const csvLines = (body: Buffer) => body.toString('utf8').replace(/^﻿/, '').trim().split('\r\n');

  async function slips() {
    return prisma.payslip.findMany({
      where: { run: { periodId: approved.periodId } },
      include: { employee: { select: { employeeCode: true, workEmail: true } } },
      orderBy: { employee: { employeeCode: 'asc' } },
    });
  }

  const sum = (values: Array<{ toString(): string }>) =>
    values.reduce<number>((acc, v) => acc + Math.round(Number(v.toString()) * 100), 0) / 100;

  describe('the accountant’s file', () => {
    it('is the existing export plus a tax ID and an income type, and nothing else', async () => {
      const plain = await api.getRaw(`/payroll/periods/${approved.periodId}/export`, payrollToken);
      const accountant = await api.getRaw(
        `/payroll/periods/${approved.periodId}/export?format=accountant`,
        payrollToken,
      );
      expect(accountant.status).toBe(200);

      const plainRows = csvLines(plain.body).map((l) => l.split(','));
      const rows = csvLines(accountant.body).map((l) => l.split(','));
      const width = plainRows[0]!.length;
      expect(rows[0]).toEqual([...plainRows[0]!, 'Tax ID', 'Income type']);
      expect(rows).toHaveLength(plainRows.length);
      rows.forEach((row, i) => {
        expect(row).toHaveLength(width + 2);
        // Same figures, row for row.
        expect(row.slice(0, width)).toEqual(plainRows[i]);
      });
      // Every person is employment income.
      rows.slice(1).forEach((row) => expect(row[width + 1]).toBe('40(1)'));
    });

    it('prints a tax ID of its own, else the national ID, else nothing, and only here', async () => {
      const accountant = await api.getRaw(
        `/payroll/periods/${approved.periodId}/export?format=accountant`,
        payrollToken,
      );
      const rows = csvLines(accountant.body).map((l) => l.split(','));
      const code = rows[0]!.indexOf('Employee code');
      const taxId = rows[0]!.indexOf('Tax ID');
      const byEmployee = new Map(rows.slice(1).map((r) => [r[code]!, r[taxId]!]));

      const people = await slips();
      const idOf = (email: string) =>
        byEmployee.get(people.find((p) => p.employee.workEmail === email)!.employee.employeeCode);
      expect(idOf('dev1@cwork.example')).toBe(NATIONAL_ID);
      expect(idOf('sales1@cwork.example')).toBe(OWN_TAX_ID);
      // Nobody else's column carries the other number.
      expect(accountant.body.toString('utf8')).not.toContain(OTHER_NATIONAL_ID);

      const plain = await api.getRaw(`/payroll/periods/${approved.periodId}/export`, payrollToken);
      const text = plain.body.toString('utf8');
      for (const id of [NATIONAL_ID, OWN_TAX_ID, OTHER_NATIONAL_ID]) {
        expect(text).not.toContain(id);
      }
    });

    it('is audited like every other format, and says how many people had no tax ID', async () => {
      await api.getRaw(
        `/payroll/periods/${approved.periodId}/export?format=accountant`,
        payrollToken,
      );
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'EXPORT', entityType: 'PayrollPeriod', entityId: approved.periodId },
        orderBy: { createdAt: 'desc' },
      });
      const changes = entry?.changes as Record<string, unknown>;
      expect(changes.format).toBe('accountant');
      expect(changes.period).toBe(approved.periodCode);
      expect(typeof changes.missingTaxId).toBe('number');
      // The audit trail holds a count, never a number.
      expect(JSON.stringify(entry)).not.toContain(NATIONAL_ID);

      await api.getRaw(`/payroll/periods/${approved.periodId}/export`, payrollToken);
      const plain = await prisma.auditLog.findFirst({
        where: { action: 'EXPORT', entityType: 'PayrollPeriod', entityId: approved.periodId },
        orderBy: { createdAt: 'desc' },
      });
      expect((plain?.changes as Record<string, unknown>).missingTaxId).toBeUndefined();
    });
  });

  describe('the filed totals', () => {
    it('match when they are Cwork’s own, to the satang', async () => {
      const people = await slips();
      const tax = sum(people.map((p) => p.withholdingTax)).toFixed(2);
      const sso = sum([
        ...people.map((p) => p.ssoEmployee),
        ...people.map((p) => p.ssoEmployer),
      ]).toFixed(2);

      const res = await api.post(`/payroll/periods/${approved.periodId}/compare`, payrollToken, {
        taxFiled: tax,
        ssoFiled: sso,
      });

      expect(res.status).toBe(200);
      expect(res.body.tax).toMatchObject({
        cwork: tax,
        filed: tax,
        difference: '0.00',
        matches: true,
      });
      expect(res.body.sso).toMatchObject({ cwork: sso, matches: true });
    });

    it('show a total one satang out as different, either way', async () => {
      const people = await slips();
      const tax = sum(people.map((p) => p.withholdingTax));

      const over = await api.post(`/payroll/periods/${approved.periodId}/compare`, payrollToken, {
        taxFiled: (tax + 0.01).toFixed(2),
      });
      expect(over.body.tax).toMatchObject({ matches: false, difference: '0.01' });
      expect(over.body.sso).toBeNull();

      const under = await api.post(`/payroll/periods/${approved.periodId}/compare`, payrollToken, {
        taxFiled: Math.max(0, tax - 0.01).toFixed(2),
      });
      if (tax >= 0.01)
        expect(under.body.tax).toMatchObject({ matches: false, difference: '-0.01' });
    });

    it('need at least one total, and an amount that is an amount', async () => {
      const none = await api.post(
        `/payroll/periods/${approved.periodId}/compare`,
        payrollToken,
        {},
      );
      expect(none.status).toBe(422);
      expect(none.body.code).toBe('NOTHING_TO_COMPARE');

      for (const bad of ['12,5', '-1', '1.234', 'abc']) {
        const res = await api.post(`/payroll/periods/${approved.periodId}/compare`, payrollToken, {
          taxFiled: bad,
        });
        expect(res.status).toBe(400);
      }
    });

    it('are not compared for a period that does not reconcile', async () => {
      const open = await preparePeriod(2035, 2, { approve: false });
      const res = await api.post(`/payroll/periods/${open.periodId}/compare`, payrollToken, {
        taxFiled: '1.00',
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PAYROLL_NOT_RECONCILED');
    });
  });

  describe('HR’s own figures, person by person', () => {
    const file = (rows: string[]) => ({
      filename: 'hr.csv',
      contentType: 'text/csv',
      content: Buffer.from(
        ['รหัสพนักงาน,รายได้,ภาษี,ประกันสังคม,สุทธิ', ...rows].join('\r\n'),
        'utf8',
      ),
    });

    async function ownRows(change?: (code: string, row: number[]) => number[]) {
      const people = await slips();
      return people.map((p) => {
        const row = [
          Number(p.grossEarnings.toString()),
          Number(p.withholdingTax.toString()),
          Number(p.ssoEmployee.toString()),
          Number(p.netPay.toString()),
        ];
        const used = change ? change(p.employee.employeeCode, row) : row;
        return `${p.employee.employeeCode},${used.map((n) => n.toFixed(2)).join(',')}`;
      });
    }

    const snapshot = async () =>
      JSON.stringify(
        await prisma.payslip.findMany({
          where: { run: { periodId: approved.periodId } },
          orderBy: { id: 'asc' },
        }),
      );

    it('marks nobody when HR’s figures are Cwork’s', async () => {
      const res = await api.upload(
        `/payroll/periods/${approved.periodId}/parallel-run`,
        payrollToken,
        file(await ownRows()),
      );

      expect(res.status).toBe(200);
      expect(res.body.problems).toEqual([]);
      expect(res.body.totals).toMatchObject({ differing: 0, onlyInFile: 0, onlyInCwork: 0 });
      expect(res.body.totals.people).toBeGreaterThan(0);
    });

    it('marks the one person and the one column, and changes no payslip', async () => {
      const before = await snapshot();
      const people = await slips();
      const target = people[0]!.employee.employeeCode;

      const res = await api.upload(
        `/payroll/periods/${approved.periodId}/parallel-run`,
        payrollToken,
        file(
          await ownRows((code, row) =>
            code === target ? [row[0]!, row[1]! + 0.01, row[2]!, row[3]!] : row,
          ),
        ),
      );

      expect(res.status).toBe(200);
      const differing = res.body.people.filter((p: any) => p.differs);
      expect(differing).toHaveLength(1);
      expect(differing[0].employeeCode).toBe(target);
      const columns = Object.entries(differing[0].figures)
        .filter(([, f]: any) => f.differs)
        .map(([key]) => key);
      expect(columns).toEqual(['tax']);
      expect(differing[0].figures.tax.difference).toBe('0.01');
      expect(res.body.totals).toMatchObject({ differing: 1 });

      expect(await snapshot()).toBe(before);
    });

    it('lists someone only one side has', async () => {
      const rows = await ownRows();
      const dropped = rows.shift()!.split(',')[0]!;
      const res = await api.upload(
        `/payroll/periods/${approved.periodId}/parallel-run`,
        payrollToken,
        file([...rows, 'EMP-NOBODY,1.00,0.00,0.00,1.00']),
      );

      expect(res.body.onlyInFile).toEqual([{ row: rows.length + 2, employeeCode: 'EMP-NOBODY' }]);
      expect(res.body.onlyInCwork.map((p: any) => p.employeeCode)).toEqual([dropped]);
    });

    it('is refused by row and column when the file has a problem, and says nothing else', async () => {
      const res = await api.upload(
        `/payroll/periods/${approved.periodId}/parallel-run`,
        payrollToken,
        file(['EMP-1,abc,0,0,0']),
      );

      expect(res.status).toBe(200);
      expect(res.body.people).toEqual([]);
      expect(res.body.problems.map((p: any) => [p.row, p.column, p.code])).toEqual([
        [2, 'B', 'INVALID_AMOUNT'],
      ]);
    });
  });

  describe('who can', () => {
    it('keeps all of it from someone without payroll:export', async () => {
      const token = await api.token(EMPLOYEE);
      const id = approved.periodId;
      expect((await api.get(`/payroll/periods/${id}/export?format=accountant`, token)).status).toBe(
        403,
      );
      expect(
        (await api.post(`/payroll/periods/${id}/compare`, token, { taxFiled: '1.00' })).status,
      ).toBe(403);
      expect(
        (
          await api.upload(`/payroll/periods/${id}/parallel-run`, token, {
            filename: 'x.csv',
            contentType: 'text/csv',
            content: Buffer.from('x'),
          })
        ).status,
      ).toBe(403);
    });
  });
});
