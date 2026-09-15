import {
  computeAnnualTax,
  computeMonthlyWithholding,
  computeOvertimePay,
  computeSocialSecurity,
  deriveHourlyRate,
  THAI_TAX_RULES_2026,
} from './thai-tax';

describe('computeAnnualTax', () => {
  const bareAllowances = {};

  it('charges no tax below the exemption threshold', () => {
    // 300,000 income − 100,000 expense cap... expense is 50% = 150,000 → capped 100,000
    // 300,000 − 100,000 − 60,000 personal = 140,000 < 150,000 exempt band.
    const result = computeAnnualTax(300_000, bareAllowances);
    expect(result.netTaxableIncome.toNumber()).toBe(140_000);
    expect(result.annualTax.toNumber()).toBe(0);
  });

  it('caps the employment expense deduction at 100,000', () => {
    const result = computeAnnualTax(1_000_000, bareAllowances);
    expect(result.expenseDeduction.toNumber()).toBe(100_000);
  });

  it('applies the progressive brackets correctly', () => {
    // 600,000 − 100,000 expense − 60,000 personal = 440,000 taxable.
    // 150,000 @ 0% = 0; 150,000 @ 5% = 7,500; 140,000 @ 10% = 14,000. Total 21,500.
    const result = computeAnnualTax(600_000, bareAllowances);
    expect(result.netTaxableIncome.toNumber()).toBe(440_000);
    expect(result.annualTax.toNumber()).toBe(21_500);
  });

  it('reaches the top bracket for very high earners', () => {
    // 10,000,000 − 100,000 − 60,000 = 9,840,000 taxable.
    // 0 + 7,500 + 20,000 + 37,500 + 50,000 + 250,000 + 900,000 = 1,265,000 through 5m,
    // then 4,840,000 @ 35% = 1,694,000 → 2,959,000.
    const result = computeAnnualTax(10_000_000, bareAllowances);
    expect(result.netTaxableIncome.toNumber()).toBe(9_840_000);
    expect(result.annualTax.toNumber()).toBe(2_959_000);
  });

  it('gives the enhanced allowance only to the 2nd+ child born 2018 or later', () => {
    const result = computeAnnualTax(600_000, {
      childrenCount: 2,
      childrenBorn2018OrLater: 2, // only 1 can qualify (the 2nd child)
    });
    // 30,000 (first child) + 60,000 (second, enhanced) = 90,000
    expect(result.allowanceDetail.children).toBe(90_000);
  });

  it('caps parent care at four parents', () => {
    const result = computeAnnualTax(1_000_000, { parentCareCount: 6 });
    expect(result.allowanceDetail.parentCare).toBe(120_000);
  });

  it('caps health insurance at 25,000 within the 100,000 combined ceiling', () => {
    const result = computeAnnualTax(1_000_000, {
      lifeInsurancePremium: 90_000,
      healthInsurancePremium: 40_000,
    });
    // health capped at 25,000; 90,000 + 25,000 = 115,000 → combined cap 100,000
    expect(result.allowanceDetail.insurance).toBe(100_000);
  });

  it('caps provident fund at 15% of income', () => {
    const result = computeAnnualTax(1_000_000, { providentFundContribution: 300_000 });
    expect(result.allowanceDetail.retirementFunds).toBe(150_000);
  });

  it('caps combined retirement funds at 500,000', () => {
    const result = computeAnnualTax(5_000_000, {
      providentFundContribution: 500_000,
      rmfContribution: 500_000,
      ssfContribution: 200_000,
    });
    expect(result.allowanceDetail.retirementFunds).toBe(500_000);
  });

  it('caps social security relief at the annual maximum', () => {
    const result = computeAnnualTax(600_000, { socialSecurityContribution: 12_000 });
    expect(result.allowanceDetail.socialSecurity).toBe(9_000);
  });

  it('limits donations to 10% of income after other deductions', () => {
    const result = computeAnnualTax(600_000, { donation: 200_000 });
    // after allowances = 440,000 → donation capped at 44,000
    expect(result.donationDeduction.toNumber()).toBe(44_000);
    expect(result.netTaxableIncome.toNumber()).toBe(396_000);
  });

  it('doubles education donations before applying the 10% cap', () => {
    const result = computeAnnualTax(600_000, { educationDonation: 10_000 });
    expect(result.donationDeduction.toNumber()).toBe(20_000);
  });

  it('never produces negative taxable income', () => {
    const result = computeAnnualTax(50_000, { childrenCount: 5, hasSpouseAllowance: true });
    expect(result.netTaxableIncome.toNumber()).toBe(0);
    expect(result.annualTax.toNumber()).toBe(0);
  });

  it('exposes a per-bracket breakdown that sums to the total', () => {
    const result = computeAnnualTax(1_500_000, bareAllowances);
    const summed = result.bracketDetail.reduce((acc, b) => acc + b.tax, 0);
    expect(Math.round(summed)).toBe(Math.round(result.annualTax.toNumber()));
  });
});

describe('computeSocialSecurity', () => {
  it('contributes 5% of wage for a mid-range salary', () => {
    const result = computeSocialSecurity(12_000);
    expect(result.employeeContribution.toNumber()).toBe(600);
    expect(result.employerContribution.toNumber()).toBe(600);
  });

  it('caps the contributory wage at 15,000', () => {
    const result = computeSocialSecurity(80_000);
    expect(result.contributoryWage.toNumber()).toBe(15_000);
    expect(result.employeeContribution.toNumber()).toBe(750);
  });

  it('contributes nothing below the wage floor', () => {
    const result = computeSocialSecurity(1_000);
    expect(result.employeeContribution.toNumber()).toBe(0);
  });

  it('stops once the annual ceiling is reached', () => {
    const result = computeSocialSecurity(30_000, THAI_TAX_RULES_2026, 8_700);
    expect(result.employeeContribution.toNumber()).toBe(300);
  });

  it('contributes nothing when the annual ceiling is already met', () => {
    const result = computeSocialSecurity(30_000, THAI_TAX_RULES_2026, 9_000);
    expect(result.employeeContribution.toNumber()).toBe(0);
  });
});

describe('computeMonthlyWithholding', () => {
  it('spreads the annual tax evenly across the year in January', () => {
    const result = computeMonthlyWithholding({
      monthlyTaxableIncome: 50_000,
      monthNumber: 1,
      allowances: {},
    });

    expect(result.projectedAnnualIncome.toNumber()).toBe(600_000);
    expect(result.projectedAnnualTax.toNumber()).toBe(21_500);
    // 21,500 / 12 months
    expect(result.withholdingThisMonth.toNumber()).toBeCloseTo(1_791.67, 2);
  });

  it('withholds the remaining balance over the remaining months', () => {
    const result = computeMonthlyWithholding({
      monthlyTaxableIncome: 50_000,
      ytdTaxableIncome: 250_000, // Jan–May already paid
      ytdWithheld: 8_958.35,
      monthNumber: 6,
      allowances: {},
    });

    // 7 months remaining (Jun–Dec): 250,000 + 50,000 × 7 = 600,000 projected
    expect(result.projectedAnnualIncome.toNumber()).toBe(600_000);
    expect(result.withholdingThisMonth.toNumber()).toBeCloseTo(1_791.66, 1);
  });

  it('projects a bonus once rather than annualising it', () => {
    const withBonus = computeMonthlyWithholding({
      monthlyTaxableIncome: 50_000,
      oneTimeIncome: 100_000,
      monthNumber: 1,
      allowances: {},
    });

    expect(withBonus.projectedAnnualIncome.toNumber()).toBe(700_000);
  });

  it('withholds nothing when allowances wipe out the liability', () => {
    const result = computeMonthlyWithholding({
      monthlyTaxableIncome: 20_000,
      monthNumber: 1,
      allowances: { hasSpouseAllowance: true, childrenCount: 2 },
    });

    expect(result.withholdingThisMonth.toNumber()).toBe(0);
  });

  it('never withholds a negative amount when over-withheld earlier', () => {
    const result = computeMonthlyWithholding({
      monthlyTaxableIncome: 50_000,
      ytdTaxableIncome: 550_000,
      ytdWithheld: 30_000,
      monthNumber: 12,
      allowances: {},
    });

    expect(result.withholdingThisMonth.toNumber()).toBe(0);
  });
});

describe('overtime helpers', () => {
  it('derives an hourly rate from a monthly salary', () => {
    expect(deriveHourlyRate(30_000).toNumber()).toBeCloseTo(125, 4);
  });

  it('pays 1.5× for overtime on a normal day', () => {
    expect(computeOvertimePay(125, 3, 1.5).toNumber()).toBe(562.5);
  });

  it('pays 3× for overtime on a public holiday', () => {
    expect(computeOvertimePay(125, 2, 3).toNumber()).toBe(750);
  });
});
