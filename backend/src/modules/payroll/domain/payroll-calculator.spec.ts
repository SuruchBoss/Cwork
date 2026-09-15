import { PayComponentType } from '@prisma/client';
import { buildPayslip, type PayslipInput } from './payroll-calculator';

const base: PayslipInput = {
  baseSalary: 30_000,
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
  pvdEmployeeRate: 0,
  pvdEmployerRate: 0,
  monthNumber: 1,
  ytdTaxableIncome: 0,
  ytdWithheldTax: 0,
  ytdSsoEmployee: 0,
  taxAllowances: {},
};

const lineFor = (draft: ReturnType<typeof buildPayslip>, code: string) =>
  draft.lines.find((l) => l.code === code);

describe('buildPayslip', () => {
  it('pays full salary and deducts social security for a clean month', () => {
    const draft = buildPayslip(base);

    expect(draft.grossEarnings.toNumber()).toBe(30_000);
    expect(draft.ssoEmployee.toNumber()).toBe(750); // capped at 15,000 × 5%
    expect(draft.ssoEmployer.toNumber()).toBe(750);
    expect(draft.netPay.toNumber()).toBe(30_000 - draft.totalDeductions.toNumber());
  });

  it('keeps net = gross − deductions exactly', () => {
    const draft = buildPayslip({
      ...base,
      recurring: [
        {
          code: 'HOUSING',
          name: 'ค่าที่พัก',
          type: PayComponentType.EARNING,
          amount: 5_000,
          isTaxable: true,
          includeInSsoBase: true,
          isProratable: true,
          orderIndex: 1,
        },
        {
          code: 'LOAN',
          name: 'หักเงินกู้',
          type: PayComponentType.DEDUCTION,
          amount: 2_000,
          isTaxable: false,
          includeInSsoBase: false,
          isProratable: false,
          orderIndex: 1,
        },
      ],
    });

    expect(draft.netPay.toNumber()).toBeCloseTo(
      draft.grossEarnings.minus(draft.totalDeductions).toNumber(),
      2,
    );
  });

  it('pro-rates salary for a partial month', () => {
    const draft = buildPayslip({ ...base, payableDays: 11, unpaidLeaveDays: 11 });

    expect(lineFor(draft, 'BASE')?.amount.toNumber()).toBe(15_000);
    expect(lineFor(draft, 'BASE')?.meta).toMatchObject({ proratedFrom: 30_000 });
  });

  it('records unpaid leave as an informational line, not a double deduction', () => {
    const draft = buildPayslip({ ...base, payableDays: 20, unpaidLeaveDays: 2 });
    const unpaid = lineFor(draft, 'UNPAID_LEAVE');

    expect(unpaid?.type).toBe(PayComponentType.INFORMATIONAL);
    // Informational lines must not move the totals.
    expect(draft.grossEarnings.toNumber()).toBeCloseTo(27_272.73, 2);
  });

  it('pays overtime at the requested multiplier', () => {
    const draft = buildPayslip({
      ...base,
      overtime: [{ type: 'NORMAL_DAY', hours: 10, multiplier: 1.5 }],
    });

    // 30,000 / 30 days / 8 h = 125/h → 125 × 10 × 1.5 = 1,875
    expect(lineFor(draft, 'OT_NORMAL_DAY')?.amount.toNumber()).toBe(1_875);
    expect(draft.overtimeHours.toNumber()).toBe(10);
  });

  it('excludes reimbursements from taxable income', () => {
    const withClaim = buildPayslip({
      ...base,
      reimbursements: [{ code: 'EXP-1', name: 'ค่าเดินทาง', amount: 3_000 }],
    });

    expect(withClaim.grossEarnings.toNumber()).toBe(33_000);
    expect(withClaim.taxableIncome.toNumber()).toBe(30_000);
    expect(withClaim.withholdingTax.toNumber()).toBe(buildPayslip(base).withholdingTax.toNumber());
  });

  it('skips social security for an ineligible employee', () => {
    const draft = buildPayslip({ ...base, isSsoEligible: false });

    expect(draft.ssoEmployee.toNumber()).toBe(0);
    expect(lineFor(draft, 'SSO')).toBeUndefined();
  });

  it('deducts provident fund at the configured rates', () => {
    const draft = buildPayslip({ ...base, pvdEmployeeRate: 5, pvdEmployerRate: 5 });

    expect(draft.pvdEmployee.toNumber()).toBe(1_500);
    expect(draft.pvdEmployer.toNumber()).toBe(1_500);
  });

  it('includes employer contributions in the employer cost, not in deductions', () => {
    const draft = buildPayslip({ ...base, pvdEmployerRate: 5 });

    expect(draft.employerCost.toNumber()).toBe(30_000 + 750 + 1_500);
    expect(draft.netPay.toNumber()).toBeLessThan(30_000);
  });

  it('taxes a bonus without annualising it', () => {
    const withBonus = buildPayslip({
      ...base,
      oneTimeIncome: [{ code: 'BONUS', name: 'โบนัส', amount: 60_000 }],
    });
    const withoutBonus = buildPayslip(base);

    expect(withBonus.grossEarnings.toNumber()).toBe(90_000);
    expect(withBonus.withholdingTax.greaterThan(withoutBonus.withholdingTax)).toBe(true);
    // The bonus must not push the projection to 90,000 × 12.
    expect(lineFor(withBonus, 'WHT')?.meta).toMatchObject({ projectedAnnualIncome: 420_000 });
  });

  it('caps the social-security base at the statutory ceiling for high earners', () => {
    const draft = buildPayslip({ ...base, baseSalary: 200_000 });

    expect(draft.ssoEmployee.toNumber()).toBe(750);
  });

  it('produces no negative net pay line ordering surprises', () => {
    const draft = buildPayslip({
      ...base,
      benefitDeductions: [{ code: 'HEALTH', name: 'ประกันสุขภาพ', amount: 500 }],
    });

    const orders = draft.lines.map((l) => l.orderIndex);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe('year-to-date handling', () => {
  it('projects the year from YTD income, not from this month alone', () => {
    // September run with 8 months of income already earned this year.
    const midYear = buildPayslip({
      ...base,
      monthNumber: 9,
      ytdTaxableIncome: 360_000, // 8 × 45,000
      ytdWithheldTax: 8_000,
      baseSalary: 45_000,
    });

    // 360,000 already + 45,000 × 4 remaining months = 540,000
    expect(lineFor(midYear, 'WHT')?.meta).toMatchObject({ projectedAnnualIncome: 540_000 });
    expect(midYear.withholdingTax.greaterThan(0)).toBe(true);
  });

  it('under-withholds nothing when YTD is unknown but the month is early', () => {
    const january = buildPayslip({ ...base, monthNumber: 1, baseSalary: 45_000 });
    expect(lineFor(january, 'WHT')?.meta).toMatchObject({ projectedAnnualIncome: 540_000 });
  });

  it('stops social security once the annual ceiling is reached', () => {
    const draft = buildPayslip({ ...base, ytdSsoEmployee: 9_000 });
    expect(draft.ssoEmployee.toNumber()).toBe(0);
  });
});
