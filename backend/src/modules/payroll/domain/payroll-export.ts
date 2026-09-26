// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Decimal, formatMoney, money, round2 } from '../../../core/utils/money.util';

/**
 * The payroll export seam (CW-044).
 *
 * A period is reconciled *once*, here, into a checked set of figures; a format
 * is then a pure function over that set. ภ.ง.ด.1, 50 ทวิ, ประกันสังคม and the
 * bank file each become one more `ExportFormat`, not one more implementation of
 * the reconciliation — so there is exactly one place a total can be checked
 * against its payslips, and no format can quietly file a different number.
 *
 * Everything here is pure: money arrives as Prisma.Decimal | string | number
 * (the API serialises Decimal as a string) and is coerced through `money()`.
 */

/** A run status; only APPROVED runs may be exported. */
const APPROVED_STATUS = 'APPROVED';

type MoneyInput = Parameters<typeof money>[0];

export interface ExportPayslip {
  employeeCode: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
  departmentName: string | null;
  currency: string;
  grossEarnings: MoneyInput;
  totalDeductions: MoneyInput;
  taxableIncome: MoneyInput;
  withholdingTax: MoneyInput;
  ssoEmployee: MoneyInput;
  ssoEmployer: MoneyInput;
  netPay: MoneyInput;
}

export interface ExportRun {
  runNo: string;
  status: string;
  employeeCount: number;
  totalGross: MoneyInput;
  totalDeduction: MoneyInput;
  totalNet: MoneyInput;
  payslips: ExportPayslip[];
}

export interface ExportPeriod {
  code: string;
  year: number;
  month: number;
}

/** One payslip's checked figures. A format reads these, never the raw rows. */
export interface ReconciledRow {
  runNo: string;
  employeeCode: string;
  fullNameTh: string;
  departmentName: string;
  currency: string;
  grossEarnings: Decimal;
  totalDeductions: Decimal;
  taxableIncome: Decimal;
  withholdingTax: Decimal;
  ssoEmployee: Decimal;
  ssoEmployer: Decimal;
  netPay: Decimal;
}

export interface ReconciledPeriod {
  period: ExportPeriod;
  rows: ReconciledRow[];
  totals: { gross: Decimal; deduction: Decimal; net: Decimal };
  runCount: number;
}

/**
 * A period that cannot be exported truthfully. The message names the run and,
 * for a total mismatch, the difference — never a generic failure. The service
 * maps this to a 422 so the officer sees exactly what is wrong.
 */
export class PayrollReconciliationError extends Error {
  readonly code = 'PAYROLL_NOT_RECONCILED';
  constructor(message: string) {
    super(message);
    this.name = 'PayrollReconciliationError';
  }
}

/**
 * Checks a period's runs and returns its reconciled rows, or throws
 * PayrollReconciliationError naming what is wrong. Refuses when: the period has
 * no runs; any run is not APPROVED; a run's payslip count disagrees with its
 * recorded employee count; or a run's payslip totals do not add up to the run
 * totals (gross, deductions or net).
 */
export function reconcilePeriod(period: ExportPeriod, runs: ExportRun[]): ReconciledPeriod {
  if (runs.length === 0) {
    throw new PayrollReconciliationError(
      `Period ${period.code} has no payroll runs, so there is nothing to export.`,
    );
  }

  for (const run of runs) {
    if (run.status !== APPROVED_STATUS) {
      throw new PayrollReconciliationError(
        `Run ${run.runNo} is ${run.status}, not APPROVED — every run in period ` +
          `${period.code} must be approved before the period can be exported.`,
      );
    }
  }

  for (const run of runs) {
    if (run.payslips.length !== run.employeeCount) {
      throw new PayrollReconciliationError(
        `Run ${run.runNo} does not reconcile: it records ${run.employeeCount} ` +
          `employee(s) but carries ${run.payslips.length} payslip(s).`,
      );
    }
    reconcileTotal(run, 'gross earnings', run.totalGross, (p) => p.grossEarnings);
    reconcileTotal(run, 'deductions', run.totalDeduction, (p) => p.totalDeductions);
    reconcileTotal(run, 'net pay', run.totalNet, (p) => p.netPay);
  }

  const rows = runs.flatMap((run) => run.payslips.map((slip) => toRow(run, slip)));

  return {
    period,
    rows,
    runCount: runs.length,
    totals: {
      gross: sumRows(rows, 'grossEarnings'),
      deduction: sumRows(rows, 'totalDeductions'),
      net: sumRows(rows, 'netPay'),
    },
  };
}

function reconcileTotal(
  run: ExportRun,
  label: string,
  recorded: MoneyInput,
  pick: (slip: ExportPayslip) => MoneyInput,
): void {
  const expected = round2(money(recorded));
  const actual = round2(
    run.payslips.reduce((acc, slip) => acc.plus(money(pick(slip))), new Decimal(0)),
  );
  if (!expected.equals(actual)) {
    const difference = actual.minus(expected);
    throw new PayrollReconciliationError(
      `Run ${run.runNo} does not reconcile: ${label} on its payslips total ` +
        `${formatMoney(actual)} but the run records ${formatMoney(expected)} ` +
        `(difference ${formatMoney(difference)}).`,
    );
  }
}

function toRow(run: ExportRun, slip: ExportPayslip): ReconciledRow {
  return {
    runNo: run.runNo,
    employeeCode: slip.employeeCode,
    fullNameTh: `${slip.firstNameTh ?? ''} ${slip.lastNameTh ?? ''}`.trim(),
    departmentName: slip.departmentName ?? '',
    currency: slip.currency,
    grossEarnings: round2(money(slip.grossEarnings)),
    totalDeductions: round2(money(slip.totalDeductions)),
    taxableIncome: round2(money(slip.taxableIncome)),
    withholdingTax: round2(money(slip.withholdingTax)),
    ssoEmployee: round2(money(slip.ssoEmployee)),
    ssoEmployer: round2(money(slip.ssoEmployer)),
    netPay: round2(money(slip.netPay)),
  };
}

function sumRows(rows: ReconciledRow[], field: keyof ReconciledRow): Decimal {
  return round2(rows.reduce((acc, row) => acc.plus(row[field] as Decimal), new Decimal(0)));
}

// ---------------------------------------------------------------- formats ----

export interface ExportFormat {
  id: string;
  /** Human label, for the audit summary and the console. */
  label: string;
  extension: string;
  contentType: string;
  build(reconciled: ReconciledPeriod): string;
}

/** RFC 4180 field: quote when it holds a comma, quote or newline. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const CSV_COLUMNS: Array<{ header: string; value: (row: ReconciledRow) => string }> = [
  { header: 'Run', value: (r) => r.runNo },
  { header: 'Employee code', value: (r) => r.employeeCode },
  { header: 'Name (TH)', value: (r) => r.fullNameTh },
  { header: 'Department', value: (r) => r.departmentName },
  { header: 'Currency', value: (r) => r.currency },
  { header: 'Gross earnings', value: (r) => r.grossEarnings.toFixed(2) },
  { header: 'Deductions', value: (r) => r.totalDeductions.toFixed(2) },
  { header: 'Taxable income', value: (r) => r.taxableIncome.toFixed(2) },
  { header: 'Withholding tax', value: (r) => r.withholdingTax.toFixed(2) },
  { header: 'SSO (employee)', value: (r) => r.ssoEmployee.toFixed(2) },
  { header: 'SSO (employer)', value: (r) => r.ssoEmployer.toFixed(2) },
  { header: 'Net pay', value: (r) => r.netPay.toFixed(2) },
];

function buildPayslipCsv(reconciled: ReconciledPeriod): string {
  const rows = [
    CSV_COLUMNS.map((c) => c.header),
    ...reconciled.rows.map((row) => CSV_COLUMNS.map((c) => c.value(row))),
  ];
  const body = rows.map((cells) => cells.map(csvField).join(',')).join('\r\n');
  // A UTF-8 BOM so a Thai name renders correctly when the file is opened in
  // Excel, which otherwise assumes the system codepage.
  return `\uFEFF${body}\r\n`;
}

export const CSV_FORMAT: ExportFormat = {
  id: 'csv',
  label: 'Payslip totals (CSV)',
  extension: 'csv',
  contentType: 'text/csv; charset=utf-8',
  build: buildPayslipCsv,
};

/**
 * The formats this period-export supports. CW-044 ships only `csv`; #44 and the
 * tickets after it add entries here — each a formatter over ReconciledPeriod.
 */
export const EXPORT_FORMATS: Record<string, ExportFormat> = {
  [CSV_FORMAT.id]: CSV_FORMAT,
};

export const DEFAULT_EXPORT_FORMAT = CSV_FORMAT.id;

export function resolveExportFormat(id: string | undefined): ExportFormat | undefined {
  return EXPORT_FORMATS[id ?? DEFAULT_EXPORT_FORMAT];
}
