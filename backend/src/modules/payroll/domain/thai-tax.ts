// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Decimal, round2 } from '../../../core/utils/money.util';

/**
 * Thai personal income tax (PIT) and social security.
 *
 * The rule set is data, not code, so a rate change is a config edit and a new
 * test case rather than a rewrite. `THAI_TAX_RULES_2026` holds the values in
 * force for the 2026 tax year; add a new constant when the Revenue Department
 * changes them and select it by year.
 *
 * DISCLAIMER: this implements the common salaried-employee case. Edge cases
 * (multiple employers in one year, severance taxed separately, foreign income,
 * LTF legacy holdings) are out of scope — verify with an accountant before
 * filing. See docs/payroll-thailand.md.
 */

export interface TaxBracket {
  /** Upper bound of this bracket; `null` means "and above". */
  upTo: number | null;
  rate: number;
}

export interface TaxRuleSet {
  year: number;
  brackets: TaxBracket[];
  /** Employment-income expense deduction: 50% of income, capped. */
  expenseDeductionRate: number;
  expenseDeductionCap: number;
  personalAllowance: number;
  spouseAllowance: number;
  childAllowance: number;
  /** Second and subsequent children born 2018 or later get more. */
  childAllowanceBorn2018OrLater: number;
  parentCareAllowance: number;
  maxParentsClaimed: number;
  disabledCareAllowance: number;
  lifeInsuranceCap: number;
  healthInsuranceCap: number;
  /** Life + health insurance combined ceiling. */
  insuranceCombinedCap: number;
  parentHealthInsuranceCap: number;
  providentFundRateCap: number;
  providentFundCap: number;
  rmfRateCap: number;
  ssfRateCap: number;
  ssfCap: number;
  /** PVD + RMF + SSF + national savings fund combined ceiling. */
  retirementCombinedCap: number;
  socialSecurityCap: number;
  mortgageInterestCap: number;
  /** Donations are capped at this share of income after other deductions. */
  donationRateCap: number;
  educationDonationMultiplier: number;
  socialSecurity: {
    rate: number;
    minMonthlyWage: number;
    maxMonthlyWage: number;
  };
}

export const THAI_TAX_RULES_2026: TaxRuleSet = {
  year: 2026,
  brackets: [
    { upTo: 150_000, rate: 0 },
    { upTo: 300_000, rate: 0.05 },
    { upTo: 500_000, rate: 0.1 },
    { upTo: 750_000, rate: 0.15 },
    { upTo: 1_000_000, rate: 0.2 },
    { upTo: 2_000_000, rate: 0.25 },
    { upTo: 5_000_000, rate: 0.3 },
    { upTo: null, rate: 0.35 },
  ],
  expenseDeductionRate: 0.5,
  expenseDeductionCap: 100_000,
  personalAllowance: 60_000,
  spouseAllowance: 60_000,
  childAllowance: 30_000,
  childAllowanceBorn2018OrLater: 60_000,
  parentCareAllowance: 30_000,
  maxParentsClaimed: 4,
  disabledCareAllowance: 60_000,
  lifeInsuranceCap: 100_000,
  healthInsuranceCap: 25_000,
  insuranceCombinedCap: 100_000,
  parentHealthInsuranceCap: 15_000,
  providentFundRateCap: 0.15,
  providentFundCap: 500_000,
  rmfRateCap: 0.3,
  ssfRateCap: 0.3,
  ssfCap: 200_000,
  retirementCombinedCap: 500_000,
  socialSecurityCap: 9_000,
  mortgageInterestCap: 100_000,
  donationRateCap: 0.1,
  educationDonationMultiplier: 2,
  socialSecurity: {
    rate: 0.05,
    minMonthlyWage: 1_650,
    maxMonthlyWage: 15_000,
  },
};

export interface TaxAllowanceInput {
  hasSpouseAllowance?: boolean;
  childrenCount?: number;
  childrenBorn2018OrLater?: number;
  parentCareCount?: number;
  disabledCareCount?: number;
  lifeInsurancePremium?: number;
  healthInsurancePremium?: number;
  parentHealthInsurancePremium?: number;
  providentFundContribution?: number;
  rmfContribution?: number;
  ssfContribution?: number;
  socialSecurityContribution?: number;
  mortgageInterest?: number;
  donation?: number;
  educationDonation?: number;
}

export interface AnnualTaxResult {
  grossIncome: Decimal;
  expenseDeduction: Decimal;
  totalAllowances: Decimal;
  donationDeduction: Decimal;
  netTaxableIncome: Decimal;
  annualTax: Decimal;
  effectiveRate: Decimal;
  /** Per-bracket detail, for the payslip breakdown and for explaining the number. */
  bracketDetail: Array<{
    from: number;
    to: number | null;
    rate: number;
    taxable: number;
    tax: number;
  }>;
  allowanceDetail: Record<string, number>;
}

/**
 * Annual PIT for one employee.
 *
 * Order of operations, per the Revenue Code:
 *   1. Deduct employment expenses (50%, capped at 100,000).
 *   2. Deduct personal/family/insurance/retirement allowances.
 *   3. Deduct donations, capped at 10% of what remains.
 *   4. Apply the progressive brackets to the remainder.
 */
export function computeAnnualTax(
  grossIncome: number | Decimal,
  allowances: TaxAllowanceInput,
  rules: TaxRuleSet = THAI_TAX_RULES_2026,
): AnnualTaxResult {
  const income = new Decimal(grossIncome.toString());

  const expenseDeduction = Decimal.min(
    income.times(rules.expenseDeductionRate),
    new Decimal(rules.expenseDeductionCap),
  );

  const detail = buildAllowanceDetail(income, allowances, rules);
  const totalAllowances = Object.values(detail).reduce(
    (acc, value) => acc.plus(value),
    new Decimal(0),
  );

  const afterAllowances = Decimal.max(
    new Decimal(0),
    income.minus(expenseDeduction).minus(totalAllowances),
  );

  // Donations come last and are limited by income *after* other deductions.
  const donationClaim = new Decimal(allowances.donation ?? 0).plus(
    new Decimal(allowances.educationDonation ?? 0).times(rules.educationDonationMultiplier),
  );
  const donationDeduction = Decimal.min(
    donationClaim,
    afterAllowances.times(rules.donationRateCap),
  );

  const netTaxableIncome = Decimal.max(new Decimal(0), afterAllowances.minus(donationDeduction));
  const { tax, bracketDetail } = applyBrackets(netTaxableIncome, rules.brackets);

  return {
    grossIncome: round2(income),
    expenseDeduction: round2(expenseDeduction),
    totalAllowances: round2(totalAllowances),
    donationDeduction: round2(donationDeduction),
    netTaxableIncome: round2(netTaxableIncome),
    annualTax: round2(tax),
    effectiveRate: income.isZero() ? new Decimal(0) : round2(tax.dividedBy(income).times(100)),
    bracketDetail,
    allowanceDetail: Object.fromEntries(
      Object.entries(detail).map(([key, value]) => [key, value.toNumber()]),
    ),
  };
}

function buildAllowanceDetail(
  income: Decimal,
  input: TaxAllowanceInput,
  rules: TaxRuleSet,
): Record<string, Decimal> {
  const detail: Record<string, Decimal> = {};

  detail.personal = new Decimal(rules.personalAllowance);

  if (input.hasSpouseAllowance) {
    detail.spouse = new Decimal(rules.spouseAllowance);
  }

  const children = Math.max(0, input.childrenCount ?? 0);
  if (children > 0) {
    // The higher rate applies only to the 2nd and later child born 2018+.
    const enhanced = Math.min(
      Math.max(0, input.childrenBorn2018OrLater ?? 0),
      Math.max(0, children - 1),
    );
    const standard = children - enhanced;
    detail.children = new Decimal(rules.childAllowance)
      .times(standard)
      .plus(new Decimal(rules.childAllowanceBorn2018OrLater).times(enhanced));
  }

  const parents = Math.min(input.parentCareCount ?? 0, rules.maxParentsClaimed);
  if (parents > 0) {
    detail.parentCare = new Decimal(rules.parentCareAllowance).times(parents);
  }

  if ((input.disabledCareCount ?? 0) > 0) {
    detail.disabledCare = new Decimal(rules.disabledCareAllowance).times(input.disabledCareCount!);
  }

  // Health insurance has its own sub-cap inside the combined insurance cap.
  const health = Decimal.min(
    new Decimal(input.healthInsurancePremium ?? 0),
    new Decimal(rules.healthInsuranceCap),
  );
  const life = Decimal.min(
    new Decimal(input.lifeInsurancePremium ?? 0),
    new Decimal(rules.lifeInsuranceCap),
  );
  const insurance = Decimal.min(life.plus(health), new Decimal(rules.insuranceCombinedCap));
  if (insurance.greaterThan(0)) detail.insurance = insurance;

  const parentHealth = Decimal.min(
    new Decimal(input.parentHealthInsurancePremium ?? 0),
    new Decimal(rules.parentHealthInsuranceCap),
  );
  if (parentHealth.greaterThan(0)) detail.parentHealthInsurance = parentHealth;

  const pvd = Decimal.min(
    new Decimal(input.providentFundContribution ?? 0),
    income.times(rules.providentFundRateCap),
    new Decimal(rules.providentFundCap),
  );
  const rmf = Decimal.min(new Decimal(input.rmfContribution ?? 0), income.times(rules.rmfRateCap));
  const ssf = Decimal.min(
    new Decimal(input.ssfContribution ?? 0),
    income.times(rules.ssfRateCap),
    new Decimal(rules.ssfCap),
  );
  const retirement = Decimal.min(pvd.plus(rmf).plus(ssf), new Decimal(rules.retirementCombinedCap));
  if (retirement.greaterThan(0)) detail.retirementFunds = retirement;

  const sso = Decimal.min(
    new Decimal(input.socialSecurityContribution ?? 0),
    new Decimal(rules.socialSecurityCap),
  );
  if (sso.greaterThan(0)) detail.socialSecurity = sso;

  const mortgage = Decimal.min(
    new Decimal(input.mortgageInterest ?? 0),
    new Decimal(rules.mortgageInterestCap),
  );
  if (mortgage.greaterThan(0)) detail.mortgageInterest = mortgage;

  return detail;
}

function applyBrackets(
  taxableIncome: Decimal,
  brackets: TaxBracket[],
): { tax: Decimal; bracketDetail: AnnualTaxResult['bracketDetail'] } {
  let tax = new Decimal(0);
  let lowerBound = 0;
  const bracketDetail: AnnualTaxResult['bracketDetail'] = [];

  for (const bracket of brackets) {
    if (taxableIncome.lessThanOrEqualTo(lowerBound)) break;

    const upperBound = bracket.upTo ?? Number.POSITIVE_INFINITY;
    const slice = Decimal.min(
      taxableIncome,
      new Decimal(upperBound === Number.POSITIVE_INFINITY ? taxableIncome : upperBound),
    ).minus(lowerBound);

    if (slice.greaterThan(0)) {
      const bracketTax = slice.times(bracket.rate);
      tax = tax.plus(bracketTax);
      bracketDetail.push({
        from: lowerBound,
        to: bracket.upTo,
        rate: bracket.rate,
        taxable: slice.toNumber(),
        tax: round2(bracketTax).toNumber(),
      });
    }

    if (bracket.upTo === null) break;
    lowerBound = bracket.upTo;
  }

  return { tax, bracketDetail };
}

export interface MonthlyWithholdingInput {
  /** Taxable pay for this month (salary + taxable allowances). */
  monthlyTaxableIncome: number | Decimal;
  /** Taxable pay already received from this employer earlier in the year. */
  ytdTaxableIncome?: number | Decimal;
  /** Tax already withheld this year by this employer. */
  ytdWithheld?: number | Decimal;
  /** 1–12; drives how many months of income are projected. */
  monthNumber: number;
  /** Non-recurring taxable amounts (bonus) — projected once, not annualised. */
  oneTimeIncome?: number | Decimal;
  allowances: TaxAllowanceInput;
  rules?: TaxRuleSet;
}

export interface MonthlyWithholdingResult {
  projectedAnnualIncome: Decimal;
  projectedAnnualTax: Decimal;
  withholdingThisMonth: Decimal;
  annual: AnnualTaxResult;
}

/**
 * Monthly withholding using the Revenue Department's projection method:
 * estimate the year's income from the current month's regular pay, compute the
 * annual tax on it, then withhold the outstanding portion spread over the
 * remaining months. This keeps December from carrying a huge correction.
 */
export function computeMonthlyWithholding(
  input: MonthlyWithholdingInput,
): MonthlyWithholdingResult {
  const rules = input.rules ?? THAI_TAX_RULES_2026;
  const monthly = new Decimal(input.monthlyTaxableIncome.toString());
  const ytd = new Decimal((input.ytdTaxableIncome ?? 0).toString());
  const oneTime = new Decimal((input.oneTimeIncome ?? 0).toString());

  const monthNumber = Math.min(12, Math.max(1, input.monthNumber));
  const remainingMonths = 12 - monthNumber + 1;

  // Income already earned + this month + the rest of the year at this rate.
  const projectedAnnualIncome = ytd.plus(monthly.times(remainingMonths)).plus(oneTime);

  const annual = computeAnnualTax(projectedAnnualIncome, input.allowances, rules);
  const alreadyWithheld = new Decimal((input.ytdWithheld ?? 0).toString());

  const outstanding = Decimal.max(new Decimal(0), annual.annualTax.minus(alreadyWithheld));
  const withholdingThisMonth = round2(outstanding.dividedBy(remainingMonths));

  return {
    projectedAnnualIncome: round2(projectedAnnualIncome),
    projectedAnnualTax: annual.annualTax,
    withholdingThisMonth,
    annual,
  };
}

export interface SocialSecurityResult {
  contributoryWage: Decimal;
  employeeContribution: Decimal;
  employerContribution: Decimal;
}

/**
 * Social Security Fund contribution (มาตรา 33).
 *
 * 5% of wage, with the wage floored at 1,650 and capped at 15,000 THB/month —
 * so the contribution is between 83 and 750 THB. Employer matches.
 */
export function computeSocialSecurity(
  monthlyWage: number | Decimal,
  rules: TaxRuleSet = THAI_TAX_RULES_2026,
  ytdEmployeeContribution: number | Decimal = 0,
): SocialSecurityResult {
  const { rate, minMonthlyWage, maxMonthlyWage } = rules.socialSecurity;
  const wage = new Decimal(monthlyWage.toString());

  if (wage.lessThan(minMonthlyWage)) {
    // Below the floor there is no contributory wage at all.
    return {
      contributoryWage: new Decimal(0),
      employeeContribution: new Decimal(0),
      employerContribution: new Decimal(0),
    };
  }

  const contributoryWage = Decimal.min(wage, new Decimal(maxMonthlyWage));
  let contribution = round2(contributoryWage.times(rate));

  // The annual ceiling (9,000) stops contributions late in the year.
  const remainingAnnualRoom = Decimal.max(
    new Decimal(0),
    new Decimal(rules.socialSecurityCap).minus(ytdEmployeeContribution.toString()),
  );
  if (contribution.greaterThan(remainingAnnualRoom)) {
    contribution = round2(remainingAnnualRoom);
  }

  return {
    contributoryWage: round2(contributoryWage),
    employeeContribution: contribution,
    employerContribution: contribution,
  };
}

/**
 * Overtime pay for one request.
 * `hourlyRate` is derived from monthly salary ÷ (working days × hours/day).
 */
export function computeOvertimePay(
  hourlyRate: number | Decimal,
  hours: number | Decimal,
  multiplier: number | Decimal,
): Decimal {
  return round2(
    new Decimal(hourlyRate.toString()).times(hours.toString()).times(multiplier.toString()),
  );
}

/**
 * Hourly rate from a monthly salary. Thai practice divides by 30 days to get a
 * daily rate, then by the standard working hours in a day.
 */
export function deriveHourlyRate(
  monthlySalary: number | Decimal,
  workingHoursPerDay = 8,
  daysPerMonth = 30,
): Decimal {
  return new Decimal(monthlySalary.toString())
    .dividedBy(daysPerMonth)
    .dividedBy(workingHoursPerDay)
    .toDecimalPlaces(4);
}
