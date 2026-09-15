import { DayPortion, LeaveAccrualMethod } from '@prisma/client';
import { toDateOnly } from '../../../core/utils/date.util';
import { Decimal } from '../../../core/utils/money.util';
import {
  availableBalance,
  computeAccruedQuota,
  computeCarryOver,
  computeLeaveDays,
} from './leave-calculator';

const MON_TO_FRI = [1, 2, 3, 4, 5];
const noHolidays = new Set<string>();

describe('computeLeaveDays', () => {
  it('counts a single full day as one day', () => {
    const result = computeLeaveDays({
      startDate: toDateOnly('2026-09-15'), // Tuesday
      endDate: toDateOnly('2026-09-15'),
      startPortion: DayPortion.FULL,
      endPortion: DayPortion.FULL,
      workingWeekdays: MON_TO_FRI,
      holidayDates: noHolidays,
    });

    expect(result.totalDays.toNumber()).toBe(1);
    expect(result.days).toHaveLength(1);
  });

  it('charges half a day for a morning-only request', () => {
    const result = computeLeaveDays({
      startDate: toDateOnly('2026-09-15'),
      endDate: toDateOnly('2026-09-15'),
      startPortion: DayPortion.MORNING,
      endPortion: DayPortion.FULL,
      workingWeekdays: MON_TO_FRI,
      holidayDates: noHolidays,
    });

    expect(result.totalDays.toNumber()).toBe(0.5);
    expect(result.days[0].portion).toBe(DayPortion.MORNING);
  });

  it('excludes the weekend from a Friday-to-Monday request', () => {
    const result = computeLeaveDays({
      startDate: toDateOnly('2026-09-18'), // Friday
      endDate: toDateOnly('2026-09-21'), // Monday
      startPortion: DayPortion.FULL,
      endPortion: DayPortion.FULL,
      workingWeekdays: MON_TO_FRI,
      holidayDates: noHolidays,
    });

    expect(result.totalDays.toNumber()).toBe(2);
    expect(result.days.map((d) => d.date.toISOString().slice(0, 10))).toEqual([
      '2026-09-18',
      '2026-09-21',
    ]);
  });

  it('excludes public holidays inside the range', () => {
    const result = computeLeaveDays({
      startDate: toDateOnly('2026-09-14'), // Monday
      endDate: toDateOnly('2026-09-18'), // Friday
      startPortion: DayPortion.FULL,
      endPortion: DayPortion.FULL,
      workingWeekdays: MON_TO_FRI,
      holidayDates: new Set(['2026-09-16']),
    });

    expect(result.totalDays.toNumber()).toBe(4);
  });

  it('charges 1.5 days when leaving after lunch and returning after lunch', () => {
    const result = computeLeaveDays({
      startDate: toDateOnly('2026-09-15'), // Tue afternoon
      endDate: toDateOnly('2026-09-16'), // Wed morning
      startPortion: DayPortion.AFTERNOON,
      endPortion: DayPortion.MORNING,
      workingWeekdays: MON_TO_FRI,
      holidayDates: noHolidays,
    });

    expect(result.totalDays.toNumber()).toBe(1);
  });

  it('keeps full days in the middle of a long range', () => {
    const result = computeLeaveDays({
      startDate: toDateOnly('2026-09-14'), // Mon afternoon
      endDate: toDateOnly('2026-09-18'), // Fri morning
      startPortion: DayPortion.AFTERNOON,
      endPortion: DayPortion.MORNING,
      workingWeekdays: MON_TO_FRI,
      holidayDates: noHolidays,
    });

    // 0.5 + 1 + 1 + 1 + 0.5
    expect(result.totalDays.toNumber()).toBe(4);
  });

  it('returns nothing when the whole range is non-working', () => {
    const result = computeLeaveDays({
      startDate: toDateOnly('2026-09-19'), // Saturday
      endDate: toDateOnly('2026-09-20'), // Sunday
      startPortion: DayPortion.FULL,
      endPortion: DayPortion.FULL,
      workingWeekdays: MON_TO_FRI,
      holidayDates: noHolidays,
    });

    expect(result.totalDays.toNumber()).toBe(0);
    expect(result.days).toHaveLength(0);
  });

  it('converts hourly leave into a fraction of a day', () => {
    const result = computeLeaveDays({
      startDate: toDateOnly('2026-09-15'),
      endDate: toDateOnly('2026-09-15'),
      startPortion: DayPortion.HOURS,
      endPortion: DayPortion.FULL,
      workingWeekdays: MON_TO_FRI,
      holidayDates: noHolidays,
      hoursPerDay: 8,
      requestedHours: 2,
    });

    expect(result.totalDays.toNumber()).toBe(0.25);
    expect(result.totalHours?.toNumber()).toBe(2);
  });
});

describe('computeAccruedQuota', () => {
  it('grants the full quota to staff hired in a previous year', () => {
    const quota = computeAccruedQuota({
      method: LeaveAccrualMethod.ANNUAL_GRANT,
      defaultQuota: 10,
      seniorityTiers: [],
      hireDate: toDateOnly('2020-03-01'),
      year: 2026,
      asOf: toDateOnly('2026-01-01'),
    });

    expect(quota.toNumber()).toBe(10);
  });

  it('pro-rates the first year by remaining months', () => {
    const quota = computeAccruedQuota({
      method: LeaveAccrualMethod.ANNUAL_GRANT,
      defaultQuota: 12,
      seniorityTiers: [],
      hireDate: toDateOnly('2026-07-01'), // July -> 6 months remaining
      year: 2026,
      asOf: toDateOnly('2026-12-31'),
    });

    expect(quota.toNumber()).toBe(6);
  });

  it('accrues monthly for staff on monthly accrual', () => {
    const quota = computeAccruedQuota({
      method: LeaveAccrualMethod.MONTHLY_ACCRUAL,
      defaultQuota: 12,
      seniorityTiers: [],
      hireDate: toDateOnly('2025-01-01'),
      year: 2026,
      asOf: toDateOnly('2026-04-01'), // 3 completed months this year
    });

    expect(quota.toNumber()).toBe(3);
  });

  it('picks the right seniority tier', () => {
    const tiers = [
      { years: 0, quota: 6 },
      { years: 3, quota: 10 },
      { years: 10, quota: 15 },
    ];

    const junior = computeAccruedQuota({
      method: LeaveAccrualMethod.SENIORITY_TIERED,
      defaultQuota: 6,
      seniorityTiers: tiers,
      hireDate: toDateOnly('2024-01-01'),
      year: 2026,
      asOf: toDateOnly('2026-06-01'),
    });
    const senior = computeAccruedQuota({
      method: LeaveAccrualMethod.SENIORITY_TIERED,
      defaultQuota: 6,
      seniorityTiers: tiers,
      hireDate: toDateOnly('2012-01-01'),
      year: 2026,
      asOf: toDateOnly('2026-06-01'),
    });

    expect(junior.toNumber()).toBe(6);
    expect(senior.toNumber()).toBe(15);
  });

  it('grants nothing when the leave type does not accrue', () => {
    const quota = computeAccruedQuota({
      method: LeaveAccrualMethod.NONE,
      defaultQuota: 30,
      seniorityTiers: [],
      hireDate: toDateOnly('2020-01-01'),
      year: 2026,
    });

    expect(quota.toNumber()).toBe(0);
  });
});

describe('availableBalance', () => {
  it('subtracts used and pending days', () => {
    const balance = availableBalance({
      openingBalance: 0,
      granted: 10,
      carriedOver: 2,
      adjusted: 1,
      used: 3,
      pending: 1.5,
      expired: 0,
    });

    expect(balance.toNumber()).toBe(8.5);
  });
});

describe('computeCarryOver', () => {
  it('caps carry-over at the policy maximum', () => {
    expect(computeCarryOver(new Decimal(7), 5).toNumber()).toBe(5);
  });

  it('carries nothing when the policy disallows it', () => {
    expect(computeCarryOver(new Decimal(7), 0).toNumber()).toBe(0);
  });

  it('never carries a negative balance forward', () => {
    expect(computeCarryOver(new Decimal(-2), 5).toNumber()).toBe(0);
  });
});
