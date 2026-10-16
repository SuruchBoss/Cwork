// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Decimal } from '../../core/utils/money.util';
import { formatThaiDocumentDate } from '../../core/utils/date.util';
import { formatBaht, periodRangeLabel } from './payslip-sheet';
import type { PrintablePayslip, PrintableRun } from './payslip-sheet';

/**
 * The cash-preparation sheet of a cash payday (CW-088): how many notes and coins
 * each person's envelope needs, and how much to withdraw. Pure, so the counting
 * is tested with hand-worked figures without drawing a PDF.
 *
 * The payslip and the receipt keep the exact net pay. Whatever cannot be handed
 * out in notes and coins (what is under the smallest coin, 25 satang) is shown
 * on the person's row as the remainder and is never rounded into the pay. The
 * pilot hands out every denomination, so none can be switched off.
 */

/** Thai notes then coins, largest first, in baht; the last two are satang coins. */
export const DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

/** Notes are 20 and up; below that the money is coins. */
export function isNote(denomination: Denomination): boolean {
  return denomination >= 20;
}

export type CashCounts = Record<Denomination, number>;

export interface CashSplit {
  counts: CashCounts;
  /** Sum of the notes and coins, in baht. */
  paid: Decimal;
  /** Net pay less `paid`: under 25 satang, or the whole pay when it is less than that. */
  remainder: Decimal;
}

const emptyCounts = (): CashCounts => ({
  1000: 0,
  500: 0,
  100: 0,
  50: 0,
  20: 0,
  10: 0,
  5: 0,
  2: 0,
  1: 0,
  0.5: 0,
  0.25: 0,
});

/** A denomination in whole satang, so the counting is integer arithmetic. */
const satangOf = (denomination: Denomination): number => Math.round(denomination * 100);

/**
 * Split a net pay into notes and coins, largest first. The Thai notes and coins
 * make a system in which taking the largest first is also the fewest pieces,
 * and it ends with less than 25 satang left. A pay of nothing or less hands out
 * nothing.
 */
export function splitCash(net: Decimal | string | number): CashSplit {
  const pay = new Decimal(net);
  const counts = emptyCounts();
  if (pay.lessThanOrEqualTo(0)) {
    return { counts, paid: new Decimal(0), remainder: pay };
  }

  // A net pay has two decimals; work in whole satang so nothing is rounded by float.
  let rest = pay.times(100).toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber();
  const total = rest;
  for (const denomination of DENOMINATIONS) {
    const unit = satangOf(denomination);
    const count = Math.floor(rest / unit);
    counts[denomination] = count;
    rest -= count * unit;
  }
  const paid = new Decimal(total - rest).dividedBy(100);
  return { counts, paid, remainder: pay.minus(paid) };
}

export interface CashRow {
  employeeCode: string;
  name: string;
  /** The exact net pay, as the payslip prints it. */
  net: string;
  counts: CashCounts;
  /** Notes and coins in baht: what goes in the envelope. */
  cash: string;
  /** Not handed out in cash; "0.00" when the pay splits exactly. */
  remainder: string;
}

export interface CashSheet {
  organizationName: string;
  taxId: string | null;
  runNo: string;
  periodLabel: string;
  payDateLabel: string;
  /** The denominations drawn as columns: every note and coin, largest first. */
  columns: readonly Denomination[];
  rows: CashRow[];
  totals: {
    net: string;
    counts: CashCounts;
    /** The amount to withdraw from the bank: the sum of every envelope. */
    withdraw: string;
    remainder: string;
  };
  /** Said on the printed page until the layout is checked against the paper form in use. */
  layoutNotice: string;
}

/** Stated on every page, since the columns follow common practice and not a form seen yet. */
export const CASH_SHEET_LAYOUT_NOTICE =
  'รูปแบบตารางตามที่ใช้กันทั่วไป ยังรอเทียบกับแบบฟอร์มกระดาษของบริษัทนำร่อง';

export function cashSheet(run: PrintableRun, slips: PrintablePayslip[]): CashSheet {
  const totalCounts = emptyCounts();
  let net = new Decimal(0);
  let withdraw = new Decimal(0);
  let remainder = new Decimal(0);

  const rows = slips.map((slip): CashRow => {
    const split = splitCash(slip.netPay);
    for (const denomination of DENOMINATIONS)
      totalCounts[denomination] += split.counts[denomination];
    net = net.plus(slip.netPay);
    withdraw = withdraw.plus(split.paid);
    remainder = remainder.plus(split.remainder);
    return {
      employeeCode: slip.employee.employeeCode,
      name: `${slip.employee.firstNameTh} ${slip.employee.lastNameTh}`.trim(),
      net: formatBaht(slip.netPay),
      counts: split.counts,
      cash: formatBaht(split.paid),
      remainder: formatBaht(split.remainder),
    };
  });

  return {
    organizationName: run.organization.legalName || run.organization.name,
    taxId: run.organization.taxId,
    runNo: run.runNo,
    periodLabel: periodRangeLabel(run.period.periodStart, run.period.periodEnd),
    payDateLabel: formatThaiDocumentDate(run.period.payDate),
    columns: DENOMINATIONS,
    rows,
    totals: {
      net: formatBaht(net),
      counts: totalCounts,
      withdraw: formatBaht(withdraw),
      remainder: formatBaht(remainder),
    },
    layoutNotice: CASH_SHEET_LAYOUT_NOTICE,
  };
}
