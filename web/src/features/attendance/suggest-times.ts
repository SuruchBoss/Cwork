// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/** Before this time a lone scan is taken as the morning clock-in. */
const MORNING_UNTIL = '12:00';
/** From this time a lone scan is taken as the evening clock-out. */
const EVENING_FROM = '15:00';

/**
 * The times to offer already chosen on a day HR has to settle (CW-106, CW-110).
 *
 * A day with several scans offers the first as the clock-in and the last as the
 * clock-out. A day with one scan used to offer it as the clock-in whatever the
 * hour, so a lone 17:32 became a clock-in at half past five. Now a lone scan in
 * the morning is the clock-in, a lone scan from the afternoon on is the
 * clock-out, and one in between (a lunch break could be either) is left for HR
 * to pick, with neither chosen. Times are zero-padded `HH:MM`, so they compare
 * as text.
 */
export function suggestTimes(times: string[]): { clockIn: string; clockOut: string } {
  if (times.length === 0) return { clockIn: '', clockOut: '' };
  if (times.length > 1) return { clockIn: times[0], clockOut: times[times.length - 1] };
  const only = times[0];
  if (only < MORNING_UNTIL) return { clockIn: only, clockOut: '' };
  if (only >= EVENING_FROM) return { clockIn: '', clockOut: only };
  return { clockIn: '', clockOut: '' };
}
