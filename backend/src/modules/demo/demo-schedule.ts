// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * When the public demo puts its data back — the decision only, no clock and no
 * database, so it can be tested on its own.
 *
 * Three occasions (CW-031, docs/demo.md):
 *
 * - **On the hour**, every hour. The banner shows it, so a visitor mid-way
 *   through something knows what is coming. A demo nobody has touched since
 *   the last reset is left alone, unless it was seeded on an earlier day: the
 *   seed's calendar is relative to today, and yesterday's "today" is wrong.
 * - **When it goes quiet.** The free instance sleeps after fifteen minutes
 *   without a request, and a sleeping instance keeps no timers — so an hourly
 *   reset alone would let one visitor's changes wait, asleep, for the next.
 *   Ten quiet minutes after a change, the demo resets itself before it sleeps.
 * - **At boot, if it has to**: an empty database, one changed since its last
 *   reset (the instance stopped before it could tidy up), or one written with
 *   an encryption key that has since been rotated.
 */

/** How long without a request before a changed demo is put back. */
export const IDLE_RESET_AFTER_MS = 10 * 60_000;

export type ResetReason = 'first boot' | 'boot' | 'new key' | 'hourly' | 'idle' | 'new day';

/** The next top of the hour strictly after `now`. */
export function nextResetAfter(now: Date): Date {
  const next = new Date(now.getTime());
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

/** The calendar date in `timeZone`, as YYYY-MM-DD. */
export function localDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export interface ScheduleState {
  now: Date;
  /** The top of the hour the banner is counting down to. */
  nextResetAt: Date;
  /** Something was written since the last reset. */
  dirty: boolean;
  lastRequestAt: Date;
  seededAt: Date | null;
  /** The organisation's time zone: "today" for the seed is today there. */
  timeZone: string;
}

/** Whether to reset now, and why — or null to leave the demo as it is. */
export function dueReset(state: ScheduleState): ResetReason | null {
  const { now, nextResetAt, dirty, lastRequestAt, seededAt, timeZone } = state;

  if (now.getTime() >= nextResetAt.getTime()) {
    if (dirty) return 'hourly';
    if (!seededAt || localDate(seededAt, timeZone) !== localDate(now, timeZone)) return 'new day';
    return null;
  }

  if (dirty && now.getTime() - lastRequestAt.getTime() >= IDLE_RESET_AFTER_MS) return 'idle';
  return null;
}
