// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * A scanner number bound to an employee for a period (CW-109).
 *
 * Days are `yyyy-MM-dd` text, which orders the same as the calendar. A missing
 * `validFrom` means from the beginning, a missing `validTo` means still in use.
 */
export interface ScannerBinding {
  employeeId: string;
  scannerNumber: string;
  validFrom: string | null;
  validTo: string | null;
}

/** Whether the binding counts the day to its employee. */
export function holdsDay(binding: Pick<ScannerBinding, 'validFrom' | 'validTo'>, day: string) {
  return (
    (binding.validFrom === null || binding.validFrom <= day) &&
    (binding.validTo === null || binding.validTo >= day)
  );
}

/** Whose a scanner number is on a day, or null: a day outside every period belongs to no one. */
export function ownerOn(
  bindings: readonly ScannerBinding[],
  scannerNumber: string,
  day: string,
): string | null {
  return (
    bindings.find((b) => b.scannerNumber === scannerNumber && holdsDay(b, day))?.employeeId ?? null
  );
}

type Span = Pick<ScannerBinding, 'validFrom' | 'validTo'>;

/** Whether two periods share a day (both ends included). */
export function periodsOverlap(a: Span, b: Span): boolean {
  const startsBeforeBEnds = a.validFrom === null || b.validTo === null || a.validFrom <= b.validTo;
  const endsAfterBStarts = a.validTo === null || b.validFrom === null || a.validTo >= b.validFrom;
  return startsBeforeBEnds && endsAfterBStarts;
}

/** The day after a `yyyy-MM-dd` day. */
export function dayAfter(day: string): string {
  const next = new Date(`${day}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * The first day a number can start to count to someone new without meeting an
 * earlier period of it: the beginning when it has had no one, otherwise the day
 * after its latest end. A number still in use has no such day (undefined).
 */
export function earliestFreeStart(periods: readonly Span[]): string | null | undefined {
  if (periods.length === 0) return null;
  if (periods.some((p) => p.validTo === null)) return undefined;
  const latest = periods.map((p) => p.validTo as string).sort()[periods.length - 1];
  return dayAfter(latest);
}
