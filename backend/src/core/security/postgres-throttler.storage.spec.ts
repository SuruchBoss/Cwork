// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { counterKey, toStorageRecord, type RateLimitRow } from './postgres-throttler.storage';

const at = (nowMs: number, offsetMs: number): Date => new Date(nowMs + offsetMs);

describe('counterKey', () => {
  it('keeps named throttlers apart', () => {
    // A tight limit on sign-in and a loose global one may share a tracker; if
    // they shared a counter, one would spend the other's budget.
    expect(counterKey('203.0.113.7', 'default')).not.toBe(counterKey('203.0.113.7', 'auth'));
  });

  it('is stable for the same tracker and throttler', () => {
    expect(counterKey('203.0.113.7', 'default')).toBe(counterKey('203.0.113.7', 'default'));
  });
});

describe('toStorageRecord', () => {
  const now = 1_700_000_000_000;

  it('reports hits and the seconds left in the window', () => {
    const row: RateLimitRow = { hits: 3, expiresAt: at(now, 42_000), blockedUntil: null };

    expect(toStorageRecord(row, now)).toEqual({
      totalHits: 3,
      timeToExpire: 42,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('rounds a part-second up, so a window never reads as already over', () => {
    const row: RateLimitRow = { hits: 1, expiresAt: at(now, 1), blockedUntil: null };

    expect(toStorageRecord(row, now).timeToExpire).toBe(1);
  });

  it('is blocked while the block is still in the future', () => {
    const row: RateLimitRow = {
      hits: 6,
      expiresAt: at(now, 30_000),
      blockedUntil: at(now, 30_000),
    };

    const record = toStorageRecord(row, now);

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(30);
  });

  it('is not blocked once the block has passed', () => {
    // The row may still say blockedUntil; what decides is the clock, so a stale
    // row cannot keep somebody locked out.
    const row: RateLimitRow = { hits: 6, expiresAt: at(now, 5_000), blockedUntil: at(now, -1) };

    const record = toStorageRecord(row, now);

    expect(record.isBlocked).toBe(false);
    expect(record.timeToBlockExpire).toBe(0);
  });

  it('is not blocked exactly on the boundary', () => {
    const row: RateLimitRow = { hits: 6, expiresAt: at(now, 5_000), blockedUntil: at(now, 0) };

    expect(toStorageRecord(row, now).isBlocked).toBe(false);
  });

  it('never reports a negative time to expire', () => {
    const row: RateLimitRow = { hits: 2, expiresAt: at(now, -10_000), blockedUntil: null };

    expect(toStorageRecord(row, now).timeToExpire).toBe(0);
  });
});
