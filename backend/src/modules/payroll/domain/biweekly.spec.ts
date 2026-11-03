// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { buildPayslip, type FirstHalfPaid, type PayslipInput } from './payroll-calculator';
import { computeSocialSecurity } from './thai-tax';

/**
 * Daily wages paid every 14 days (CW-101): a month is two or three periods, and
 * the month's social security and withholding come out as one monthly run on the
 * same total would have them. The figures are worked by hand in the comments.
 */

const daily = (dailyRate: number, daysPaid: number): PayslipInput => ({
  baseSalary: 0,
  dailyWage: { rate: dailyRate, daysPaid },
  currency: 'THB',
  workingDaysInPeriod: 0,
  payableDays: daysPaid,
  unpaidLeaveDays: 0,
  overtime: [],
  recurring: [],
  reimbursements: [],
  benefitDeductions: [],
  employerBenefitCosts: [],
  isSsoEligible: true,
  pvdEmployeeRate: 0,
  pvdEmployerRate: 0,
  monthNumber: 1,
  ytdTaxableIncome: 0,
  ytdWithheldTax: 0,
  taxAllowances: {},
});

const none: FirstHalfPaid = {
  taxableIncome: 0,
  withholdingTax: 0,
  ssoEmployee: 0,
  ssoWage: 0,
  pvdEmployee: 0,
};

const add = (a: FirstHalfPaid, slip: ReturnType<typeof buildPayslip>): FirstHalfPaid => ({
  taxableIncome: a.taxableIncome + slip.taxableIncome.toNumber(),
  withholdingTax: a.withholdingTax + slip.withholdingTax.toNumber(),
  ssoEmployee: a.ssoEmployee + slip.ssoEmployee.toNumber(),
  ssoWage: a.ssoWage + slip.ssoWage.toNumber(),
  pvdEmployee: a.pvdEmployee + slip.pvdEmployee.toNumber(),
});

/** A month's periods in order, each built on the sum of the ones before it. */
function monthOf(periods: PayslipInput[]) {
  const slips: Array<ReturnType<typeof buildPayslip>> = [];
  let before = none;
  periods.forEach((input, i) => {
    const slip = buildPayslip({
      ...input,
      half: i === 0 ? { half: 1 } : { half: 2, firstHalf: before },
    });
    slips.push(slip);
    before = add(before, slip);
  });
  return slips;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('Social security across the 14-day periods of a month', () => {
  it.each([
    // [label, days paid in each period at 400 a day]
    ['two periods', [10, 10]],
    ['three periods', [10, 10, 10]],
    ['a short first period', [3, 10, 9]],
    ['under the floor in the first', [2, 9, 8]],
    ['over the ceiling by the second', [10, 10, 10, 10]],
  ])('adds up to the monthly figure, rounded once: %s', (_label, days) => {
    const slips = monthOf(days.map((d) => daily(400, d)));
    const total = sum(days) * 400;

    expect(sum(slips.map((s) => s.ssoEmployee.toNumber()))).toBe(
      computeSocialSecurity(total).employeeContribution.toNumber(),
    );
    expect(sum(slips.map((s) => s.ssoEmployer.toNumber()))).toBe(
      computeSocialSecurity(total).employerContribution.toNumber(),
    );
  });

  it('takes 5% of the first period on its own, with no floor, as a first half does', () => {
    // 400 × 3 = 1,200 → 60, though a month under 1,650 would pay 1,650 × 5%.
    const [first] = monthOf([daily(400, 3), daily(400, 10)]);

    expect(first!.ssoEmployee.toNumber()).toBe(60);
  });

  it('takes a middle period as the month so far less what was taken', () => {
    // 4,000 → 200; then 8,000 so far → 400, so the second takes 200; then 12,000 → 600, so 200.
    const slips = monthOf([daily(400, 10), daily(400, 10), daily(400, 10)]);

    expect(slips.map((s) => s.ssoEmployee.toNumber())).toEqual([200, 200, 200]);
  });
});

describe('Withholding across the 14-day periods of a month', () => {
  it('never takes less than nothing in a later period, and takes the month in all', () => {
    // 15,000 a month of wages is under the tax-free amount; a bigger daily rate is not.
    const slips = monthOf([daily(2_000, 10), daily(2_000, 10), daily(2_000, 10)]);
    const withheld = slips.map((s) => s.withholdingTax.toNumber());
    const month = buildPayslip({ ...daily(2_000, 30), monthNumber: 1 });

    expect(withheld.every((w) => w >= 0)).toBe(true);
    expect(sum(withheld)).toBeCloseTo(month.withholdingTax.toNumber(), 0);
  });
});
