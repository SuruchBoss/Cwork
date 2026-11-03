// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { addDays, calendarToday, findFridayToMondayWindow, isoDate } from './dates';

/**
 * The e2e suite takes "today" from the organization's calendar, not from UTC
 * (the API does), so a run between midnight and seven in the morning in
 * Bangkok must not ask for a leave request with a day less notice than it
 * thinks. These pin the clock to one o'clock in the morning there.
 */
describe('e2e date helpers', () => {
  // 01:00 on Wednesday 4 November 2026 in Bangkok is still 3 November in UTC.
  const oneAmInBangkok = new Date('2026-11-03T18:00:00.000Z');

  it('reads today in the organization zone, a day ahead of UTC at one in the morning', () => {
    expect(isoDate(calendarToday(oneAmInBangkok))).toBe('2026-11-04');
    expect(isoDate(oneAmInBangkok)).toBe('2026-11-03');
  });

  it('agrees with UTC once the Bangkok day and the UTC day are the same one', () => {
    expect(isoDate(calendarToday(new Date('2026-11-03T16:59:00.000Z')))).toBe('2026-11-03');
    expect(isoDate(calendarToday(new Date('2026-11-04T05:00:00.000Z')))).toBe('2026-11-04');
  });

  it('finds a leave window with the three days of notice annual leave asks for, at one in the morning', () => {
    const today = calendarToday(oneAmInBangkok);
    const window = findFridayToMondayWindow(new Set(), today);

    const noticeDays = Math.floor(
      (new Date(`${window.startDate}T00:00:00.000Z`).getTime() - today.getTime()) / 86_400_000,
    );
    expect(noticeDays).toBeGreaterThanOrEqual(3);
    // The window taken from the UTC date is the one that fell a day short.
    const fromUtc = findFridayToMondayWindow(new Set(), addDays(oneAmInBangkok, 0));
    expect(fromUtc.startDate).toBe('2026-11-06');
    expect(window.startDate).toBe('2026-11-13');
  });
});
