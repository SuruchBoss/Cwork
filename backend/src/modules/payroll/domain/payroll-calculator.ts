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

export interface PayslipInput {
  /** Monthly base salary from the effective-dated compensation record. */
  baseSalary: number | Decimal;
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
}

export function buildPayslip(input: PayslipInput): PayslipDraft {
  const rules = input.taxRules ?? THAI_TAX_RULES_2026;
  const baseSalary = new Decimal(input.baseSalary.toString());
  const lines: PayslipLine[] = [];

  // ---- Earnings -----------------------------------------------------------

  // Pro-rate salary when the employee did not work the full period (joined or
  // left mid-month, or took unpaid leave).
  const proratedSalary =
    input.workingDaysInPeriod > 0 && input.payableDays < input.workingDaysInPeriod
      ? round2(baseSalary.times(input.payableDays).dividedBy(input.workingDaysInPeriod))
      : round2(baseSalary);

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

  const hourlyRate = deriveHourlyRate(baseSalary, input.standardWorkHoursPerDay ?? 8);
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
      item.isProratable &&
      input.workingDaysInPeriod > 0 &&
      input.payableDays < input.workingDaysInPeriod
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
    ? computeSocialSecurity(ssoBase, rules, input.ytdSsoEmployee)
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

  const withholding = computeMonthlyWithholding({
    monthlyTaxableIncome: recurringTaxable,
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
        Math.min(rules.socialSecurityCap, sso.employeeContribution.times(12).toNumber()),
      providentFundContribution:
        (input.taxAllowances.providentFundContribution ?? 0) || pvdEmployee.times(12).toNumber(),
    },
    rules,
  });

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

  if (input.unpaidLeaveDays > 0 && input.workingDaysInPeriod > 0) {
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
  };
}

function sumLines(lines: PayslipLine[], type: PayComponentType): Decimal {
  return round2(
    lines.filter((l) => l.type === type).reduce((acc, l) => acc.plus(l.amount), new Decimal(0)),
  );
}
