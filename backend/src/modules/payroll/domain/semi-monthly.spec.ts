// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { AttendanceStatus } from '@prisma/client';
import { buildPayslip, type FirstHalfPaid, type PayslipInput } from './payroll-calculator';
import {
  countDaysPaid,
  dailyWageOvertime,
  minimumWageWarnings,
  type DailyWageDay,
} from './daily-wage';
import { computeSocialSecurity, THAI_TAX_RULES_2026 } from './thai-tax';

/**
 * Daily wages paid in two halves (CW-069). The figures are worked by hand; the
 * comments show the working. None of them come from the pilot's Excel file,
 * which has not arrived yet.
 */

const { rate, maxMonthlyWage } = THAI_TAX_RULES_2026.socialSecurity;

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

/** The first half as the second half reads it back from its payslip. */
const paid = (slip: ReturnType<typeof buildPayslip>): FirstHalfPaid => ({
  taxableIncome: slip.taxableIncome.toNumber(),
  withholdingTax: slip.withholdingTax.toNumber(),
  ssoEmployee: slip.ssoEmployee.toNumber(),
  ssoWage: slip.ssoWage.toNumber(),
  pvdEmployee: slip.pvdEmployee.toNumber(),
});

/** Both halves of a month, the second built on the first. */
function month(first: PayslipInput, second: PayslipInput) {
  const h1 = buildPayslip({ ...first, half: { half: 1 } });
  const h2 = buildPayslip({ ...second, half: { half: 2, firstHalf: paid(h1) } });
  return { h1, h2 };
}

describe('A daily wage', () => {
  it('pays the rate for each day paid, and overtime at the day over its hours', () => {
    const slip = buildPayslip({
      ...daily(400, 13),
      overtime: [{ type: 'NORMAL_DAY', hours: 2, multiplier: 1.5 }],
    });

    const base = slip.lines.find((l) => l.code === 'BASE')!;
    expect(base.name).toBe('ค่าจ้างรายวัน');
    expect(base.quantity?.toNumber()).toBe(13);
    expect(base.rate?.toNumber()).toBe(400);
    expect(base.amount.toNumber()).toBe(5_200); // 400 × 13
    // 400 ÷ 8 hours = 50 an hour; 2 hours × 1.5 × 50 = 150.
    expect(slip.lines.find((l) => l.code === 'OT_NORMAL_DAY')?.amount.toNumber()).toBe(150);
    expect(slip.grossEarnings.toNumber()).toBe(5_350);
  });
});

describe('Social security across two halves (PO decision Q5)', () => {
  it('takes 5% of a first half under 1,650 with no floor, and the rest of the month in the second', () => {
    // H1 400 × 3 = 1,200 → 60. Month 1,200 + 4,000 = 5,200 → 260, so H2 = 200.
    const { h1, h2 } = month(daily(400, 3), daily(400, 10));

    expect(h1.ssoEmployee.toNumber()).toBe(60);
    expect(h2.ssoEmployee.toNumber()).toBe(200);
    expect(h1.ssoEmployee.plus(h2.ssoEmployee).toNumber()).toBe(
      computeSocialSecurity(5_200).employeeContribution.toNumber(),
    );
    expect(h2.ssoEmployer.toNumber()).toBe(200);
  });

  // The boundary cases take the ceiling from the rule set rather than writing
  // it down, so a change of rates is a change of data (CW-075).
  const ceiling = maxMonthlyWage * rate;
  /** A daily rate that makes 13 days 65% of the monthly ceiling, 26 days 130%. */
  const underHalf = maxMonthlyWage / 20;

  it('applies the monthly ceiling once, to the whole month', () => {
    // H1 is 65% of the ceiling wage and pays 5% of it in full. The month, 130%,
    // is over the ceiling, so it contributes the ceiling's 5% and H2 takes the
    // rest of that.
    const firstHalf = maxMonthlyWage * 0.65 * rate;
    const { h1, h2 } = month(daily(underHalf, 13), daily(underHalf, 13));

    expect(h1.ssoEmployee.toNumber()).toBe(firstHalf);
    expect(h2.ssoEmployee.toNumber()).toBe(ceiling - firstHalf);
    expect(h1.ssoEmployee.plus(h2.ssoEmployee).toNumber()).toBe(ceiling);
    expect(h2.warnings).toEqual([]);
  });

  it('takes nothing more in the second half when the first already reached the ceiling', () => {
    // 13 days at a tenth of the ceiling wage is 130% of it, in the first half alone.
    const { h1, h2 } = month(daily(maxMonthlyWage / 10, 13), daily(maxMonthlyWage / 10, 1));

    expect(h1.ssoEmployee.toNumber()).toBe(ceiling);
    expect(h2.ssoEmployee.toNumber()).toBe(0);
  });

  it('never goes negative, and shows HR what the first half took over the month', () => {
    // H1 400 × 2 = 800 → 40 (no floor). The month, 800 + 400 = 1,200, is under
    // the 1,650 floor and contributes nothing, so H1 took 40 too much.
    const { h1, h2 } = month(daily(400, 2), daily(400, 1));

    expect(h1.ssoEmployee.toNumber()).toBe(40);
    expect(h2.ssoEmployee.toNumber()).toBe(0);
    expect(h2.warnings).toContainEqual({ code: 'SSO_OVER_IN_FIRST_HALF', params: { amount: 40 } });
  });
});

describe('Withholding across two halves (PO decision Q4)', () => {
  // 2,000 a day × 13 days = 26,000 a half, 52,000 a month, 624,000 a year.
  // Expenses 100,000 (capped), personal 60,000, social security 875 × 12 =
  // 10,500 (the 2026 relief): net 453,500. Tax: 150,000 × 5% + 153,500 × 10%
  // = 7,500 + 15,350 = 22,850. January has twelve months left: 22,850 ÷ 12 =
  // 1,904.17 for the month.
  it('withholds half the estimated month in the first half, and the rest in the second', () => {
    const { h1, h2 } = month(daily(2_000, 13), daily(2_000, 13));

    expect(h1.withholdingTax.toNumber()).toBe(952.09); // 1,904.17 ÷ 2, half up
    expect(h2.withholdingTax.toNumber()).toBe(952.08); // 1,904.17 − 952.09
    expect(h1.withholdingTax.plus(h2.withholdingTax).toNumber()).toBe(
      buildPayslip({ ...daily(2_000, 26) }).withholdingTax.toNumber(),
    );
  });

  it('builds on the months before, not on the first half twice', () => {
    // November, ten months of 52,000 paid and 19,166.70 withheld so far:
    // projected 520,000 + 52,000 × 2 = 624,000 → 22,850; outstanding
    // 22,850 − 19,166.70 = 3,683.30 over two months = 1,841.65.
    const november = { monthNumber: 11, ytdTaxableIncome: 520_000, ytdWithheldTax: 19_166.7 };
    const { h1, h2 } = month(
      { ...daily(2_000, 13), ...november },
      { ...daily(2_000, 13), ...november },
    );

    expect(h1.withholdingTax.toNumber()).toBe(920.83); // 1,841.65 ÷ 2, half up
    expect(h2.withholdingTax.toNumber()).toBe(920.82);
  });

  it('withholds nothing in a second half that would go negative, and shows the difference', () => {
    // H1 estimates 52,000 a month and withholds 952.09. The month turns out to
    // be 26,000 + 2,000 = 28,000: 336,000 a year, net 336,000 − 100,000 −
    // 60,000 − 10,500 = 165,500, tax 15,500 × 5% = 775, 64.58 for the month.
    const { h1, h2 } = month(daily(2_000, 13), daily(2_000, 1));

    expect(h1.withholdingTax.toNumber()).toBe(952.09);
    expect(h2.withholdingTax.toNumber()).toBe(0);
    expect(h2.warnings).toContainEqual({
      code: 'WITHHOLDING_OVER_IN_FIRST_HALF',
      params: { amount: 887.51 }, // 952.09 − 64.58
    });
    expect(h2.netPay.toNumber()).toBe(h2.grossEarnings.minus(h2.totalDeductions).toNumber());
  });
});

describe('The days a daily-wage employee is paid for (PO decision Q3)', () => {
  const day = (date: string, overrides: Partial<DailyWageDay>): DailyWageDay => ({
    date,
    scheduled: true,
    paidHoliday: false,
    attendance: AttendanceStatus.PRESENT,
    paidLeave: 0,
    unpaidLeave: 0,
    ...overrides,
  });

  it('pays days worked, paid leave by its portion, and holidays on working days', () => {
    const result = countDaysPaid([
      day('2026-11-02', {}),
      day('2026-11-03', { attendance: AttendanceStatus.LATE }),
      day('2026-11-04', { attendance: AttendanceStatus.EARLY_LEAVE }),
      day('2026-11-05', { attendance: AttendanceStatus.ON_LEAVE, paidLeave: 1 }),
      day('2026-11-06', { attendance: null, paidLeave: 0.5 }),
      day('2026-11-07', { scheduled: false, attendance: AttendanceStatus.DAY_OFF }),
      day('2026-11-09', { attendance: AttendanceStatus.ABSENT }),
      day('2026-11-10', { attendance: AttendanceStatus.HOLIDAY, paidHoliday: true }),
      day('2026-11-11', { unpaidLeave: 0.5 }), // worked the other half
    ]);

    // Worked 3 + 0.5, paid leave 1 + 0.5, one holiday.
    expect(result).toMatchObject({ worked: 3.5, paidLeave: 1.5, holidays: 1, days: 6 });
    expect(result.warnings).toEqual([]);
  });

  it('counts an incomplete punch as worked and says so', () => {
    const result = countDaysPaid([
      day('2026-11-02', { attendance: AttendanceStatus.INCOMPLETE }),
      day('2026-11-03', {}),
    ]);

    expect(result.days).toBe(2);
    expect(result.warnings).toEqual([
      { code: 'INCOMPLETE_PUNCH_COUNTED', params: { days: 1, dates: '2026-11-02' } },
    ]);
  });

  it('does not pay a scheduled day with no record, and says so', () => {
    const result = countDaysPaid([day('2026-11-02', { attendance: null })]);

    expect(result.days).toBe(0);
    expect(result.warnings).toEqual([
      { code: 'NO_ATTENDANCE_RECORD', params: { days: 1, dates: '2026-11-02' } },
    ]);
  });

  it('pays a holiday on the weekly day off on its substitute day, and lists it for HR (CW-076)', () => {
    const result = countDaysPaid([
      // Saturday 5 December, Father's Day, is paid on Monday the 7th.
      day('2026-12-05', {
        scheduled: false,
        paidHoliday: true,
        attendance: null,
        substitutedOn: '2026-12-07',
      }),
      day('2026-12-06', { scheduled: false, attendance: AttendanceStatus.DAY_OFF }),
      day('2026-12-07', { attendance: AttendanceStatus.ABSENT, substituteFor: '2026-12-05' }),
      day('2026-12-08', {}),
    ]);

    expect(result).toMatchObject({ worked: 1, holidays: 1, days: 2 });
    expect(result.warnings).toEqual([
      { code: 'SUBSTITUTE_HOLIDAY', params: { days: 1, dates: '2026-12-05 → 2026-12-07' } },
    ]);
  });

  it('pays a substitute day once, whatever attendance says (CW-081: work on it is holiday overtime)', () => {
    const result = countDaysPaid([
      day('2026-12-07', { attendance: AttendanceStatus.HOLIDAY, substituteFor: '2026-12-05' }),
    ]);

    expect(result).toMatchObject({ worked: 0, holidays: 1, days: 1 });
    expect(result.warnings.map((w) => w.code)).toEqual(['SUBSTITUTE_HOLIDAY']);
  });

  it('flags a holiday on the weekly day off whose substitute comes after the employee leaves', () => {
    const result = countDaysPaid([
      day('2026-12-05', { scheduled: false, paidHoliday: true, attendance: null }),
    ]);

    expect(result.days).toBe(0);
    expect(result.warnings).toEqual([
      { code: 'HOLIDAY_ON_DAY_OFF', params: { days: 1, dates: '2026-12-05' } },
    ]);
  });
});

describe('Rest-day work by a daily-wage employee (section 62, CW-076)', () => {
  it('pays four hours on the weekly day off at twice the hourly rate, and says it was raised', () => {
    const { lines, warnings } = dailyWageOvertime([
      { type: 'DAY_OFF', hours: 4, multiplier: 1 },
      { type: 'HOLIDAY', hours: 4, multiplier: 2 },
      { type: 'NORMAL_DAY', hours: 2, multiplier: 1.5 },
    ]);

    expect(lines.map((l) => l.multiplier)).toEqual([2, 2, 1.5]);
    expect(warnings).toEqual([
      { code: 'REST_DAY_RATE_RAISED', params: { hours: 4, rates: 'DAY_OFF 1x → 2x' } },
    ]);

    // 500 a day over 8 hours is 62.50 an hour: four hours at 2× is 500, at 1×
    // the overtime request's own rate it would have been 250.
    const slip = buildPayslip({ ...daily(500, 10), overtime: lines.slice(0, 2) });
    const ot = slip.lines.filter((l) => l.code.startsWith('OT_'));
    expect(ot.map((l) => [l.code, l.amount.toNumber()])).toEqual([
      ['OT_DAY_OFF', 500],
      ['OT_HOLIDAY', 500],
    ]);
  });

  it('pays work on a traditional holiday at least once more, and leaves a higher rate alone', () => {
    const { lines, warnings } = dailyWageOvertime([
      { type: 'HOLIDAY', hours: 4, multiplier: 0.5 },
      { type: 'DAY_OFF', hours: 4, multiplier: 2.5 },
    ]);
    expect(lines.map((l) => l.multiplier)).toEqual([1, 2.5]);
    expect(warnings).toEqual([
      { code: 'REST_DAY_RATE_RAISED', params: { hours: 4, rates: 'HOLIDAY 0.5x → 1x' } },
    ]);
  });
});

describe('The minimum wage check (PO decision Q7)', () => {
  const location = {
    name: 'โรงงานบางนา',
    minimumDailyWage: 400,
    minimumDailyWageSource: 'ฉบับที่ 14',
  };

  it('passes a rate at or above the location minimum', () => {
    expect(minimumWageWarnings(400, location)).toEqual([]);
  });

  it('warns about a rate under it, naming the announcement', () => {
    expect(minimumWageWarnings(399.5, location)).toEqual([
      {
        code: 'BELOW_MINIMUM_WAGE',
        params: { dailyRate: 399.5, minimum: 400, location: 'โรงงานบางนา', source: 'ฉบับที่ 14' },
      },
    ]);
  });

  it('says so when there is nothing to compare with', () => {
    expect(minimumWageWarnings(400, { ...location, minimumDailyWage: null })).toEqual([
      { code: 'MINIMUM_WAGE_NOT_SET', params: { location: 'โรงงานบางนา' } },
    ]);
    expect(minimumWageWarnings(400, null)).toEqual([{ code: 'NO_WORK_LOCATION' }]);
  });
});
