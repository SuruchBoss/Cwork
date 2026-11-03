// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Date helpers for the e2e suite.
 *
 * The seed builds its calendar from the current year, so the suite has to do
 * the same. A test that only passes in September 2026 is a test that starts
 * lying in October.
 */

/** `yyyy-MM-dd` in UTC, which is how the API takes calendar dates. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Today's calendar date in the organization's time zone, as a UTC-midnight
 * `Date` (the shape the helpers below work in).
 *
 * The API decides what "today" is, and so how much notice a leave request has
 * given, in the organization's zone (Asia/Bangkok by default), seven hours
 * ahead of UTC. A test that takes today from `new Date()` in UTC is one day
 * behind the server between midnight and seven in the morning there, and asks
 * for a request with a day less notice than it believes.
 */
export function calendarToday(now: Date = new Date(), timeZone = 'Asia/Bangkok'): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${parts}T00:00:00.000Z`);
}

/** 1 = Monday … 7 = Sunday, matching the API's working-weekday numbering. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

export interface LeaveWindow {
  /** A Friday. */
  startDate: string;
  /** The Monday three days later. */
  endDate: string;
}

/**
 * Finds a Friday-to-Monday window that costs exactly two working days: no
 * public holiday on either end, and both ends inside the same leave year the
 * employee has an entitlement for.
 *
 * Searching forward from today keeps the request in the future, which is what
 * the API expects of a leave request.
 */
export function findFridayToMondayWindow(holidayDates: Set<string>, from: Date): LeaveWindow {
  const year = from.getUTCFullYear();

  for (let offset = 3; offset <= 330; offset += 1) {
    const start = addDays(from, offset);
    if (isoWeekday(start) !== 5) continue;

    const end = addDays(start, 3);
    if (end.getUTCFullYear() !== year) break;

    if (holidayDates.has(isoDate(start)) || holidayDates.has(isoDate(end))) continue;
    return { startDate: isoDate(start), endDate: isoDate(end) };
  }

  throw new Error(
    `No clean Friday-to-Monday window left in ${year}. Running the suite in the ` +
      'final days of December needs the next leave year granted first.',
  );
}
