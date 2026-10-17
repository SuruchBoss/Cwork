// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { daysLeft, windowOf } from './document-expiry';

describe('document expiry windows (CW-073)', () => {
  it('counts calendar days, across a month and a year end', () => {
    expect(daysLeft('2026-10-17', '2026-10-17')).toBe(0);
    expect(daysLeft('2026-11-15', '2026-10-17')).toBe(29);
    expect(daysLeft('2027-01-15', '2026-12-31')).toBe(15);
    expect(daysLeft('2026-10-16', '2026-10-17')).toBe(-1);
    expect(daysLeft('2026-11-15T00:00:00.000Z', '2026-10-17')).toBe(29);
  });

  it('puts a document in one window at a time, with the edges where the ticket says', () => {
    expect(windowOf(91)).toBeNull();
    expect(windowOf(90)).toBe(90);
    expect(windowOf(61)).toBe(90);
    expect(windowOf(60)).toBe(60);
    expect(windowOf(31)).toBe(60);
    expect(windowOf(30)).toBe(30);
    expect(windowOf(29)).toBe(30);
    expect(windowOf(0)).toBe(30);
    expect(windowOf(-1)).toBe(0);
    expect(windowOf(-400)).toBe(0);
  });
});
