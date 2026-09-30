// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Decimal } from '../../../core/utils/money.util';

/**
 * An employee's tax year so far, and whose pay it was (CW-059).
 *
 * Three sources feed it, and keeping them apart is the point:
 * - months this employer paid through Cwork (approved and paid payslips);
 * - months this employer paid before it moved to Cwork (the opening balance
 *   imported for the year);
 * - pay from a previous employer earlier in the year (the tax profile's
 *   `priorEmployerIncome` and `priorEmployerTax`).
 *
 * Withholding projects from all three, because the employee's tax is on the
 * whole year's income (spec §6.3). The annual filings, ภ.ง.ด.1ก and 50 ทวิ,
 * report this employer's pay: the first two together. The third is another
 * employer's to report, which is why an opening balance is not entered as
 * prior-employer income.
 */

export interface PayToDate {
  taxableIncome: number;
  withholdingTax: number;
  /** The employee's social security contributions. */
  ssoEmployee: number;
}

export interface YearToDateInput {
  inCwork: PayToDate;
  beforeCwork?: PayToDate | null;
  previousEmployer?: { taxableIncome: number; withholdingTax: number } | null;
}

export interface YearToDate {
  /** This employer's pay, in Cwork and before it: what its annual filings report. */
  thisEmployer: PayToDate & { inCwork: PayToDate; beforeCwork: PayToDate };
  previousEmployer: { taxableIncome: number; withholdingTax: number };
  /**
   * What this month's payslip builds on: the year's income and tax so far for
   * the withholding projection, and this employer's social security for the
   * annual ceiling. Another employer's contributions were theirs to cap.
   */
  forThisMonth: PayToDate;
}

const NONE: PayToDate = { taxableIncome: 0, withholdingTax: 0, ssoEmployee: 0 };

export function yearToDate(input: YearToDateInput): YearToDate {
  const inCwork = input.inCwork;
  const beforeCwork = input.beforeCwork ?? NONE;
  const previousEmployer = input.previousEmployer ?? { taxableIncome: 0, withholdingTax: 0 };
  const thisEmployer = add(inCwork, beforeCwork);

  return {
    thisEmployer: { ...thisEmployer, inCwork, beforeCwork },
    previousEmployer,
    forThisMonth: {
      taxableIncome: sum(thisEmployer.taxableIncome, previousEmployer.taxableIncome),
      withholdingTax: sum(thisEmployer.withholdingTax, previousEmployer.withholdingTax),
      ssoEmployee: thisEmployer.ssoEmployee,
    },
  };
}

function add(a: PayToDate, b: PayToDate): PayToDate {
  return {
    taxableIncome: sum(a.taxableIncome, b.taxableIncome),
    withholdingTax: sum(a.withholdingTax, b.withholdingTax),
    ssoEmployee: sum(a.ssoEmployee, b.ssoEmployee),
  };
}

/** In decimal, so 0.1 + 0.2 baht is 0.3 baht. */
function sum(a: number, b: number): number {
  return new Decimal(a).plus(b).toNumber();
}
