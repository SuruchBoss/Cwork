// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { PayComponentType } from '@prisma/client';
import { Decimal, round2 } from '../../../core/utils/money.util';
import {
  computeMonthlyWithholding,
  computeOvertimePay,
  computeSocialSecurity,
  deriveHourlyRate,
  THAI_TAX_RULES_2026,
  type TaxAllowanceInput,
  type TaxRuleSet,
} from './thai-tax';
import type { PayslipWarning } from './daily-wage';

/**
 * Builds one payslip. Pure: every input is passed in, nothing is read from the
 * database, so a payslip can be recomputed identically months later from the
 * snapshot stored on the record.
 */

export interface PayslipLine {
  code: string;
  name: string;
  type: PayComponentType;
  quantity?: Decimal;
  rate?: Decimal;
  amount: Decimal;
  isTaxable: boolean;
  orderIndex: number;
  meta?: Record<string, unknown>;
}

export interface OvertimeLine {
  type: string;
  hours: number;
  multiplier: number;
}

export interface RecurringLine {
  code: string;
  name: string;
  type: PayComponentType;
  amount: number;
  isTaxable: boolean;
  includeInSsoBase: boolean;
  isProratable: boolean;
  orderIndex: number;
}

/** What the first half of a semi-monthly month paid, as the second half reads it. */
export interface FirstHalfPaid {
  taxableIncome: number;
  withholdingTax: number;
  ssoEmployee: number;
  /** The first half's social-security wage, before the ceiling. */
  ssoWage: number;
  pvdEmployee: number;
}

/**
 * Which half of a semi-monthly month a payslip pays (CW-069). With either, the
 * `ytd*` figures are the months before this one, without the first half.
 */
export type MonthHalf = { half: 1 } | { half: 2; firstHalf: FirstHalfPaid };

export interface PayslipInput {
  /** Monthly base salary from the effective-dated compensation record. */
  baseSalary: number | Decimal;
  /**
   * A daily wage (CW-069): the rate times the days paid in the period. Never
   * prorated, because the days already are the proration.
   */
  dailyWage?: { rate: number; daysPaid: number };
  half?: MonthHalf;
  currency: string;
  /** Working days in the payroll period (excludes weekends and holidays). */
  workingDaysInPeriod: number;
  /** Days actually payable (attendance + paid leave). */
  payableDays: number;
  /** Unpaid leave days deducted from salary. */
  unpaidLeaveDays: number;
  overtime: OvertimeLine[];
  recurring: RecurringLine[];
  /** Approved expense reimbursements paid through payroll (never taxable). */
  reimbursements: Array<{ code: string; name: string; amount: number }>;
  /** Employee-paid benefit premiums deducted from net pay. */
  benefitDeductions: Array<{ code: string; name: string; amount: number }>;
  employerBenefitCosts: Array<{ code: string; name: string; amount: number }>;
  isSsoEligible: boolean;
  pvdEmployeeRate: number;
  pvdEmployerRate: number;
  /** 1–12 in the payroll year. */
  monthNumber: number;
  ytdTaxableIncome: number;
  ytdWithheldTax: number;
  ytdSsoEmployee: number;
  taxAllowances: TaxAllowanceInput;
  /** Non-recurring taxable income such as a bonus. */
  oneTimeIncome?: Array<{ code: string; name: string; amount: number }>;
  standardWorkHoursPerDay?: number;
  taxRules?: TaxRuleSet;
}

export interface PayslipDraft {
  lines: PayslipLine[];
  baseSalary: Decimal;
  grossEarnings: Decimal;
  taxableIncome: Decimal;
  totalDeductions: Decimal;
  netPay: Decimal;
  withholdingTax: Decimal;
  ssoEmployee: Decimal;
  ssoEmployer: Decimal;
  pvdEmployee: Decimal;
  pvdEmployer: Decimal;
  employerCost: Decimal;
  overtimeHours: Decimal;
  /** What HR should check, such as a first half that withheld more than the month. */
  warnings: PayslipWarning[];
  /** The social-security wage before the ceiling, which a second half adds to. */
  ssoWage: Decimal;
}

export function buildPayslip(input: PayslipInput): PayslipDraft {
  const rules = input.taxRules ?? THAI_TAX_RULES_2026;
  const baseSalary = new Decimal(input.baseSalary.toString());
  const lines: PayslipLine[] = [];

  // ---- Earnings -----------------------------------------------------------

  const daily = input.dailyWage;
  const warnings: PayslipWarning[] = [];
  // Pro-rate salary when the employee did not work the full period (joined or
  // left mid-month, or took unpaid leave). A daily wage is paid by the day.
  const prorates =
    !daily && input.workingDaysInPeriod > 0 && input.payableDays < input.workingDaysInPeriod;
  const proratedSalary = daily
    ? round2(new Decimal(daily.rate).times(daily.daysPaid))
    : prorates
      ? round2(baseSalary.times(input.payableDays).dividedBy(input.workingDaysInPeriod))
      : round2(baseSalary);

  if (daily) {
    lines.push({
      code: 'BASE',
      name: 'ค่าจ้างรายวัน',
      type: PayComponentType.EARNING,
      quantity: new Decimal(daily.daysPaid),
      rate: new Decimal(daily.rate),
      amount: proratedSalary,
      isTaxable: true,
      orderIndex: 0,
      meta: { dailyRate: daily.rate, daysPaid: daily.daysPaid },
    });
  } else {
    lines.push({
      code: 'BASE',
      name: 'เงินเดือน',
      type: PayComponentType.EARNING,
      amount: proratedSalary,
      isTaxable: true,
      orderIndex: 0,
      meta: proratedSalary.equals(baseSalary)
        ? undefined
        : {
            proratedFrom: baseSalary.toNumber(),
            payableDays: input.payableDays,
            workingDays: input.workingDaysInPeriod,
          },
    });
  }

  // A daily-wage employee's hour is the day's wage over the hours of a day; a
  // salaried one's is the month over thirty days, then the hours (see
  // docs/payroll-thailand.md, "Daily wages").
  const hourlyRate = daily
    ? new Decimal(daily.rate).dividedBy(input.standardWorkHoursPerDay ?? 8).toDecimalPlaces(4)
    : deriveHourlyRate(baseSalary, input.standardWorkHoursPerDay ?? 8);
  let overtimeHours = new Decimal(0);

  for (const ot of input.overtime) {
    if (ot.hours <= 0) continue;
    const amount = computeOvertimePay(hourlyRate, ot.hours, ot.multiplier);
    overtimeHours = overtimeHours.plus(ot.hours);
    lines.push({
      code: `OT_${ot.type}`,
      name: `ค่าล่วงเวลา (${ot.multiplier}x)`,
      type: PayComponentType.EARNING,
      quantity: new Decimal(ot.hours),
      rate: round2(hourlyRate.times(ot.multiplier)),
      amount,
      isTaxable: true,
      orderIndex: 10,
      meta: { overtimeType: ot.type, multiplier: ot.multiplier },
    });
  }

  for (const item of input.recurring.filter((r) => r.type === PayComponentType.EARNING)) {
    const amount =
      item.isProratable && prorates
        ? round2(
            new Decimal(item.amount).times(input.payableDays).dividedBy(input.workingDaysInPeriod),
          )
        : round2(item.amount);

    lines.push({
      code: item.code,
      name: item.name,
      type: PayComponentType.EARNING,
      amount,
      isTaxable: item.isTaxable,
      orderIndex: 20 + item.orderIndex,
    });
  }

  for (const bonus of input.oneTimeIncome ?? []) {
    lines.push({
      code: bonus.code,
      name: bonus.name,
      type: PayComponentType.EARNING,
      amount: round2(bonus.amount),
      isTaxable: true,
      orderIndex: 30,
      meta: { oneTime: true },
    });
  }

  // Reimbursements are a repayment of the employee's own money, so they are
  // paid gross but never enter the tax or social-security base.
  for (const claim of input.reimbursements) {
    lines.push({
      code: claim.code,
      name: claim.name,
      type: PayComponentType.EARNING,
      amount: round2(claim.amount),
      isTaxable: false,
      orderIndex: 40,
      meta: { reimbursement: true },
    });
  }

  const grossEarnings = sumLines(lines, PayComponentType.EARNING);
  const taxableEarnings = sumLines(
    lines.filter((l) => l.isTaxable),
    PayComponentType.EARNING,
  );

  // ---- Statutory deductions ----------------------------------------------

  // The SSO base is capped contractual wage, not total earnings.
  const ssoBase = input.recurring
    .filter((r) => r.type === PayComponentType.EARNING && r.includeInSsoBase)
    .reduce((acc, r) => acc.plus(r.amount), proratedSalary);

  const sso = input.isSsoEligible
    ? socialSecurityFor(ssoBase, input, rules, warnings)
    : {
        employeeContribution: new Decimal(0),
        employerContribution: new Decimal(0),
        contributoryWage: new Decimal(0),
      };

  if (sso.employeeContribution.greaterThan(0)) {
    lines.push({
      code: 'SSO',
      name: 'ประกันสังคม',
      type: PayComponentType.DEDUCTION,
      amount: sso.employeeContribution,
      isTaxable: false,
      orderIndex: 100,
      meta: { contributoryWage: sso.contributoryWage.toNumber() },
    });
  }

  const pvdEmployee = round2(proratedSalary.times(input.pvdEmployeeRate).dividedBy(100));
  const pvdEmployer = round2(proratedSalary.times(input.pvdEmployerRate).dividedBy(100));

  if (pvdEmployee.greaterThan(0)) {
    lines.push({
      code: 'PVD',
      name: 'กองทุนสำรองเลี้ยงชีพ',
      type: PayComponentType.DEDUCTION,
      rate: new Decimal(input.pvdEmployeeRate),
      amount: pvdEmployee,
      isTaxable: false,
      orderIndex: 110,
    });
  }

  // Withholding uses this month's *recurring* taxable pay to project the year,
  // with bonuses added once rather than annualised.
  const oneTimeTaxable = (input.oneTimeIncome ?? []).reduce(
    (acc, b) => acc.plus(b.amount),
    new Decimal(0),
  );
  const recurringTaxable = taxableEarnings.minus(oneTimeTaxable);

  // The month this payslip's withholding is worked out on. A whole month is
  // itself. A first half estimates the month as twice the half; a second half
  // is the two halves together (PO decision Q4).
  const half = input.half;
  const monthOf = (thisSlip: Decimal, firstHalf: number) =>
    !half ? thisSlip : half.half === 1 ? thisSlip.times(2) : thisSlip.plus(firstHalf);
  const firstHalf = half?.half === 2 ? half.firstHalf : null;

  const forTheMonth = computeMonthlyWithholding({
    monthlyTaxableIncome: monthOf(recurringTaxable, firstHalf?.taxableIncome ?? 0),
    ytdTaxableIncome: input.ytdTaxableIncome,
    ytdWithheld: input.ytdWithheldTax,
    monthNumber: input.monthNumber,
    oneTimeIncome: oneTimeTaxable,
    allowances: {
      ...input.taxAllowances,
      // Contributions made through payroll are relief, so feed the projected
      // annual figures back into the allowance calculation.
      socialSecurityContribution:
        (input.taxAllowances.socialSecurityContribution ?? 0) ||
        Math.min(
          rules.socialSecurityCap,
          monthOf(sso.employeeContribution, firstHalf?.ssoEmployee ?? 0)
            .times(12)
            .toNumber(),
        ),
      providentFundContribution:
        (input.taxAllowances.providentFundContribution ?? 0) ||
        monthOf(pvdEmployee, firstHalf?.pvdEmployee ?? 0)
          .times(12)
          .toNumber(),
    },
    rules,
  });

  // A first half withholds half the month's estimate. A second half withholds
  // the month less what the first half took, and never less than nothing: if
  // the first half took more, the difference is shown to HR, not refunded here.
  let withholdingThisSlip = forTheMonth.withholdingThisMonth;
  if (half?.half === 1) {
    withholdingThisSlip = round2(withholdingThisSlip.dividedBy(2));
  } else if (firstHalf) {
    const rest = withholdingThisSlip.minus(firstHalf.withholdingTax);
    if (rest.lessThan(0)) {
      warnings.push({
        code: 'WITHHOLDING_OVER_IN_FIRST_HALF',
        params: { amount: round2(rest.negated()).toNumber() },
      });
    }
    withholdingThisSlip = round2(Decimal.max(0, rest));
  }
  const withholding = { ...forTheMonth, withholdingThisMonth: withholdingThisSlip };

  if (withholding.withholdingThisMonth.greaterThan(0)) {
    lines.push({
      code: 'WHT',
      name: 'ภาษีหัก ณ ที่จ่าย',
      type: PayComponentType.DEDUCTION,
      amount: withholding.withholdingThisMonth,
      isTaxable: false,
      orderIndex: 120,
      meta: {
        projectedAnnualIncome: withholding.projectedAnnualIncome.toNumber(),
        projectedAnnualTax: withholding.projectedAnnualTax.toNumber(),
        ...(half
          ? { half: half.half, monthWithholding: forTheMonth.withholdingThisMonth.toNumber() }
          : {}),
      },
    });
  }

  // ---- Other deductions ---------------------------------------------------

  for (const item of input.recurring.filter((r) => r.type === PayComponentType.DEDUCTION)) {
    lines.push({
      code: item.code,
      name: item.name,
      type: PayComponentType.DEDUCTION,
      amount: round2(item.amount),
      isTaxable: false,
      orderIndex: 130 + item.orderIndex,
    });
  }

  for (const benefit of input.benefitDeductions) {
    lines.push({
      code: benefit.code,
      name: benefit.name,
      type: PayComponentType.DEDUCTION,
      amount: round2(benefit.amount),
      isTaxable: false,
      orderIndex: 150,
    });
  }

  if (!daily && input.unpaidLeaveDays > 0 && input.workingDaysInPeriod > 0) {
    // Already reflected in the prorated salary; recorded for transparency.
    lines.push({
      code: 'UNPAID_LEAVE',
      name: 'หักลาไม่รับค่าจ้าง',
      type: PayComponentType.INFORMATIONAL,
      quantity: new Decimal(input.unpaidLeaveDays),
      amount: round2(baseSalary.times(input.unpaidLeaveDays).dividedBy(input.workingDaysInPeriod)),
      isTaxable: false,
      orderIndex: 160,
    });
  }

  // ---- Employer costs -----------------------------------------------------

  if (sso.employerContribution.greaterThan(0)) {
    lines.push({
      code: 'SSO_ER',
      name: 'ประกันสังคม (นายจ้าง)',
      type: PayComponentType.EMPLOYER_CONTRIBUTION,
      amount: sso.employerContribution,
      isTaxable: false,
      orderIndex: 200,
    });
  }
  if (pvdEmployer.greaterThan(0)) {
    lines.push({
      code: 'PVD_ER',
      name: 'กองทุนสำรองเลี้ยงชีพ (นายจ้าง)',
      type: PayComponentType.EMPLOYER_CONTRIBUTION,
      rate: new Decimal(input.pvdEmployerRate),
      amount: pvdEmployer,
      isTaxable: false,
      orderIndex: 210,
    });
  }
  for (const cost of input.employerBenefitCosts) {
    lines.push({
      code: cost.code,
      name: cost.name,
      type: PayComponentType.EMPLOYER_CONTRIBUTION,
      amount: round2(cost.amount),
      isTaxable: false,
      orderIndex: 220,
    });
  }

  const totalDeductions = sumLines(lines, PayComponentType.DEDUCTION);
  const employerContributions = sumLines(lines, PayComponentType.EMPLOYER_CONTRIBUTION);
  const netPay = round2(grossEarnings.minus(totalDeductions));

  return {
    lines: lines.sort((a, b) => a.orderIndex - b.orderIndex),
    baseSalary: round2(baseSalary),
    grossEarnings,
    taxableIncome: taxableEarnings,
    totalDeductions,
    netPay,
    withholdingTax: withholding.withholdingThisMonth,
    ssoEmployee: sso.employeeContribution,
    ssoEmployer: sso.employerContribution,
    pvdEmployee,
    pvdEmployer,
    employerCost: round2(grossEarnings.plus(employerContributions)),
    overtimeHours: round2(overtimeHours),
    warnings,
    ssoWage: round2(ssoBase),
  };
}

/**
 * Social security for this payslip (PO decision Q5).
 *
 * A whole month is the usual monthly contribution. A first half is 5% of its
 * own wage up to the ceiling, with no floor: the floor is a monthly figure and
 * half a month under it may still be a month over it. A second half is the
 * whole month's contribution, with the floor and the ceiling applied once,
 * less the first half, so the two halves always add up to what a monthly run
 * would have deducted. It is never negative; a first half that took more than
 * the month (a month that ended under the floor) is shown to HR.
 */
function socialSecurityFor(
  ssoBase: Decimal,
  input: PayslipInput,
  rules: TaxRuleSet,
  warnings: PayslipWarning[],
) {
  const half = input.half;
  if (!half) return computeSocialSecurity(ssoBase, rules, input.ytdSsoEmployee);

  if (half.half === 1) {
    const { rate, maxMonthlyWage } = rules.socialSecurity;
    const contributoryWage = Decimal.min(ssoBase, maxMonthlyWage);
    const room = Decimal.max(0, new Decimal(rules.socialSecurityCap).minus(input.ytdSsoEmployee));
    const contribution = round2(Decimal.min(contributoryWage.times(rate), room));
    return {
      contributoryWage: round2(contributoryWage),
      employeeContribution: contribution,
      employerContribution: contribution,
    };
  }

  const month = computeSocialSecurity(
    ssoBase.plus(half.firstHalf.ssoWage),
    rules,
    input.ytdSsoEmployee,
  );
  const rest = month.employeeContribution.minus(half.firstHalf.ssoEmployee);
  if (rest.lessThan(0)) {
    warnings.push({
      code: 'SSO_OVER_IN_FIRST_HALF',
      params: { amount: round2(rest.negated()).toNumber() },
    });
  }
  const contribution = round2(Decimal.max(0, rest));
  return {
    contributoryWage: month.contributoryWage,
    employeeContribution: contribution,
    employerContribution: contribution,
  };
}

function sumLines(lines: PayslipLine[], type: PayComponentType): Decimal {
  return round2(
    lines.filter((l) => l.type === type).reduce((acc, l) => acc.plus(l.amount), new Decimal(0)),
  );
}
