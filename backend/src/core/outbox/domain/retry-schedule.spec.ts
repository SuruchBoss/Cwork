// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  isExhausted,
  nextAttemptAt,
  retryDelayMs,
} from './retry-schedule';

describe('outbox retry schedule', () => {
  it('waits before the first retry rather than trying straight back', () => {
    // A handler that just failed on a provider outage will fail again if it is
    // asked a millisecond later; the only thing that achieves is a hot loop.
    expect(retryDelayMs(1)).toBe(BASE_DELAY_MS);
  });

  it('doubles the wait with each failure', () => {
    expect(retryDelayMs(2)).toBe(BASE_DELAY_MS * 2);
    expect(retryDelayMs(3)).toBe(BASE_DELAY_MS * 4);
    expect(retryDelayMs(4)).toBe(BASE_DELAY_MS * 8);
  });

  it('stops doubling at the cap', () => {
    // Otherwise the last attempts land so far out that the event is waiting on
    // a deadline set while the thing that broke it was still broken.
    expect(retryDelayMs(8)).toBe(MAX_DELAY_MS);
    expect(retryDelayMs(50)).toBe(MAX_DELAY_MS);
  });

  it('survives an attempt count large enough to overflow the shift', () => {
    // 2 ** 1024 is Infinity, and `new Date(Infinity)` is an Invalid Date that
    // would be written to the row without complaint.
    const at = nextAttemptAt(5000, new Date('2026-09-15T00:00:00Z'));

    expect(Number.isNaN(at.getTime())).toBe(false);
    expect(at.toISOString()).toBe('2026-09-15T00:30:00.000Z');
  });

  it('never schedules a retry in the past', () => {
    const now = new Date('2026-09-15T00:00:00Z');

    expect(nextAttemptAt(0, now).getTime()).toBeGreaterThan(now.getTime());
    expect(nextAttemptAt(1, now).getTime()).toBeGreaterThan(now.getTime());
  });

  it('gives up only once the attempts are spent', () => {
    expect(isExhausted(7, 8)).toBe(false);
    expect(isExhausted(8, 8)).toBe(true);
    expect(isExhausted(9, 8)).toBe(true);
  });
});
