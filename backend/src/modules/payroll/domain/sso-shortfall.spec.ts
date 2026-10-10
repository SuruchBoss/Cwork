// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { socialSecurityShortfall, type PaidSlip } from './sso-shortfall';
import { computeSocialSecurity, taxRulesFor } from './thai-tax';

/**
 * The social security shortfall of runs paid on the old ceiling (CW-075). The
 * figures come from the rules: a 2026 month paid at the 2025 ceiling against
 * the 2026 one.
 */

const rules = taxRulesFor(2026);
const oldRules = taxRulesFor(2025);
/** What a run paid before the ceiling changed took for a month at this wage. */
const paidOld = (wage: number) =>
  computeSocialSecurity(wage, oldRules).employeeContribution.toNumber();

const slip = (overrides: Partial<PaidSlip>): PaidSlip => ({
  employeeId: 'e-1',
  employeeCode: 'E001',
  name: 'สมชาย ใจดี',
  month: 3,
  ssoWage: 30_000,
  wageRebuilt: false,
  ssoEmployee: paidOld(30_000),
  ssoEmployer: paidOld(30_000),
  ...overrides,
});

describe('The social security shortfall of paid runs', () => {
  it('shows the difference for the employee and the employer on a month over the ceiling', () => {
    const report = socialSecurityShortfall([slip({})], rules);
    const owed = rules.socialSecurity.maxMonthlyWage * rules.socialSecurity.rate;

    expect(report.rows).toEqual([
      expect.objectContaining({
        month: 3,
        wage: 30_000,
        deductedEmployee: paidOld(30_000),
        owed,
        employeeDifference: owed - paidOld(30_000),
        employerDifference: owed - paidOld(30_000),
      }),
    ]);
    // ฿875 against ฿750 in 2026.
    expect(report.total).toEqual({ employee: 125, employer: 125 });
  });

  it('leaves out a month that comes out even, such as one under the old ceiling', () => {
    const under = oldRules.socialSecurity.maxMonthlyWage;
    const report = socialSecurityShortfall(
      [slip({ ssoWage: under, ssoEmployee: paidOld(under), ssoEmployer: paidOld(under) })],
      rules,
    );
    expect(report.rows).toEqual([]);
    expect(report.total).toEqual({ employee: 0, employer: 0 });
  });

  it('adds up two halves of one month before comparing', () => {
    // Each half 9,000: 18,000 for the month, over the new ceiling. Paid on the
    // old rules the halves took 450 and 300 (the month's 750 less the first).
    const report = socialSecurityShortfall(
      [
        slip({ ssoWage: 9_000, ssoEmployee: 450, ssoEmployer: 450 }),
        slip({ ssoWage: 9_000, ssoEmployee: 300, ssoEmployer: 300 }),
      ],
      rules,
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ wage: 18_000, deductedEmployee: 750 });
    expect(report.total.employee).toBe(125);
  });

  it('totals by month and for the year, and marks a rebuilt wage', () => {
    const report = socialSecurityShortfall(
      [
        slip({ month: 1 }),
        slip({ month: 2, wageRebuilt: true }),
        slip({ month: 2, employeeId: 'e-2', employeeCode: 'E002' }),
      ],
      rules,
    );
    expect(report.byMonth).toEqual([
      { month: 1, employee: 125, employer: 125 },
      { month: 2, employee: 250, employer: 250 },
    ]);
    expect(report.total).toEqual({ employee: 375, employer: 375 });
    expect(report.rows.find((r) => r.month === 2 && r.employeeCode === 'E001')).toMatchObject({
      wageRebuilt: true,
    });
  });
});
