// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Decimal, round2 } from '../../../core/utils/money.util';
import { computeSocialSecurity, type TaxRuleSet } from './thai-tax';

/**
 * Social security that paid runs deducted against what the rules for their
 * year give (CW-075). Pure: the service gathers the payslips; this only
 * compares. Nothing here, or in what calls it, changes a payslip.
 */

/** One payslip's part of an employee's month, as stored. */
export interface PaidSlip {
  employeeId: string;
  employeeCode: string;
  name: string;
  /** 1–12. */
  month: number;
  /** The wage social security was worked out on, before the ceiling. */
  ssoWage: number;
  /** True when the wage was rebuilt from the payslip's lines, not stored on it. */
  wageRebuilt: boolean;
  ssoEmployee: number;
  ssoEmployer: number;
}

export interface ShortfallRow {
  employeeId: string;
  employeeCode: string;
  name: string;
  month: number;
  /** The month's social security wage: both halves added up. */
  wage: number;
  wageRebuilt: boolean;
  deductedEmployee: number;
  deductedEmployer: number;
  /** What the rules for the year give for the month. */
  owed: number;
  /** Owed less deducted. Negative when more was deducted than owed. */
  employeeDifference: number;
  employerDifference: number;
}

export interface ShortfallTotals {
  employee: number;
  employer: number;
}

export interface ShortfallReport {
  rows: ShortfallRow[];
  byMonth: Array<{ month: number } & ShortfallTotals>;
  total: ShortfallTotals;
}

/**
 * Compares each employee's month, never each payslip: the contribution is
 * monthly, so two halves are added up first and the floor and the ceiling
 * applied once. Months that come out even are left out.
 */
export function socialSecurityShortfall(slips: PaidSlip[], rules: TaxRuleSet): ShortfallReport {
  const months = new Map<string, ShortfallRow & { wageDecimal: Decimal }>();
  for (const slip of slips) {
    const key = `${slip.employeeId}:${slip.month}`;
    const row = months.get(key) ?? {
      employeeId: slip.employeeId,
      employeeCode: slip.employeeCode,
      name: slip.name,
      month: slip.month,
      wage: 0,
      wageDecimal: new Decimal(0),
      wageRebuilt: false,
      deductedEmployee: 0,
      deductedEmployer: 0,
      owed: 0,
      employeeDifference: 0,
      employerDifference: 0,
    };
    row.wageDecimal = row.wageDecimal.plus(slip.ssoWage);
    row.wageRebuilt = row.wageRebuilt || slip.wageRebuilt;
    row.deductedEmployee = round2(
      new Decimal(row.deductedEmployee).plus(slip.ssoEmployee),
    ).toNumber();
    row.deductedEmployer = round2(
      new Decimal(row.deductedEmployer).plus(slip.ssoEmployer),
    ).toNumber();
    months.set(key, row);
  }

  const rows: ShortfallRow[] = [];
  for (const { wageDecimal, ...row } of months.values()) {
    const owed = computeSocialSecurity(wageDecimal, rules).employeeContribution;
    const employeeDifference = round2(owed.minus(row.deductedEmployee));
    const employerDifference = round2(owed.minus(row.deductedEmployer));
    if (employeeDifference.isZero() && employerDifference.isZero()) continue;
    rows.push({
      ...row,
      wage: round2(wageDecimal).toNumber(),
      owed: owed.toNumber(),
      employeeDifference: employeeDifference.toNumber(),
      employerDifference: employerDifference.toNumber(),
    });
  }
  rows.sort((a, b) => a.month - b.month || a.employeeCode.localeCompare(b.employeeCode));

  const byMonth = new Map<number, { employee: Decimal; employer: Decimal }>();
  for (const row of rows) {
    const sum = byMonth.get(row.month) ?? { employee: new Decimal(0), employer: new Decimal(0) };
    sum.employee = sum.employee.plus(row.employeeDifference);
    sum.employer = sum.employer.plus(row.employerDifference);
    byMonth.set(row.month, sum);
  }
  const monthly = [...byMonth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, sum]) => ({
      month,
      employee: round2(sum.employee).toNumber(),
      employer: round2(sum.employer).toNumber(),
    }));
  const total = monthly.reduce(
    (acc, m) => ({
      employee: round2(new Decimal(acc.employee).plus(m.employee)).toNumber(),
      employer: round2(new Decimal(acc.employer).plus(m.employer)).toNumber(),
    }),
    { employee: 0, employer: 0 },
  );
  return { rows, byMonth: monthly, total };
}
