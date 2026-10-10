// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { PayComponentType } from '@prisma/client';
import { buildPayslip, type PayslipInput } from './payroll-calculator';
import { THAI_TAX_RULES_2026 } from './thai-tax';

/**
 * Cash advances taken back on the payslip (CW-070). Worked by hand: a daily
 * wage of 400 for 13 days is 5,200 gross; social security is 5% of it, 260,
 * and there is no tax at that income, so net before advances is 4,940.
 */

const { rate } = THAI_TAX_RULES_2026.socialSecurity;

const slip = (advances: PayslipInput['advances'], extra: Partial<PayslipInput> = {}) =>
  buildPayslip({
    baseSalary: 0,
    dailyWage: { rate: 400, daysPaid: 13 },
    half: { half: 1 },
    currency: 'THB',
    workingDaysInPeriod: 0,
    payableDays: 13,
    unpaidLeaveDays: 0,
    overtime: [],
    recurring: [],
    reimbursements: [],
    benefitDeductions: [],
    employerBenefitCosts: [],
    isSsoEligible: true,
    pvdEmployeeRate: 0,
    pvdEmployerRate: 0,
    monthNumber: 11,
    ytdTaxableIncome: 0,
    ytdWithheldTax: 0,
    taxAllowances: {},
    advances,
    ...extra,
  });

const advanceLines = (draft: ReturnType<typeof buildPayslip>) =>
  draft.lines.filter((line) => line.code === 'ADVANCE');

describe('Cash advances on a payslip', () => {
  const sso = 5200 * rate;
  const netBefore = 5200 - sso;

  it('takes back two advances in one period, each on its own line', () => {
    const draft = slip([
      { id: 'a2', paidOn: '2026-11-12', outstanding: 300 },
      { id: 'a1', paidOn: '2026-11-08', outstanding: 500 },
    ]);

    expect(sso).toBe(260);
    const lines = advanceLines(draft);
    expect(lines.map((line) => line.name)).toEqual([
      'หักเงินเบิกล่วงหน้า (8 พ.ย. 2569)',
      'หักเงินเบิกล่วงหน้า (12 พ.ย. 2569)',
    ]);
    expect(lines.every((line) => line.type === PayComponentType.DEDUCTION)).toBe(true);
    expect(lines.every((line) => !line.isTaxable)).toBe(true);
    expect(draft.netPay.toNumber()).toBe(netBefore - 800);
    expect(draft.advanceDeductions.map((d) => [d.advanceId, d.amount.toNumber()])).toEqual([
      ['a1', 500],
      ['a2', 300],
    ]);
    expect(draft.warnings).toEqual([]);
  });

  it('never pushes net pay below zero, and says what is carried', () => {
    // 4,940 left: the older 3,000 is taken whole, the newer 2,500 only 1,940.
    const draft = slip([
      { id: 'a1', paidOn: '2026-11-03', outstanding: 3000 },
      { id: 'a2', paidOn: '2026-11-10', outstanding: 2500 },
    ]);

    expect(draft.netPay.toNumber()).toBe(0);
    expect(draft.advanceDeductions.map((d) => [d.advanceId, d.amount.toNumber()])).toEqual([
      ['a1', 3000],
      ['a2', netBefore - 3000],
    ]);
    expect(draft.warnings).toEqual([
      { code: 'ADVANCE_CARRIED_OVER', params: { amount: 5500 - netBefore } },
    ]);
  });

  it('comes after tax and social security, which are not reduced by it', () => {
    const without = slip([]);
    const withAdvance = slip([{ id: 'a1', paidOn: '2026-11-03', outstanding: 10000 }]);

    expect(withAdvance.ssoEmployee.toNumber()).toBe(without.ssoEmployee.toNumber());
    expect(withAdvance.withholdingTax.toNumber()).toBe(without.withholdingTax.toNumber());
    expect(withAdvance.taxableIncome.toNumber()).toBe(without.taxableIncome.toNumber());
    expect(withAdvance.grossEarnings.toNumber()).toBe(without.grossEarnings.toNumber());
  });

  it('takes nothing when other deductions already leave nothing, and carries it all', () => {
    const draft = slip([{ id: 'a1', paidOn: '2026-11-03', outstanding: 200 }], {
      benefitDeductions: [{ code: 'BEN_X', name: 'Plan', amount: 6000 }],
    });

    expect(advanceLines(draft)).toEqual([]);
    expect(draft.advanceDeductions).toEqual([]);
    expect(draft.warnings).toContainEqual({
      code: 'ADVANCE_CARRIED_OVER',
      params: { amount: 200 },
    });
  });
});
