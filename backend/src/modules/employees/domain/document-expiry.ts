// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * When a foreign worker's passport or work permit is close to lapsing (CW-073).
 *
 * A document is in one window at a time: 90, 60 or 30 days left, or 0 once the
 * date has passed. A document expiring today is still valid today, so it is in
 * the 30 window, and it is in the 0 window from tomorrow. A document with more
 * than 90 days left is in none. HR is told once when a document enters a window;
 * a renewal is a later date, which is a different document as far as the
 * windows are concerned.
 */

export const EXPIRY_WINDOWS = [90, 60, 30] as const;

/** The window that means the date has passed. */
export const EXPIRED = 0;

export type ExpiringDocument = 'PASSPORT' | 'WORK_PERMIT';

const DAY = 86_400_000;

/** Whole calendar days from `today` to `expiresOn`, both yyyy-mm-dd; negative once it has passed. */
export function daysLeft(expiresOn: string, today: string): number {
  const day = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Math.round((day(expiresOn) - day(today)) / DAY);
}

/** 90, 60, 30, or 0 (expired); null while more than 90 days remain. */
export function windowOf(left: number): number | null {
  if (left < 0) return EXPIRED;
  if (left <= 30) return 30;
  if (left <= 60) return 60;
  if (left <= 90) return 90;
  return null;
}
