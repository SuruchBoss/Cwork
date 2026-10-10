// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { formatThaiDate, formatThaiDocumentDate } from './date.util';

describe('Thai dates in text (CW-058)', () => {
  it('writes a short Thai date with the Buddhist-era year, as the console does', () => {
    expect(formatThaiDate('2027-03-01')).toBe('1 มี.ค. 2570');
    expect(formatThaiDate(new Date(Date.UTC(2026, 9, 8)))).toBe('8 ต.ค. 2569');
  });

  it('writes a document date with the month in words', () => {
    expect(formatThaiDocumentDate('2024-01-15')).toBe('15 มกราคม 2567');
    expect(formatThaiDocumentDate(new Date(Date.UTC(2026, 11, 31)))).toBe('31 ธันวาคม 2569');
  });
});
