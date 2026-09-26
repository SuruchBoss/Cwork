// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { DayPortion, LeaveAccrualMethod } from '@prisma/client';
import { Decimal } from '../../../core/utils/money.util';
import {
  eachDateInRange,
  formatDateOnly,
  isoWeekday,
  monthsOfService,
  yearsOfService,
} from '../../../core/utils/date.util';

/**
 * Pure leave arithmetic. No database, no framework — everything here is a
 * function of its inputs, which is what makes leave rules testable and makes
 * "why was I charged 2.5 days?" answerable.
 */

export interface LeaveDayLine {
  date: Date;
  portion: DayPortion;
  hours: number | null;
  /** Fraction of a working day this line consumes (1, 0.5, or hours/hoursPerDay). */
  dayValue: Decimal;
}

export interface ComputeLeaveDaysInput {
  startDate: Date;
  endDate: Date;
  startPortion: DayPortion;
  endPortion: DayPortion;
  /** ISO weekday numbers that count as working days (1 = Mon … 7 = Sun). */
  workingWeekdays: number[];
  /** `yyyy-MM-dd` strings of public holidays in range. */
  holidayDates: Set<string>;
  /** Hours in a standard working day, for hourly leave. */
  hoursPerDay?: number;
  /** Total hours requested when `startPortion` is HOURS. */
  requestedHours?: number;
}

export interface ComputedLeave {
  days: LeaveDayLine[];
  totalDays: Decimal;
  totalHours: Decimal | null;
}

/**
 * Explodes a leave range into the working days it actually consumes.
 *
 * Weekends and public holidays inside the range are excluded rather than
 * charged — an employee taking Friday to Monday is charged 2 days, not 4.
 */
export function computeLeaveDays(input: ComputeLeaveDaysInput): ComputedLeave {
  const hoursPerDay = input.hoursPerDay ?? 8;
  const workingSet = new Set(input.workingWeekdays);
  const calendarDays = eachDateInRange(input.startDate, input.endDate);

  const workingDays = calendarDays.filter(
    (date) => workingSet.has(isoWeekday(date)) && !input.holidayDates.has(formatDateOnly(date)),
  );

  if (workingDays.length === 0) {
    return { days: [], totalDays: new Decimal(0), totalHours: null };
  }

  // Hourly leave only makes sense within a single day.
  if (input.startPortion === DayPortion.HOURS) {
    const hours = input.requestedHours ?? 0;
    const dayValue = new Decimal(hours).dividedBy(hoursPerDay).toDecimalPlaces(2);
    return {
      days: [{ date: workingDays[0], portion: DayPortion.HOURS, hours, dayValue }],
      totalDays: dayValue,
      totalHours: new Decimal(hours),
    };
  }

  const lines: LeaveDayLine[] = workingDays.map((date, index) => {
    const isFirst = index === 0;
    const isLast = index === workingDays.length - 1;

    let portion: DayPortion = DayPortion.FULL;
    if (isFirst && isLast) {
      // Single working day: a half-day request on either end means half a day.
      portion =
        input.startPortion !== DayPortion.FULL
          ? input.startPortion
          : input.endPortion !== DayPortion.FULL
            ? input.endPortion
            : DayPortion.FULL;
    } else if (isFirst) {
      // Starting in the afternoon consumes only the afternoon of day one.
      portion =
        input.startPortion === DayPortion.AFTERNOON ? DayPortion.AFTERNOON : DayPortion.FULL;
    } else if (isLast) {
      // Returning after lunch means the final day is only the morning.
      portion = input.endPortion === DayPortion.MORNING ? DayPortion.MORNING : DayPortion.FULL;
    }

    const dayValue = portion === DayPortion.FULL ? new Decimal(1) : new Decimal(0.5);
    return { date, portion, hours: null, dayValue };
  });

  const totalDays = lines.reduce((acc, line) => acc.plus(line.dayValue), new Decimal(0));

  return {
    days: lines,
    totalDays: totalDays.toDecimalPlaces(2),
    totalHours: totalDays.times(hoursPerDay).toDecimalPlaces(2),
  };
}

export interface SeniorityTier {
  years: number;
  quota: number;
}

export interface AccrualInput {
  method: LeaveAccrualMethod;
  defaultQuota: number;
  seniorityTiers: SeniorityTier[];
  hireDate: Date;
  /** Leave year being granted. */
  year: number;
  asOf?: Date;
}

/**
 * How much quota an employee has earned for `year`.
 *
 * Thai practice: annual leave is commonly granted in full at the start of the
 * leave year for confirmed staff (ANNUAL_GRANT), or accrued monthly for new
 * joiners (MONTHLY_ACCRUAL). SENIORITY_TIERED picks the tier for their years of
 * service. Everything is capped at `defaultQuota` unless a tier says otherwise.
 */
export function computeAccruedQuota(input: AccrualInput): Decimal {
  const asOf = input.asOf ?? new Date();
  const yearEnd = new Date(Date.UTC(input.year, 11, 31));
  const effectiveAsOf = asOf > yearEnd ? yearEnd : asOf;

  const baseQuota = resolveBaseQuota(input, effectiveAsOf);

  switch (input.method) {
    case LeaveAccrualMethod.NONE:
      return new Decimal(0);

    case LeaveAccrualMethod.MONTHLY_ACCRUAL: {
      // Only months served inside this leave year accrue.
      const yearStart = new Date(Date.UTC(input.year, 0, 1));
      const accrualStart = input.hireDate > yearStart ? input.hireDate : yearStart;
      const months = Math.min(12, monthsOfService(accrualStart, effectiveAsOf));
      return baseQuota.times(months).dividedBy(12).toDecimalPlaces(2);
    }

    case LeaveAccrualMethod.SENIORITY_TIERED:
    case LeaveAccrualMethod.ANNUAL_GRANT:
    default: {
      // Someone hired mid-year gets a pro-rated grant for their first year.
      if (input.hireDate.getUTCFullYear() === input.year) {
        const remainingMonths = 12 - input.hireDate.getUTCMonth();
        return baseQuota.times(remainingMonths).dividedBy(12).toDecimalPlaces(2);
      }
      return baseQuota;
    }
  }
}

function resolveBaseQuota(input: AccrualInput, asOf: Date): Decimal {
  if (input.method !== LeaveAccrualMethod.SENIORITY_TIERED || input.seniorityTiers.length === 0) {
    return new Decimal(input.defaultQuota);
  }
  const years = yearsOfService(input.hireDate, asOf);
  const tier = [...input.seniorityTiers]
    .sort((a, b) => a.years - b.years)
    .reduce<SeniorityTier | null>(
      (best, candidate) => (years >= candidate.years ? candidate : best),
      null,
    );
  return new Decimal(tier?.quota ?? input.defaultQuota);
}

export interface BalanceInput {
  openingBalance: Decimal | number | string;
  granted: Decimal | number | string;
  carriedOver: Decimal | number | string;
  adjusted: Decimal | number | string;
  used: Decimal | number | string;
  pending: Decimal | number | string;
  expired: Decimal | number | string;
}

/**
 * Available balance. `pending` is subtracted so a second request cannot spend
 * days that a submitted-but-unapproved request has already reserved.
 */
export function availableBalance(input: BalanceInput): Decimal {
  return new Decimal(input.openingBalance.toString())
    .plus(input.granted.toString())
    .plus(input.carriedOver.toString())
    .plus(input.adjusted.toString())
    .minus(input.used.toString())
    .minus(input.pending.toString())
    .minus(input.expired.toString())
    .toDecimalPlaces(2);
}

/** Days that roll into the next leave year, capped by policy. */
export function computeCarryOver(remaining: Decimal, carryOverMaxDays: number): Decimal {
  if (carryOverMaxDays <= 0) return new Decimal(0);
  const cap = new Decimal(carryOverMaxDays);
  const positive = remaining.isNegative() ? new Decimal(0) : remaining;
  return (positive.greaterThan(cap) ? cap : positive).toDecimalPlaces(2);
}
