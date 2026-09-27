// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { dueReset, IDLE_RESET_AFTER_MS, localDate, nextResetAfter } from './demo-schedule';

const BANGKOK = 'Asia/Bangkok';

describe('nextResetAfter', () => {
  it('is the next top of the hour', () => {
    expect(nextResetAfter(new Date('2026-09-28T02:17:43.120Z')).toISOString()).toBe(
      '2026-09-28T03:00:00.000Z',
    );
  });

  it('is a whole hour away when called exactly on the hour', () => {
    expect(nextResetAfter(new Date('2026-09-28T03:00:00.000Z')).toISOString()).toBe(
      '2026-09-28T04:00:00.000Z',
    );
  });

  it('crosses midnight and month ends', () => {
    expect(nextResetAfter(new Date('2026-09-30T23:59:59.999Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });
});

describe('localDate', () => {
  it("is the organisation's calendar day, not UTC's", () => {
    // 18:30 UTC on the 27th is already 01:30 on the 28th in Bangkok.
    expect(localDate(new Date('2026-09-27T18:30:00Z'), BANGKOK)).toBe('2026-09-28');
    expect(localDate(new Date('2026-09-27T16:59:59Z'), BANGKOK)).toBe('2026-09-27');
  });
});

describe('dueReset', () => {
  const now = new Date('2026-09-28T02:30:00Z'); // 09:30 in Bangkok
  const base = {
    now,
    nextResetAt: new Date('2026-09-28T03:00:00Z'),
    dirty: false,
    lastRequestAt: now,
    seededAt: new Date('2026-09-28T02:00:00Z'),
    timeZone: BANGKOK,
  };

  it('leaves a demo alone between resets while it is in use', () => {
    expect(dueReset({ ...base, dirty: true })).toBeNull();
  });

  it('resets on the hour when something changed', () => {
    expect(dueReset({ ...base, now: base.nextResetAt, dirty: true })).toBe('hourly');
  });

  it('skips the hour when nothing changed since a reset earlier today', () => {
    expect(dueReset({ ...base, now: base.nextResetAt })).toBeNull();
  });

  it("reseeds on the hour when the seed's today is yesterday", () => {
    // Seeded at 23:30 Bangkok on the 27th, still untouched at 10:00 on the 28th.
    expect(
      dueReset({ ...base, now: base.nextResetAt, seededAt: new Date('2026-09-27T16:30:00Z') }),
    ).toBe('new day');
  });

  it('reseeds on the hour when it was never seeded', () => {
    expect(dueReset({ ...base, now: base.nextResetAt, seededAt: null })).toBe('new day');
  });

  it('resets a changed demo once it has been quiet long enough to be about to sleep', () => {
    const quietSince = new Date(now.getTime() - IDLE_RESET_AFTER_MS);
    expect(dueReset({ ...base, dirty: true, lastRequestAt: quietSince })).toBe('idle');
  });

  it('does not reset a quiet demo that nobody changed', () => {
    const quietSince = new Date(now.getTime() - 3 * IDLE_RESET_AFTER_MS);
    expect(dueReset({ ...base, lastRequestAt: quietSince })).toBeNull();
  });

  it('resets before the instance sleeps: ten quiet minutes is inside the free tier’s fifteen', () => {
    expect(IDLE_RESET_AFTER_MS).toBeLessThan(15 * 60_000);
  });
});
