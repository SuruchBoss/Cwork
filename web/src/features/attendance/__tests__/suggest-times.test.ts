// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { suggestTimes } from '../suggest-times';

describe('suggestTimes', () => {
  it('offers nothing for a day with no times', () => {
    expect(suggestTimes([])).toEqual({ clockIn: '', clockOut: '' });
  });

  it('takes a lone morning scan as the clock-in', () => {
    expect(suggestTimes(['08:15'])).toEqual({ clockIn: '08:15', clockOut: '' });
    expect(suggestTimes(['11:59'])).toEqual({ clockIn: '11:59', clockOut: '' });
  });

  it('takes a lone evening scan as the clock-out', () => {
    expect(suggestTimes(['17:32'])).toEqual({ clockIn: '', clockOut: '17:32' });
    expect(suggestTimes(['15:00'])).toEqual({ clockIn: '', clockOut: '15:00' });
  });

  it('leaves a lone scan around midday for HR to place', () => {
    expect(suggestTimes(['12:00'])).toEqual({ clockIn: '', clockOut: '' });
    expect(suggestTimes(['14:59'])).toEqual({ clockIn: '', clockOut: '' });
  });

  it('takes the first and last of several scans', () => {
    expect(suggestTimes(['08:00', '12:01', '17:30'])).toEqual({
      clockIn: '08:00',
      clockOut: '17:30',
    });
    expect(suggestTimes(['08:00', '17:30'])).toEqual({ clockIn: '08:00', clockOut: '17:30' });
  });
});
