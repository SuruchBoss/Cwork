// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  CSV_FORMAT,
  PayrollReconciliationError,
  reconcilePeriod,
  resolveExportFormat,
  type ExportPayslip,
  type ExportRun,
} from './payroll-export';

const period = { code: 'PR-2026-01', year: 2026, month: 1 };

function slip(overrides: Partial<ExportPayslip> = {}): ExportPayslip {
  return {
    employeeCode: 'EMP001',
    firstNameTh: 'สมชาย',
    lastNameTh: 'ใจดี',
    departmentName: 'บัญชี',
    currency: 'THB',
    grossEarnings: '30000.00',
    totalDeductions: '2500.00',
    taxableIncome: '30000.00',
    withholdingTax: '1000.00',
    ssoEmployee: '750.00',
    ssoEmployer: '750.00',
    netPay: '27500.00',
    ...overrides,
  };
}

/** A run whose recorded totals match the sum of its payslips. */
function reconciledRun(overrides: Partial<ExportRun> = {}): ExportRun {
  const payslips = overrides.payslips ?? [slip()];
  return {
    runNo: 'RUN-2026-01-01',
    status: 'APPROVED',
    employeeCount: payslips.length,
    totalGross: sum(payslips, 'grossEarnings'),
    totalDeduction: sum(payslips, 'totalDeductions'),
    totalNet: sum(payslips, 'netPay'),
    ...overrides,
    payslips,
  };
}

function sum(payslips: ExportPayslip[], field: keyof ExportPayslip): string {
  return payslips.reduce((acc, s) => acc + Number(s[field]), 0).toFixed(2);
}

describe('reconcilePeriod', () => {
  it('reconciles an approved period and returns one row per payslip', () => {
    const result = reconcilePeriod(period, [
      reconciledRun({ payslips: [slip(), slip({ employeeCode: 'EMP002' })] }),
    ]);

    expect(result.rows).toHaveLength(2);
    expect(result.runCount).toBe(1);
    expect(result.totals.gross.toFixed(2)).toBe('60000.00');
    expect(result.totals.net.toFixed(2)).toBe('55000.00');
    expect(result.rows[0].fullNameTh).toBe('สมชาย ใจดี');
  });

  it('refuses a period with no runs', () => {
    expect(() => reconcilePeriod(period, [])).toThrow(PayrollReconciliationError);
    expect(() => reconcilePeriod(period, [])).toThrow(/no payroll runs/);
  });

  it('refuses a run that is not APPROVED, naming the run and its status', () => {
    const run = reconciledRun({ runNo: 'RUN-X', status: 'CALCULATED' });
    expect(() => reconcilePeriod(period, [run])).toThrow(PayrollReconciliationError);
    expect(() => reconcilePeriod(period, [run])).toThrow(/RUN-X is CALCULATED, not APPROVED/);
  });

  it('refuses a run whose gross does not add up, naming the difference', () => {
    // Payslips total 30,000 gross; the run wrongly records 30,450.
    const run = reconciledRun({ payslips: [slip()], totalGross: '30450.00' });
    let message = '';
    try {
      reconcilePeriod(period, [run]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/gross earnings/);
    expect(message).toMatch(/difference/);
    // 30,000 (payslips) − 30,450 (run) = −450.00
    expect(message).toContain('450.00');
  });

  it('refuses a run whose net does not add up', () => {
    const run = reconciledRun({ payslips: [slip()], totalNet: '27000.00' });
    expect(() => reconcilePeriod(period, [run])).toThrow(/net pay/);
  });

  it('refuses when the payslip count disagrees with the recorded employee count', () => {
    const run = reconciledRun({ payslips: [slip()], employeeCount: 5 });
    expect(() => reconcilePeriod(period, [run])).toThrow(/records 5 employee\(s\) but carries 1/);
  });

  it('reconciles across several runs in the period', () => {
    const result = reconcilePeriod(period, [
      reconciledRun({ runNo: 'RUN-A', payslips: [slip()] }),
      reconciledRun({ runNo: 'RUN-B', payslips: [slip({ employeeCode: 'EMP002' })] }),
    ]);
    expect(result.rows.map((r) => r.runNo)).toEqual(['RUN-A', 'RUN-B']);
    expect(result.runCount).toBe(2);
  });
});

describe('CSV format', () => {
  it('emits a header, a UTF-8 BOM and one line per payslip', () => {
    const reconciled = reconcilePeriod(period, [reconciledRun({ payslips: [slip()] })]);
    const csv = CSV_FORMAT.build(reconciled);

    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n');
    expect(lines[0]).toContain('Employee code');
    expect(lines[0]).toContain('Net pay');
    expect(lines).toHaveLength(2); // header + one payslip
    expect(lines[1]).toContain('EMP001');
    expect(lines[1]).toContain('30000.00');
    expect(lines[1]).toContain('27500.00');
  });

  it('quotes a field that contains a comma', () => {
    const reconciled = reconcilePeriod(period, [
      reconciledRun({ payslips: [slip({ firstNameTh: 'Smith, John', lastNameTh: null })] }),
    ]);
    const csv = CSV_FORMAT.build(reconciled);
    expect(csv).toContain('"Smith, John"');
  });
});

describe('resolveExportFormat', () => {
  it('defaults to csv when no format is given', () => {
    expect(resolveExportFormat(undefined)?.id).toBe('csv');
  });

  it('returns undefined for an unknown format', () => {
    expect(resolveExportFormat('pnd1')).toBeUndefined();
  });
});
