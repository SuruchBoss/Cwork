// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { buildPayslip, type PayslipInput } from './payroll-calculator';
import { yearToDate, type PayToDate } from './year-to-date';

const month = (monthNumber: number, baseSalary: number, ytd: PayToDate): PayslipInput => ({
  baseSalary,
  currency: 'THB',
  workingDaysInPeriod: 22,
  payableDays: 22,
  unpaidLeaveDays: 0,
  overtime: [],
  recurring: [],
  reimbursements: [],
  benefitDeductions: [],
  employerBenefitCosts: [],
  isSsoEligible: true,
  pvdEmployeeRate: 3,
  pvdEmployerRate: 3,
  monthNumber,
  ytdTaxableIncome: ytd.taxableIncome,
  ytdWithheldTax: ytd.withholdingTax,
  ytdSsoEmployee: ytd.ssoEmployee,
  taxAllowances: { hasSpouseAllowance: true, childrenCount: 1 },
});

/** A raise in May, so the months before Cwork are not all alike. */
const salaryIn = (monthNumber: number) => (monthNumber < 5 ? 62_000 : 71_500);

describe('yearToDate', () => {
  it("counts the months before Cwork as this employer's, and a previous employer's apart", () => {
    const ytd = yearToDate({
      inCwork: { taxableIncome: 70_000, withholdingTax: 3_000, ssoEmployee: 750 },
      beforeCwork: { taxableIncome: 560_000, withholdingTax: 24_000, ssoEmployee: 6_000 },
      previousEmployer: { taxableIncome: 90_000, withholdingTax: 1_500 },
    });

    // What ภ.ง.ด.1ก and 50 ทวิ report for this employer.
    expect(ytd.thisEmployer).toEqual({
      taxableIncome: 630_000,
      withholdingTax: 27_000,
      ssoEmployee: 6_750,
      inCwork: { taxableIncome: 70_000, withholdingTax: 3_000, ssoEmployee: 750 },
      beforeCwork: { taxableIncome: 560_000, withholdingTax: 24_000, ssoEmployee: 6_000 },
    });
    expect(ytd.previousEmployer).toEqual({ taxableIncome: 90_000, withholdingTax: 1_500 });
    // Withholding projects from all of it; the social security ceiling is this employer's.
    expect(ytd.forThisMonth).toEqual({
      taxableIncome: 720_000,
      withholdingTax: 28_500,
      ssoEmployee: 6_750,
    });
  });

  it('adds in decimal, not in floating point', () => {
    const ytd = yearToDate({
      inCwork: { taxableIncome: 0.1, withholdingTax: 0.1, ssoEmployee: 0.1 },
      beforeCwork: { taxableIncome: 0.2, withholdingTax: 0.2, ssoEmployee: 0.2 },
    });
    expect(ytd.thisEmployer.taxableIncome).toBe(0.3);
    expect(ytd.forThisMonth).toEqual({ taxableIncome: 0.3, withholdingTax: 0.3, ssoEmployee: 0.3 });
  });

  it('is only Cwork when nothing was imported and there was no previous employer', () => {
    const inCwork = { taxableIncome: 50_000, withholdingTax: 800, ssoEmployee: 750 };
    const ytd = yearToDate({ inCwork });
    expect(ytd.forThisMonth).toEqual(inCwork);
    expect(ytd.thisEmployer.beforeCwork).toEqual({
      taxableIncome: 0,
      withholdingTax: 0,
      ssoEmployee: 0,
    });
  });

  it('withholds the same September tax whether January to August ran in Cwork or were imported (CW-059)', () => {
    // Nine months in Cwork, each building on the last.
    let inCwork: PayToDate = { taxableIncome: 0, withholdingTax: 0, ssoEmployee: 0 };
    for (let m = 1; m <= 8; m += 1) {
      const slip = buildPayslip(month(m, salaryIn(m), yearToDate({ inCwork }).forThisMonth));
      inCwork = {
        taxableIncome: inCwork.taxableIncome + slip.taxableIncome.toNumber(),
        withholdingTax: inCwork.withholdingTax + slip.withholdingTax.toNumber(),
        ssoEmployee: inCwork.ssoEmployee + slip.ssoEmployee.toNumber(),
      };
    }
    const allInCwork = buildPayslip(month(9, salaryIn(9), yearToDate({ inCwork }).forThisMonth));

    // The same eight months paid elsewhere, their totals imported.
    const imported = buildPayslip(
      month(
        9,
        salaryIn(9),
        yearToDate({
          inCwork: { taxableIncome: 0, withholdingTax: 0, ssoEmployee: 0 },
          beforeCwork: inCwork,
        }).forThisMonth,
      ),
    );

    expect(allInCwork.withholdingTax.toNumber()).toBeGreaterThan(0);
    expect(imported.withholdingTax.toNumber()).toBe(allInCwork.withholdingTax.toNumber());
    expect(imported.ssoEmployee.toNumber()).toBe(allInCwork.ssoEmployee.toNumber());
    expect(imported.netPay.toNumber()).toBe(allInCwork.netPay.toNumber());

    // And without them, September withholds far less: the bug the import exists for.
    const forgotten = buildPayslip(
      month(9, salaryIn(9), { taxableIncome: 0, withholdingTax: 0, ssoEmployee: 0 }),
    );
    expect(forgotten.withholdingTax.toNumber()).toBeLessThan(allInCwork.withholdingTax.toNumber());
  });
});
