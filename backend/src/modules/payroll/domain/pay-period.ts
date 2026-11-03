// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Pay periods of fourteen days (CW-101).
 *
 * A daily wage can be paid every two weeks. The periods follow one another
 * without a gap, each starting the day after the last ended, so every day falls
 * in exactly one of them; but they do not line up with the calendar months, so
 * some months have three paydays and some periods span two months.
 *
 * Social security and withholding are worked out on a month's total, so each
 * period has to say which month it counts toward. That is decided in one place,
 * `monthCountedFor`, and nothing else in Cwork looks at a period's dates to
 * answer it.
 */

/** Days in one period. */
export const BIWEEKLY_PERIOD_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CountedMonth {
  year: number;
  month: number;
}

/**
 * The month a 14-day period counts toward.
 *
 * **Provisional.** Which month a period that spans two months belongs to is an
 * open question (issue #36), to be answered from the Social Security Act and
 * the Office's own announcements. Until it is, a period counts toward the month
 * it is paid in: the contribution is taken from wages when they are paid. If
 * the answer is the month worked, or the month the period ends in, this is the
 * only function to change.
 */
export function monthCountedFor(period: { payDate: Date }): CountedMonth {
  return { year: period.payDate.getUTCFullYear(), month: period.payDate.getUTCMonth() + 1 };
}

/** The last day of a 14-day period that starts on `start`. */
export function biweeklyEnd(start: Date): Date {
  return new Date(start.getTime() + (BIWEEKLY_PERIOD_DAYS - 1) * DAY_MS);
}

/** The first day of the period after one that ended on `end`. */
export function dayAfter(end: Date): Date {
  return new Date(end.getTime() + DAY_MS);
}

/**
 * Whether a new 14-day period starting on `start` follows on from the periods
 * already made: it starts the day after the last one ended and is not inside
 * one. Returns a reason when it does not, or null when it fits. With no period
 * yet, any start is the first, and sets the rhythm.
 */
export function whyNotNext(
  existing: Array<{ periodStart: Date; periodEnd: Date }>,
  start: Date,
): { reason: 'OVERLAPS'; with: Date } | { reason: 'GAP_OR_EARLY'; expected: Date } | null {
  if (existing.length === 0) return null;
  const end = biweeklyEnd(start);
  const overlapping = existing.find((p) => p.periodStart <= end && p.periodEnd >= start);
  if (overlapping) return { reason: 'OVERLAPS', with: overlapping.periodStart };

  const last = existing.reduce((a, b) => (a.periodEnd >= b.periodEnd ? a : b));
  const expected = dayAfter(last.periodEnd);
  if (start.getTime() !== expected.getTime()) return { reason: 'GAP_OR_EARLY', expected };
  return null;
}

/**
 * Whether the month still has a 14-day period to come, judged from the last
 * one made: the next would be paid fourteen days after it, and counts toward
 * this month if that falls in it. A month is not complete until it has all of
 * its periods, and a list or a filing made before the last one is made would
 * look finished and be short.
 */
export function anotherPeriodExpected(lastPayDate: Date, month: CountedMonth): boolean {
  const next = monthCountedFor({
    payDate: new Date(lastPayDate.getTime() + BIWEEKLY_PERIOD_DAYS * DAY_MS),
  });
  return next.year === month.year && next.month === month.month;
}

/** The ordinals of a month's 14-day periods that are missing from 1 up to the last. */
export function missingOrdinals(present: number[]): number[] {
  const highest = Math.max(0, ...present);
  const have = new Set(present);
  return Array.from({ length: highest }, (_, i) => i + 1).filter((n) => !have.has(n));
}
