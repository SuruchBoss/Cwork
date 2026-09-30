// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  importProblem,
  MAX_IMPORT_ROWS,
  MAX_PROBLEMS,
  type ImportProblem,
} from '../../../core/spreadsheet/problems';
import {
  asText,
  columnLetter,
  isBlank,
  normaliseHeading,
  type Cell,
  type Table,
} from '../../../core/spreadsheet/table';
import { THAI_TAX_RULES_2026, type TaxRuleSet } from './thai-tax';

/**
 * This year's pay before the company moved to Cwork (CW-059): each employee's
 * taxable income, tax withheld and social security from January to the last
 * month paid elsewhere.
 *
 * Withholding projects the year from the year so far (spec §6.3), so without
 * these a company that starts in September withholds too little from
 * September on. The figures are this employer's own, and the annual filings
 * count them as such (see year-to-date.ts).
 *
 * One row per employee. The figures are **set**, not added: importing the same
 * file twice leaves the same figures. A row whose three amounts are all blank
 * changes nothing; a row with any of them needs all three, since a missing
 * figure is far more often forgotten than zero.
 */

export const OPENING_BALANCE_COLUMNS = {
  employeeCode: ['employee_code', 'รหัสพนักงาน', 'Employee code'],
  /** Printed in the template beside each code so HR can see who a row is; never read. */
  name: ['name', 'ชื่อ', 'Name'],
  taxableIncome: [
    'taxable_income',
    'เงินได้ที่ต้องเสียภาษี',
    'Taxable income',
    'เงินได้พึงประเมิน',
  ],
  withholdingTax: ['tax_withheld', 'ภาษีหัก ณ ที่จ่าย', 'Tax withheld', 'ภาษีที่หักไว้'],
  ssoEmployee: [
    'social_security',
    'ประกันสังคม (ส่วนลูกจ้าง)',
    'Social security (employee)',
    'ประกันสังคม',
    'Social security',
  ],
} as const;

type AmountKey = 'taxableIncome' | 'withholdingTax' | 'ssoEmployee';
const AMOUNTS: AmountKey[] = ['taxableIncome', 'withholdingTax', 'ssoEmployee'];

/** How a missing amount column is named, in both languages at once. */
const AMOUNT_NAMES: Record<AmountKey, string> = {
  taxableIncome: 'เงินได้ที่ต้องเสียภาษี / Taxable income',
  withholdingTax: 'ภาษีหัก ณ ที่จ่าย / Tax withheld',
  ssoEmployee: 'ประกันสังคม (ส่วนลูกจ้าง) / Social security (employee)',
};

export interface OpeningBalanceContext {
  year: number;
  /** The last month the figures cover, 1–12. */
  throughMonth: number;
  /** Employees of the organisation, by code. */
  employees: Map<string, { id: string; name: string }>;
  /** The first month of the year this employee was paid in Cwork, as "2026-08", if any. */
  paidInCwork: (employeeId: string) => string | undefined;
  /** Employees who already have figures for the year, which the file replaces. */
  existing: Set<string>;
  rules?: TaxRuleSet;
}

export interface OpeningBalanceRow {
  row: number;
  employeeId: string;
  employeeCode: string;
  name: string;
  taxableIncome: number;
  withholdingTax: number;
  ssoEmployee: number;
  /** The employee already had figures for the year; these replace them. */
  replaces: boolean;
}

/** Every employee's figures, or every problem with the file. */
export function readOpeningBalances(
  table: Table,
  context: OpeningBalanceContext,
): { rows: OpeningBalanceRow[]; problems: ImportProblem[] } {
  const [header = [], ...body] = table.rows;
  const problems: ImportProblem[] = [];

  const keyByHeading = new Map<string, keyof typeof OPENING_BALANCE_COLUMNS>();
  for (const [key, headings] of Object.entries(OPENING_BALANCE_COLUMNS)) {
    for (const heading of headings) {
      keyByHeading.set(normaliseHeading(heading), key as keyof typeof OPENING_BALANCE_COLUMNS);
    }
  }

  const columns: Partial<Record<keyof typeof OPENING_BALANCE_COLUMNS, number>> = {};
  header.forEach((cell, index) => {
    const heading = asText(cell);
    if (heading === null) return;
    const where = { row: 1, column: columnLetter(index), header: heading };
    const key = keyByHeading.get(normaliseHeading(heading));
    if (!key) problems.push(importProblem('UNKNOWN_COLUMN', where, { header: heading }));
    else if (columns[key] !== undefined) {
      problems.push(importProblem('DUPLICATE_COLUMN', where, { header: heading }));
    } else columns[key] = index;
  });
  if (columns.employeeCode === undefined) {
    problems.push(
      importProblem('MISSING_COLUMN', { row: 1 }, { column: 'รหัสพนักงาน / Employee code' }),
    );
  }
  for (const key of AMOUNTS) {
    if (columns[key] === undefined) {
      problems.push(importProblem('MISSING_COLUMN', { row: 1 }, { column: AMOUNT_NAMES[key] }));
    }
  }
  if (problems.length > 0) return { rows: [], problems };

  const lines = body
    .map((cells, i) => ({ cells, row: i + 2 }))
    .filter(({ cells }) => !isBlank(cells));
  if (lines.length === 0) return { rows: [], problems: [importProblem('NO_ROWS', { row: 0 })] };
  if (lines.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      problems: [
        importProblem('TOO_MANY_ROWS', { row: 0 }, { rows: lines.length, max: MAX_IMPORT_ROWS }),
      ],
    };
  }

  const ssoLimit = socialSecurityLimit(context.throughMonth, context.rules);
  const headerText = (index: number) => asText(header[index] ?? null) ?? undefined;
  const at = (row: number, index: number) => ({
    row,
    column: columnLetter(index),
    header: headerText(index),
  });

  const rows: OpeningBalanceRow[] = [];
  const firstSeen = new Map<string, number>();

  for (const { cells, row } of lines) {
    const codeIndex = columns.employeeCode!;
    const code = asText(cells[codeIndex] ?? null);
    const cellOf = (key: AmountKey) => cells[columns[key]!] ?? null;

    // Nothing to set on this row: a listed employee HR had no figures for.
    if (AMOUNTS.every((key) => cellOf(key) === null)) continue;

    if (code === null) {
      problems.push(importProblem('REQUIRED', at(row, codeIndex)));
      continue;
    }
    const employee = context.employees.get(code);
    if (!employee) {
      problems.push(
        importProblem('NOT_FOUND', at(row, codeIndex), { what: 'employee', value: code }),
      );
      continue;
    }
    const earlier = firstSeen.get(code);
    if (earlier) {
      problems.push(
        importProblem('DUPLICATE_IN_FILE', at(row, codeIndex), { value: code, other: earlier }),
      );
      continue;
    }
    firstSeen.set(code, row);

    const before = problems.length;
    const paidInCwork = context.paidInCwork(employee.id);
    if (paidInCwork) {
      problems.push(
        importProblem('PAID_IN_CWORK', at(row, codeIndex), {
          employee: employee.name,
          period: paidInCwork,
        }),
      );
    }

    const amounts: Partial<Record<AmountKey, number>> = {};
    for (const key of AMOUNTS) {
      const cell = cellOf(key);
      const where = at(row, columns[key]!);
      if (cell === null) {
        problems.push(importProblem('REQUIRED', where));
        continue;
      }
      const amount = parseAmount(cell);
      if (amount === null) {
        problems.push(importProblem('INVALID_AMOUNT', where, { value: asText(cell)! }));
        continue;
      }
      amounts[key] = amount;
    }

    const { taxableIncome, withholdingTax, ssoEmployee } = amounts;
    if (
      taxableIncome !== undefined &&
      withholdingTax !== undefined &&
      withholdingTax > taxableIncome
    ) {
      problems.push(
        importProblem('TAX_OVER_INCOME', at(row, columns.withholdingTax!), {
          value: withholdingTax,
          income: taxableIncome,
        }),
      );
    }
    if (ssoEmployee !== undefined && ssoEmployee > ssoLimit) {
      problems.push(
        importProblem('SSO_OVER_LIMIT', at(row, columns.ssoEmployee!), {
          value: ssoEmployee,
          max: ssoLimit,
          months: context.throughMonth,
        }),
      );
    }

    if (problems.length === before) {
      rows.push({
        row,
        employeeId: employee.id,
        employeeCode: code,
        name: employee.name,
        taxableIncome: taxableIncome!,
        withholdingTax: withholdingTax!,
        ssoEmployee: ssoEmployee!,
        replaces: context.existing.has(employee.id),
      });
    }
  }

  if (problems.length > 0) return { rows: [], problems: problems.slice(0, MAX_PROBLEMS) };
  if (rows.length === 0) return { rows: [], problems: [importProblem('NO_FIGURES', { row: 0 })] };
  return { rows, problems };
}

/**
 * The most an employee can have paid into social security by the end of a
 * month: the largest monthly contribution for every month so far, and never
 * past the annual ceiling. A figure above it is usually the employer's share
 * added in, which is not the employee's to count.
 */
export function socialSecurityLimit(
  throughMonth: number,
  rules: TaxRuleSet = THAI_TAX_RULES_2026,
): number {
  const monthly = rules.socialSecurity.maxMonthlyWage * rules.socialSecurity.rate;
  return Math.min(rules.socialSecurityCap, round2(monthly * throughMonth));
}

/** Largest amount accepted: far beyond any salary, well inside the column. */
const MAX_AMOUNT = 100_000_000_000;

/**
 * Baht, 0 or more, at most two decimals: a number cell, or text as Excel's CSV
 * writes it ("360,000.00").
 */
export function parseAmount(cell: Cell): number | null {
  if (cell === null) return null;
  let value: number;
  if (typeof cell === 'number') {
    value = cell;
  } else {
    const text = cell.trim();
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(text)) return null;
    value = Number(text.replace(/,/g, ''));
  }
  if (!Number.isFinite(value) || value < 0 || value >= MAX_AMOUNT) return null;
  // A number cell carries whatever Excel computed; more than satang is a typo.
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return null;
  return round2(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
