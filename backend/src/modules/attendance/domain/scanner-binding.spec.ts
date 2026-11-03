// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  dayAfter,
  earliestFreeStart,
  holdsDay,
  ownerOn,
  periodsOverlap,
  type ScannerBinding,
} from './scanner-binding';

const bind = (
  employeeId: string,
  validFrom: string | null,
  validTo: string | null,
  scannerNumber = '12',
): ScannerBinding => ({ employeeId, scannerNumber, validFrom, validTo });

describe('a scanner number bound for a period', () => {
  describe('holdsDay', () => {
    it('counts both ends of the period', () => {
      const period = bind('a', '2026-03-01', '2026-03-31');
      expect(holdsDay(period, '2026-03-01')).toBe(true);
      expect(holdsDay(period, '2026-03-31')).toBe(true);
      expect(holdsDay(period, '2026-02-28')).toBe(false);
      expect(holdsDay(period, '2026-04-01')).toBe(false);
    });

    it('counts every day from the beginning when there is no start, and every later day when no end', () => {
      expect(holdsDay(bind('a', null, null), '1999-01-01')).toBe(true);
      expect(holdsDay(bind('a', null, '2026-03-31'), '2020-01-01')).toBe(true);
      expect(holdsDay(bind('a', '2026-03-01', null), '2030-01-01')).toBe(true);
    });
  });

  describe('ownerOn', () => {
    const bindings = [bind('first', null, '2026-05-31'), bind('second', '2026-06-01', null)];

    it('hands a number to whoever holds the day', () => {
      expect(ownerOn(bindings, '12', '2026-05-31')).toBe('first');
      expect(ownerOn(bindings, '12', '2026-06-01')).toBe('second');
    });

    it('leaves a day outside every period, or another number, to no one', () => {
      expect(ownerOn([bind('a', '2026-03-01', '2026-03-31')], '12', '2026-04-01')).toBeNull();
      expect(ownerOn(bindings, '99', '2026-06-01')).toBeNull();
    });
  });

  describe('periodsOverlap', () => {
    it('sees a shared day, even a single one at the ends', () => {
      expect(
        periodsOverlap(bind('a', '2026-03-01', '2026-03-31'), bind('b', '2026-03-31', null)),
      ).toBe(true);
      expect(periodsOverlap(bind('a', null, null), bind('b', '2030-01-01', '2030-01-02'))).toBe(
        true,
      );
    });

    it('lets one period end the day before the next starts', () => {
      expect(periodsOverlap(bind('a', null, '2026-03-31'), bind('b', '2026-04-01', null))).toBe(
        false,
      );
      expect(
        periodsOverlap(bind('b', '2026-04-01', '2026-04-30'), bind('a', null, '2026-03-31')),
      ).toBe(false);
    });
  });

  describe('earliestFreeStart', () => {
    it('is the beginning for a number nobody has had', () => {
      expect(earliestFreeStart([])).toBeNull();
    });

    it('is the day after the latest end', () => {
      expect(
        earliestFreeStart([bind('a', null, '2026-03-31'), bind('b', '2026-04-01', '2026-08-31')]),
      ).toBe('2026-09-01');
    });

    it('is nothing for a number still in use', () => {
      expect(earliestFreeStart([bind('a', null, null)])).toBeUndefined();
    });
  });

  it('adds a day across a month and a year end', () => {
    expect(dayAfter('2026-02-28')).toBe('2026-03-01');
    expect(dayAfter('2026-12-31')).toBe('2027-01-01');
  });
});
