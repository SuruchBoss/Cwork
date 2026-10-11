// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * What each day is for one employee (CW-081): a working day, a weekly day off,
 * a holiday, or the substitute for a holiday that fell on the day off.
 * Attendance, leave, overtime and payroll all ask this one question, so a
 * substitute day is the same day to every one of them. Pure: the work
 * calendar service gathers the schedule and the holiday rows.
 */

export interface ScheduledDay {
  /** ISO date. */
  date: string;
  /** The employee's schedule has work on this weekday. */
  scheduled: boolean;
  /** The employee is employed on this day (from hire to last working day). */
  employed: boolean;
}

export interface CalendarHoliday {
  /** ISO date. */
  date: string;
  isPaid: boolean;
  /**
   * For a row HR entered as the substitute for another holiday: that
   * holiday's ISO date. Null for an ordinary holiday.
   */
  substituteFor: string | null;
}

export interface WorkDay {
  /** ISO date. */
  date: string;
  scheduled: boolean;
  /** An ordinary holiday on this date, paid or not; null if none. */
  holiday: { isPaid: boolean } | null;
  /** On a substitute day, the ISO date of the holiday it stands in for. */
  substituteFor: string | null;
  /**
   * On a paid holiday that fell on the weekly day off, the day it is taken
   * instead, or null if the employee leaves before one comes.
   */
  substitutedOn: string | null;
}

/** A day the employee is not expected at work: day off, holiday or substitute. */
export function isDayOff(day: WorkDay): boolean {
  return !day.scheduled || day.holiday !== null || day.substituteFor !== null;
}

/** A holiday or a substitute for one: attendance reads it as a holiday, overtime pays the holiday rate. */
export function isHoliday(day: WorkDay): boolean {
  return day.holiday !== null || day.substituteFor !== null;
}

/**
 * Resolves each day of `days` (in date order, with no gaps).
 *
 * A paid holiday on the weekly day off moves to a working day (Labour
 * Protection Act s.29, third paragraph):
 *
 * 1. to the day HR entered as its substitute, if that is one of the
 *    employee's working days and not itself a holiday;
 * 2. otherwise to the next working day that is neither a holiday nor already
 *    another holiday's substitute.
 *
 * A row HR entered as a substitute is not a holiday of its own: for an
 * employee the holiday it stands in for did not fall on a day off, it is an
 * ordinary working day. Holidays before the employee joined owe nothing, and
 * no substitute falls after they leave.
 */
export function resolveWorkCalendar(
  days: readonly ScheduledDay[],
  holidays: readonly CalendarHoliday[],
): WorkDay[] {
  const ordinary = new Map<string, { isPaid: boolean }>();
  const entered = new Map<string, string>(); // holiday date → substitute date
  for (const holiday of holidays) {
    if (holiday.substituteFor) {
      entered.set(holiday.substituteFor, holiday.date);
      continue;
    }
    const existing = ordinary.get(holiday.date);
    // An organisation-wide row and a work location's row on the same date: paid if either is.
    ordinary.set(holiday.date, { isPaid: holiday.isPaid || (existing?.isPaid ?? false) });
  }

  const byDate = new Map(days.map((day) => [day.date, day]));
  const canStandIn = (date: string) => {
    const day = byDate.get(date);
    return day !== undefined && day.employed && day.scheduled && !ordinary.has(date);
  };

  const owed = days.filter(
    (day) => day.employed && !day.scheduled && ordinary.get(day.date)?.isPaid === true,
  );
  const substituteFor = new Map<string, string>(); // substitute date → holiday date
  const substitutedOn = new Map<string, string>(); // holiday date → substitute date

  // HR's own choice first, so the automatic rule never takes the day HR chose.
  const automatic = new Set<string>();
  for (const day of owed) {
    const chosen = entered.get(day.date);
    if (chosen && chosen > day.date && canStandIn(chosen) && !substituteFor.has(chosen)) {
      substituteFor.set(chosen, day.date);
      substitutedOn.set(day.date, chosen);
    } else {
      automatic.add(day.date);
    }
  }

  const waiting: string[] = [];
  for (const day of days) {
    if (automatic.has(day.date)) {
      waiting.push(day.date);
      continue;
    }
    if (waiting.length > 0 && canStandIn(day.date) && !substituteFor.has(day.date)) {
      const holiday = waiting.shift()!;
      substituteFor.set(day.date, holiday);
      substitutedOn.set(holiday, day.date);
    }
  }

  return days.map((day) => ({
    date: day.date,
    scheduled: day.scheduled,
    holiday: ordinary.get(day.date) ?? null,
    substituteFor: substituteFor.get(day.date) ?? null,
    substitutedOn: substitutedOn.get(day.date) ?? null,
  }));
}
