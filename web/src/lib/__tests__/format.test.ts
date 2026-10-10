// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest';
import { useUiStore } from '@/stores/ui.store';
import {
  formatDate,
  formatDateTime,
  formatMinutes,
  formatMoney,
  formatMonthYear,
  formatNumber,
  formatPeriod,
  formatYear,
  initials,
  parseThaiDate,
} from '../format';

afterEach(() => useUiStore.setState({ language: 'th' }));

describe('Buddhist-era years in Thai (CW-058)', () => {
  it('writes the year 543 ahead in Thai', () => {
    expect(formatDate('2026-09-28')).toBe('28 ก.ย. 2569');
    expect(formatDateTime(new Date(2026, 9, 1, 9, 5))).toBe('1 ต.ค. 2569 09:05');
    expect(formatYear(2026)).toBe('2569');
  });

  it('keeps the two-digit form and leaves quoted text alone', () => {
    expect(formatDate('2026-09-28', "d/M/yy 'yyyy'")).toBe('28/9/69 yyyy');
  });

  it('labels a pay period as the month it is', () => {
    expect(formatPeriod('2026-08')).toBe('สิงหาคม 2569');
    expect(formatMonthYear(2026, 1)).toBe('มกราคม 2569');
  });

  it('shows any other period code as HR wrote it', () => {
    expect(formatPeriod('2026-13')).toBe('2026-13');
    expect(formatPeriod('BONUS-Q3')).toBe('BONUS-Q3');
    expect(formatPeriod(null)).toBe('—');
  });

  it('reads a date typed day first in the Buddhist era', () => {
    expect(parseThaiDate('1/10/2569')).toBe('2026-10-01');
    expect(parseThaiDate(' 1-10-69 ')).toBe('2026-10-01');
    expect(parseThaiDate('1 ต.ค. 2569')).toBe('2026-10-01');
    expect(parseThaiDate('1 ตุลาคม 2569')).toBe('2026-10-01');
    expect(parseThaiDate('29/2/2567')).toBe('2024-02-29');
  });

  it('takes a Gregorian year or an ISO date as it is', () => {
    expect(parseThaiDate('1/10/2026')).toBe('2026-10-01');
    expect(parseThaiDate('2026-10-01')).toBe('2026-10-01');
  });

  it('refuses what is not a date', () => {
    expect(parseThaiDate('31/2/2569')).toBeNull();
    expect(parseThaiDate('1/13/2569')).toBeNull();
    expect(parseThaiDate('1 ตุลา 2569')).toBeNull();
    expect(parseThaiDate('พรุ่งนี้')).toBeNull();
    expect(parseThaiDate('')).toBeNull();
  });

  it('leaves English Gregorian', () => {
    useUiStore.setState({ language: 'en' });
    expect(formatDate('2026-09-28')).toBe('28 Sep 2026');
    expect(formatYear(2026)).toBe('2026');
    expect(formatPeriod('2026-08')).toBe('August 2026');
  });
});

describe('formatMinutes', () => {
  it('renders hours and minutes', () => {
    expect(formatMinutes(485)).toBe('8 ชม. 5 นาที');
  });

  it('drops the minutes when they are zero', () => {
    expect(formatMinutes(480)).toBe('8 ชม.');
  });

  it('renders minutes only under an hour', () => {
    expect(formatMinutes(45)).toBe('45 นาที');
  });

  it('renders an explicit zero rather than an em dash', () => {
    expect(formatMinutes(0)).toBe('0 ชม.');
  });

  it('renders an em dash when the value is missing', () => {
    expect(formatMinutes(null)).toBe('—');
  });
});

describe('formatMoney', () => {
  it('accepts the string decimals the API returns', () => {
    expect(formatMoney('42900.00')).toContain('42,900.00');
  });

  it('renders an em dash for a missing amount rather than ฿0.00', () => {
    expect(formatMoney(null)).toBe('—');
  });
});

describe('formatNumber', () => {
  it('honours the requested precision', () => {
    expect(formatNumber('6.5', 1)).toBe('6.5');
    expect(formatNumber(6.5, 0)).toBe('7');
  });
});

describe('initials', () => {
  it('takes the first letter of each of the first two words', () => {
    expect(initials('สมชาย ใจดี')).toBe('สใ');
  });

  it('falls back to the first two characters of a single word', () => {
    expect(initials('Somchai')).toBe('So');
  });

  it('handles a missing name', () => {
    expect(initials(null)).toBe('?');
  });
});
