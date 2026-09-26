// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { addDays, differenceInCalendarDays, format, parse, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * Date handling rules for the whole system:
 *  - "Calendar" values (work dates, leave dates, payroll periods) are stored as
 *    `@db.Date` and represented in JS as a Date at **UTC midnight**. They mean a
 *    day, not an instant, so they must never be shifted by a timezone.
 *  - "Instants" (punches, submissions) are stored as timestamptz in UTC and are
 *    converted to the organisation's timezone only for display and for deriving
 *    which calendar day a punch belongs to.
 */

export const DATE_ONLY_FORMAT = 'yyyy-MM-dd';

/** Normalises any Date/ISO string to UTC midnight of that calendar day. */
export function toDateOnly(value: Date | string): Date {
  if (typeof value === 'string') {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function formatDateOnly(value: Date): string {
  return format(toDateOnly(value), DATE_ONLY_FORMAT);
}

/** Calendar day (in `timezone`) that an instant belongs to. */
export function workDateFor(instant: Date, timezone: string): Date {
  const local = toZonedTime(instant, timezone);
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/** Inclusive list of calendar days between two date-only values. */
export function eachDateInRange(start: Date, end: Date): Date[] {
  const from = toDateOnly(start);
  const to = toDateOnly(end);
  const span = differenceInCalendarDays(to, from);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, i) => addDays(from, i));
}

/** ISO weekday: 1 = Monday … 7 = Sunday (matches WorkSchedule.workingDays). */
export function isoWeekday(date: Date): number {
  const day = toDateOnly(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function parseHhMm(time: string): { hours: number; minutes: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Invalid HH:mm time: "${time}"`);
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function hhMmToMinutes(time: string): number {
  const { hours, minutes } = parseHhMm(time);
  return hours * 60 + minutes;
}

export function minutesToHhMm(totalMinutes: number): string {
  const normalised = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalised / 60);
  const m = normalised % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The UTC instant at which a shift's local wall-clock time occurs on `workDate`.
 * `dayOffset` is 1 for the end of a shift that crosses midnight.
 */
export function zonedInstant(workDate: Date, time: string, timezone: string, dayOffset = 0): Date {
  const day = addDays(toDateOnly(workDate), dayOffset);
  const localWallClock = parse(time, 'HH:mm', startOfDay(day));
  const stamped = new Date(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    localWallClock.getHours(),
    localWallClock.getMinutes(),
    0,
    0,
  );
  return fromZonedTime(stamped, timezone);
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60000);
}

/** Whole years of service as of `asOf`, used by seniority-tiered leave quotas. */
export function yearsOfService(hireDate: Date, asOf: Date = new Date()): number {
  const hire = toDateOnly(hireDate);
  const at = toDateOnly(asOf);
  let years = at.getUTCFullYear() - hire.getUTCFullYear();
  const beforeAnniversary =
    at.getUTCMonth() < hire.getUTCMonth() ||
    (at.getUTCMonth() === hire.getUTCMonth() && at.getUTCDate() < hire.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

/** Completed whole months of service, used by monthly leave accrual. */
export function monthsOfService(hireDate: Date, asOf: Date = new Date()): number {
  const hire = toDateOnly(hireDate);
  const at = toDateOnly(asOf);
  let months =
    (at.getUTCFullYear() - hire.getUTCFullYear()) * 12 + (at.getUTCMonth() - hire.getUTCMonth());
  if (at.getUTCDate() < hire.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return toDateOnly(aStart) <= toDateOnly(bEnd) && toDateOnly(bStart) <= toDateOnly(aEnd);
}
