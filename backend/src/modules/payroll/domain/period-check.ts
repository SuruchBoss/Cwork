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
  type Table,
} from '../../../core/spreadsheet/table';
import { Decimal, round2 } from '../../../core/utils/money.util';
import type { ReconciledPeriod } from './payroll-export';
import { parseAmount } from './opening-balance-import';

/**
 * Checking a period against what was filed, and against HR's own method
 * (CW-089). Nothing here writes anything and nothing here touches a payslip: it
 * only sets figures side by side and says where they differ.
 *
 * "Differ" means to the satang. A filed total one satang off is a difference,
 * because the accountant's filing and Cwork's payslips are meant to be the same
 * money, and a satang that is explained is easier to live with than one that is
 * never looked at.
 */

export interface TotalCheck {
  cwork: string;
  filed: string;
  /** What was filed minus Cwork's figure: positive when more was filed than Cwork worked out. */
  difference: string;
  matches: boolean;
}

export interface FiledTotals {
  /** The withholding-tax total e-Filing produced, in baht. */
  tax?: Decimal | null;
  /** The social security total filed, employee and employer shares together, in baht. */
  sso?: Decimal | null;
}

export interface PeriodComparison {
  period: { code: string; year: number; month: number };
  /** One line for each total HR entered; null for one left blank. */
  tax: TotalCheck | null;
  sso: (TotalCheck & { employee: string; employer: string }) | null;
}

function check(cwork: Decimal, filed: Decimal): TotalCheck {
  const a = round2(cwork);
  const b = round2(filed);
  return {
    cwork: a.toFixed(2),
    filed: b.toFixed(2),
    difference: b.minus(a).toFixed(2),
    matches: a.equals(b),
  };
}

/** The period's own totals, against the ones HR typed in from the filings. */
export function compareFiledTotals(
  reconciled: ReconciledPeriod,
  filed: FiledTotals,
): PeriodComparison {
  const sum = (pick: (row: ReconciledPeriod['rows'][number]) => Decimal) =>
    reconciled.rows.reduce((acc, row) => acc.plus(pick(row)), new Decimal(0));
  const tax = sum((row) => row.withholdingTax);
  const employee = sum((row) => row.ssoEmployee);
  const employer = sum((row) => row.ssoEmployer);
  const { code, year, month } = reconciled.period;
  return {
    period: { code, year, month },
    tax: filed.tax ? check(tax, filed.tax) : null,
    sso: filed.sso
      ? {
          ...check(employee.plus(employer), filed.sso),
          employee: round2(employee).toFixed(2),
          employer: round2(employer).toFixed(2),
        }
      : null,
  };
}

// ------------------------------------------------------------ parallel run ----

export const PARALLEL_RUN_COLUMNS = {
  employeeCode: ['employee_code', 'รหัสพนักงาน', 'Employee code'],
  gross: ['gross', 'เงินได้', 'รายได้', 'Gross', 'Gross earnings', 'รายได้รวม'],
  tax: ['tax', 'ภาษี', 'ภาษีหัก ณ ที่จ่าย', 'Tax', 'Withholding tax', 'Tax withheld'],
  sso: [
    'social_security',
    'ประกันสังคม',
    'ประกันสังคม (ส่วนลูกจ้าง)',
    'Social security',
    'Social security (employee)',
    'SSO',
  ],
  net: ['net', 'สุทธิ', 'เงินได้สุทธิ', 'Net', 'Net pay', 'รับสุทธิ'],
} as const;

type FigureKey = 'gross' | 'tax' | 'sso' | 'net';
export const FIGURES: FigureKey[] = ['gross', 'tax', 'sso', 'net'];

/** How a missing column is named, in both languages at once. */
const FIGURE_NAMES: Record<keyof typeof PARALLEL_RUN_COLUMNS, string> = {
  employeeCode: 'รหัสพนักงาน / Employee code',
  gross: 'รายได้ / Gross',
  tax: 'ภาษีหัก ณ ที่จ่าย / Tax',
  sso: 'ประกันสังคม (ส่วนลูกจ้าง) / Social security (employee)',
  net: 'สุทธิ / Net',
};

/** One person's figures as Cwork has them for the period, runs added together. */
export interface CworkPerson {
  employeeCode: string;
  name: string;
  gross: Decimal;
  tax: Decimal;
  sso: Decimal;
  net: Decimal;
}

/** The period's people, one for each employee code, across all of its runs. */
export function cworkPeople(reconciled: ReconciledPeriod): Map<string, CworkPerson> {
  const people = new Map<string, CworkPerson>();
  for (const row of reconciled.rows) {
    const person = people.get(row.employeeCode) ?? {
      employeeCode: row.employeeCode,
      name: row.fullNameTh,
      gross: new Decimal(0),
      tax: new Decimal(0),
      sso: new Decimal(0),
      net: new Decimal(0),
    };
    person.gross = person.gross.plus(row.grossEarnings);
    person.tax = person.tax.plus(row.withholdingTax);
    person.sso = person.sso.plus(row.ssoEmployee);
    person.net = person.net.plus(row.netPay);
    people.set(row.employeeCode, person);
  }
  return people;
}

export interface FigureDiff {
  cwork: string;
  theirs: string;
  /** Theirs minus Cwork's. */
  difference: string;
  differs: boolean;
}

export interface PersonDiff {
  row: number;
  employeeCode: string;
  name: string;
  figures: Record<FigureKey, FigureDiff>;
  /** At least one column differs. */
  differs: boolean;
}

export interface ParallelRunResult {
  /** People in both, in the file's order. */
  people: PersonDiff[];
  /** Employee codes in HR's file that Cwork has no payslip for in this period. */
  onlyInFile: { row: number; employeeCode: string }[];
  /** People Cwork paid in this period that HR's file leaves out. */
  onlyInCwork: { employeeCode: string; name: string }[];
  problems: ImportProblem[];
}

const EMPTY: ParallelRunResult = { people: [], onlyInFile: [], onlyInCwork: [], problems: [] };

/**
 * HR's own per-person figures for the period, against Cwork's. Every person and
 * column that differs is marked; a person only one side has is listed as such.
 *
 * The file is strict where a wrong reading would hide a difference: every one
 * of the five columns must be there, every figure filled in (a blank is far more
 * often forgotten than zero), and a code twice is refused. A column it does not
 * know is ignored, since HR's own sheet has columns of its own.
 */
export function compareParallelRun(
  table: Table,
  cwork: Map<string, CworkPerson>,
): ParallelRunResult {
  const [header = [], ...body] = table.rows;
  const problems: ImportProblem[] = [];

  const keyByHeading = new Map<string, keyof typeof PARALLEL_RUN_COLUMNS>();
  for (const [key, headings] of Object.entries(PARALLEL_RUN_COLUMNS)) {
    for (const heading of headings) {
      keyByHeading.set(normaliseHeading(heading), key as keyof typeof PARALLEL_RUN_COLUMNS);
    }
  }

  const columns: Partial<Record<keyof typeof PARALLEL_RUN_COLUMNS, number>> = {};
  header.forEach((cell, index) => {
    const heading = asText(cell);
    if (heading === null) return;
    const key = keyByHeading.get(normaliseHeading(heading));
    if (!key) return;
    if (columns[key] !== undefined) {
      problems.push(
        importProblem(
          'DUPLICATE_COLUMN',
          { row: 1, column: columnLetter(index), header: heading },
          { header: heading },
        ),
      );
    } else columns[key] = index;
  });
  for (const key of Object.keys(PARALLEL_RUN_COLUMNS) as (keyof typeof PARALLEL_RUN_COLUMNS)[]) {
    if (columns[key] === undefined) {
      problems.push(importProblem('MISSING_COLUMN', { row: 1 }, { column: FIGURE_NAMES[key] }));
    }
  }
  if (problems.length > 0) return { ...EMPTY, problems };

  const lines = body
    .map((cells, i) => ({ cells, row: i + 2 }))
    .filter(({ cells }) => !isBlank(cells));
  if (lines.length === 0) return { ...EMPTY, problems: [importProblem('NO_ROWS', { row: 0 })] };
  if (lines.length > MAX_IMPORT_ROWS) {
    return {
      ...EMPTY,
      problems: [
        importProblem('TOO_MANY_ROWS', { row: 0 }, { rows: lines.length, max: MAX_IMPORT_ROWS }),
      ],
    };
  }

  const headerText = (index: number) => asText(header[index] ?? null) ?? undefined;
  const at = (row: number, index: number) => ({
    row,
    column: columnLetter(index),
    header: headerText(index),
  });

  const people: PersonDiff[] = [];
  const onlyInFile: ParallelRunResult['onlyInFile'] = [];
  const firstSeen = new Map<string, number>();

  for (const { cells, row } of lines) {
    const codeIndex = columns.employeeCode!;
    const code = asText(cells[codeIndex] ?? null);
    if (code === null) {
      problems.push(importProblem('REQUIRED', at(row, codeIndex)));
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

    const theirs: Partial<Record<FigureKey, Decimal>> = {};
    let bad = false;
    for (const key of FIGURES) {
      const index = columns[key]!;
      const cell = cells[index] ?? null;
      if (cell === null) {
        problems.push(importProblem('REQUIRED', at(row, index)));
        bad = true;
        continue;
      }
      const amount = parseAmount(cell);
      if (amount === null) {
        problems.push(importProblem('INVALID_AMOUNT', at(row, index), { value: asText(cell)! }));
        bad = true;
        continue;
      }
      theirs[key] = new Decimal(amount.toFixed(2));
    }
    if (bad) continue;

    const person = cwork.get(code);
    if (!person) {
      onlyInFile.push({ row, employeeCode: code });
      continue;
    }
    const figures = {} as Record<FigureKey, FigureDiff>;
    for (const key of FIGURES) {
      const ours = round2(person[key]);
      const other = theirs[key]!;
      figures[key] = {
        cwork: ours.toFixed(2),
        theirs: other.toFixed(2),
        difference: other.minus(ours).toFixed(2),
        differs: !ours.equals(other),
      };
    }
    people.push({
      row,
      employeeCode: code,
      name: person.name,
      figures,
      differs: FIGURES.some((key) => figures[key].differs),
    });
  }

  if (problems.length > 0) return { ...EMPTY, problems: problems.slice(0, MAX_PROBLEMS) };

  const seen = new Set(firstSeen.keys());
  const onlyInCwork = [...cwork.values()]
    .filter((person) => !seen.has(person.employeeCode))
    .map((person) => ({ employeeCode: person.employeeCode, name: person.name }));
  return { people, onlyInFile, onlyInCwork, problems };
}
