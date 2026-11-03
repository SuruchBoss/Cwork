// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  anotherPeriodExpected,
  missingOrdinals,
  BIWEEKLY_PERIOD_DAYS,
  biweeklyEnd,
  dayAfter,
  monthCountedFor,
  whyNotNext,
} from './pay-period';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** A year of 14-day periods from a synthetic start, paid five days after each ends. */
function aYear(start = day('2037-01-05'), count = 27) {
  const periods: Array<{ periodStart: Date; periodEnd: Date; payDate: Date }> = [];
  let from = start;
  for (let i = 0; i < count; i++) {
    const periodEnd = biweeklyEnd(from);
    periods.push({
      periodStart: from,
      periodEnd,
      payDate: new Date(periodEnd.getTime() + 5 * 864e5),
    });
    from = dayAfter(periodEnd);
  }
  return periods;
}

describe('14-day pay periods', () => {
  it('last fourteen days, the first and the last included', () => {
    expect(BIWEEKLY_PERIOD_DAYS).toBe(14);
    expect(iso(biweeklyEnd(day('2037-01-05')))).toBe('2037-01-18');
  });

  it('put every day of a year in exactly one period', () => {
    const periods = aYear();
    const first = periods[0]!.periodStart;
    const last = periods[periods.length - 1]!.periodEnd;

    for (let t = first.getTime(); t <= last.getTime(); t += 864e5) {
      const inside = periods.filter(
        (p) => p.periodStart.getTime() <= t && p.periodEnd.getTime() >= t,
      );
      expect(inside).toHaveLength(1);
    }
  });

  it('follow one another with no gap and no overlap', () => {
    const periods = aYear();
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i]!.periodStart.getTime()).toBe(dayAfter(periods[i - 1]!.periodEnd).getTime());
    }
  });

  it('give two months of a year three paydays and the others two', () => {
    const paidIn = new Map<string, number>();
    for (const period of aYear(day('2036-12-22'), 28).filter(
      (p) => p.payDate.getUTCFullYear() === 2037,
    )) {
      const { year, month } = monthCountedFor(period);
      const key = `${year}-${String(month).padStart(2, '0')}`;
      paidIn.set(key, (paidIn.get(key) ?? 0) + 1);
    }

    const counts = [...paidIn.values()];
    expect(paidIn.size).toBe(12);
    expect(counts.filter((n) => n === 3)).toHaveLength(2);
    expect(counts.filter((n) => n === 2)).toHaveLength(10);
  });

  it('count a period that spans two months toward one of them, by the one rule', () => {
    // 2037-01-19 to 2037-02-01 spans January and February, and is paid on 6 February.
    const spanning = aYear().find((p) => iso(p.periodStart) === '2037-01-19')!;

    expect(iso(spanning.periodEnd)).toBe('2037-02-01');
    expect(monthCountedFor(spanning)).toEqual({ year: 2037, month: 2 });
  });

  describe('when a new one may be opened', () => {
    const made = aYear(day('2037-01-05'), 3);

    it('allows any start for the first, which sets the rhythm', () => {
      expect(whyNotNext([], day('2037-03-09'))).toBeNull();
    });

    it('allows the day after the last one ended', () => {
      expect(whyNotNext(made, day('2037-02-16'))).toBeNull();
    });

    it('refuses a start that leaves days between', () => {
      expect(whyNotNext(made, day('2037-02-20'))).toEqual({
        reason: 'GAP_OR_EARLY',
        expected: day('2037-02-16'),
      });
    });

    it('refuses a start inside a period already made', () => {
      expect(whyNotNext(made, day('2037-01-19'))).toMatchObject({ reason: 'OVERLAPS' });
    });
  });
});

describe('Knowing a month has all of its 14-day periods', () => {
  const january = { year: 2040, month: 1 };

  it('expects another while the next payday would fall in the month', () => {
    // Paid 15 January: the next would be 29 January, still January.
    expect(anotherPeriodExpected(day('2040-01-15'), january)).toBe(true);
  });

  it('expects none once the next payday falls in the following month', () => {
    // Paid 29 January: the next would be 12 February.
    expect(anotherPeriodExpected(day('2040-01-29'), january)).toBe(false);
  });

  it('finds a period missing from the order', () => {
    expect(missingOrdinals([1, 2, 3])).toEqual([]);
    expect(missingOrdinals([1, 3])).toEqual([2]);
    expect(missingOrdinals([])).toEqual([]);
  });
});
