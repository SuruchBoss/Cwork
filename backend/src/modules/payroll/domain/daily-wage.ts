// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { AttendanceStatus } from '@prisma/client';
import { Decimal } from '../../../core/utils/money.util';

/**
 * Daily wages (CW-069). Pure: the payroll service gathers the days, this
 * decides what each one pays and what HR should check.
 */

/** Something HR should check before approving a payslip, said by the run page. */
export interface PayslipWarning {
  code: string;
  params?: Record<string, string | number>;
}

export interface WorkLocationWage {
  name: string;
  minimumDailyWage: number | null;
  minimumDailyWageSource: string | null;
}

/**
 * Whether a daily rate meets the minimum wage where the employee works.
 *
 * Cwork keeps no table of rates (they differ by province, district and
 * business type, and change by announcement), so it compares with the rate HR
 * entered on the work location. Where there is nothing to compare with it says
 * so rather than passing the rate silently.
 */
export function minimumWageWarnings(
  dailyRate: number,
  location: WorkLocationWage | null,
): PayslipWarning[] {
  if (!location) return [{ code: 'NO_WORK_LOCATION' }];
  if (location.minimumDailyWage === null) {
    return [{ code: 'MINIMUM_WAGE_NOT_SET', params: { location: location.name } }];
  }
  if (new Decimal(dailyRate).lessThan(location.minimumDailyWage)) {
    return [
      {
        code: 'BELOW_MINIMUM_WAGE',
        params: {
          dailyRate,
          minimum: location.minimumDailyWage,
          location: location.name,
          source: location.minimumDailyWageSource ?? '',
        },
      },
    ];
  }
  return [];
}

/** Attendance that counts as a day worked. */
const WORKED: ReadonlySet<AttendanceStatus> = new Set([
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EARLY_LEAVE,
  AttendanceStatus.INCOMPLETE,
]);

export interface DailyWageDay {
  /** ISO date. */
  date: string;
  /** The employee's schedule has work on this weekday. */
  scheduled: boolean;
  /** A paid public holiday for this employee's location. */
  paidHoliday: boolean;
  /** The day's attendance status, or null if no record was closed for it. */
  attendance: AttendanceStatus | null;
  /** Approved paid leave on the day, in days (0.5 for a half day). */
  paidLeave: number;
  /** Approved unpaid leave on the day, in days. */
  unpaidLeave: number;
  /**
   * A working day that stands in for a holiday on the weekly day off: the
   * holiday's ISO date. Null on any other day.
   */
  substituteFor?: string | null;
  /**
   * On a paid holiday that falls on the weekly day off, the working day it
   * moves to (it may be in a later period), or null when the employee leaves
   * before one comes.
   */
  substitutedOn?: string | null;
}

export interface DaysPaid {
  days: number;
  worked: number;
  paidLeave: number;
  holidays: number;
  warnings: PayslipWarning[];
}

/**
 * The days a daily-wage employee is paid for in a period (PO decision Q3).
 *
 * - A day worked (present, late, left early) is one day, less any unpaid
 *   leave taken that day; an incomplete punch also counts as worked, and is
 *   flagged so HR checks it.
 * - Paid leave counts for its portion of the day.
 * - A paid public holiday on a scheduled working day is paid.
 * - A day off, an absence and unpaid leave are not paid.
 * - A scheduled day with no attendance and no leave is not paid, and is
 *   flagged: it is usually a day not closed yet, not a day off.
 * - A public holiday on the weekly day off pays nothing on the day itself: it
 *   moves to the next working day (section 29), which is paid as a holiday
 *   and listed for HR (see `substituteHolidays`). If the employee leaves
 *   before that day comes, it is flagged instead: it is owed but not paid.
 */
export function countDaysPaid(days: DailyWageDay[]): DaysPaid {
  let worked = new Decimal(0);
  let paidLeave = new Decimal(0);
  let holidays = 0;
  const incomplete: string[] = [];
  const noRecord: string[] = [];
  const holidayOnDayOff: string[] = [];
  const substitutes: string[] = [];
  const substitutesWorked: string[] = [];

  for (const day of days) {
    if (day.paidHoliday) {
      if (day.scheduled) holidays += 1;
      else if (!day.substitutedOn) holidayOnDayOff.push(day.date);
      continue;
    }
    if (day.substituteFor) {
      holidays += 1;
      substitutes.push(`${day.substituteFor} → ${day.date}`);
      if (day.attendance !== null && WORKED.has(day.attendance)) substitutesWorked.push(day.date);
      continue;
    }
    if (day.attendance !== null && WORKED.has(day.attendance)) {
      if (day.attendance === AttendanceStatus.INCOMPLETE) incomplete.push(day.date);
      // Worked, less the part of the day taken as unpaid leave; paid leave on
      // a day worked is already inside the whole day.
      worked = worked.plus(Decimal.max(0, new Decimal(1).minus(day.unpaidLeave)));
      continue;
    }
    if (day.paidLeave > 0) {
      paidLeave = paidLeave.plus(Decimal.min(1, day.paidLeave));
      continue;
    }
    if (day.scheduled && day.attendance === null && day.unpaidLeave === 0) {
      noRecord.push(day.date);
    }
  }

  const warnings: PayslipWarning[] = [];
  if (incomplete.length > 0) {
    warnings.push({
      code: 'INCOMPLETE_PUNCH_COUNTED',
      params: { days: incomplete.length, dates: incomplete.join(', ') },
    });
  }
  if (noRecord.length > 0) {
    warnings.push({
      code: 'NO_ATTENDANCE_RECORD',
      params: { days: noRecord.length, dates: noRecord.join(', ') },
    });
  }
  if (holidayOnDayOff.length > 0) {
    warnings.push({
      code: 'HOLIDAY_ON_DAY_OFF',
      params: { days: holidayOnDayOff.length, dates: holidayOnDayOff.join(', ') },
    });
  }
  if (substitutes.length > 0) {
    warnings.push({
      code: 'SUBSTITUTE_HOLIDAY',
      params: { days: substitutes.length, dates: substitutes.join(', ') },
    });
  }
  if (substitutesWorked.length > 0) {
    warnings.push({
      code: 'SUBSTITUTE_HOLIDAY_WORKED',
      params: { days: substitutesWorked.length, dates: substitutesWorked.join(', ') },
    });
  }

  return {
    days: worked.plus(paidLeave).plus(holidays).toNumber(),
    worked: worked.toNumber(),
    paidLeave: paidLeave.toNumber(),
    holidays,
    warnings,
  };
}

export interface CalendarDay {
  /** ISO date. */
  date: string;
  /** The employee's schedule has work on this weekday. */
  scheduled: boolean;
  /** A paid public holiday for this employee's location. */
  paidHoliday: boolean;
}

/**
 * Where each holiday on the weekly day off is paid instead (section 29,
 * third paragraph): the next working day of the employee's own schedule that
 * is not itself a holiday. Two such holidays in a row take the next two
 * working days. A holiday on a working day needs no substitute and does not
 * receive one.
 *
 * The calendar must be in date order and cover the days the employee is
 * employed for; a holiday whose substitute would fall after its last day is
 * left out of the result. Returns substitute date → holiday date.
 */
export function substituteHolidays(calendar: readonly CalendarDay[]): Map<string, string> {
  const substitutes = new Map<string, string>();
  const owed: string[] = [];
  for (const day of calendar) {
    if (day.paidHoliday) {
      if (!day.scheduled) owed.push(day.date);
      continue;
    }
    if (day.scheduled && owed.length > 0) substitutes.set(day.date, owed.shift()!);
  }
  return substitutes;
}

/**
 * The least each kind of work on a rest day pays a daily-wage employee, as a
 * multiple of the hourly rate (section 62). Not paid for the weekly day off
 * (section 56), work on it pays at least twice; paid for a traditional
 * holiday, work on it pays at least once more on top of the day.
 */
export const DAILY_WAGE_REST_DAY_MINIMUM: Readonly<Record<string, number>> = {
  DAY_OFF: 2,
  HOLIDAY: 1,
};

/**
 * Raises any rest-day overtime below the statutory minimum for a daily-wage
 * employee, and says so on the payslip. The overtime request keeps the
 * organisation's rate, which is set for salaried staff: a monthly salary
 * already pays the weekly day off, so one more times is enough for them.
 */
export function dailyWageOvertime<T extends { type: string; hours: number; multiplier: number }>(
  lines: readonly T[],
): { lines: T[]; warnings: PayslipWarning[] } {
  const raised: string[] = [];
  let hours = new Decimal(0);
  const result = lines.map((line) => {
    const minimum = DAILY_WAGE_REST_DAY_MINIMUM[line.type];
    if (minimum === undefined || line.hours <= 0 || line.multiplier >= minimum) return line;
    raised.push(`${line.type} ${line.multiplier}x → ${minimum}x`);
    hours = hours.plus(line.hours);
    return { ...line, multiplier: minimum };
  });
  return {
    lines: result,
    warnings:
      raised.length > 0
        ? [
            {
              code: 'REST_DAY_RATE_RAISED',
              params: { hours: hours.toNumber(), rates: [...new Set(raised)].join(', ') },
            },
          ]
        : [],
  };
}
