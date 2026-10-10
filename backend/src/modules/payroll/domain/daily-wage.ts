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
 * - A public holiday on the weekly day off pays nothing here: the employee is
 *   owed a substitute day, which Cwork does not add by itself, so it is
 *   flagged for HR to enter (docs/payroll-thailand.md, "Daily wages").
 */
export function countDaysPaid(days: DailyWageDay[]): DaysPaid {
  let worked = new Decimal(0);
  let paidLeave = new Decimal(0);
  let holidays = 0;
  const incomplete: string[] = [];
  const noRecord: string[] = [];
  const holidayOnDayOff: string[] = [];

  for (const day of days) {
    if (day.paidHoliday) {
      if (day.scheduled) holidays += 1;
      else holidayOnDayOff.push(day.date);
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

  return {
    days: worked.plus(paidLeave).plus(holidays).toNumber(),
    worked: worked.toNumber(),
    paidLeave: paidLeave.toNumber(),
    holidays,
    warnings,
  };
}
