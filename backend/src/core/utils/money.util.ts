import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

// Banking-style rounding for currency: half-up at 2 decimal places. Thai payroll
// convention rounds satang half-up, so we set it globally rather than per call.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

export function money(
  value: Prisma.Decimal | Decimal | number | string | null | undefined,
): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  return new Decimal(value.toString());
}

/** Rounds to currency precision. Every amount written to the DB goes through this. */
export function round2(value: Decimal | number | string): Decimal {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: Array<Decimal | number | string>): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), new Decimal(0));
}

export function toPrismaDecimal(value: Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(round2(value).toFixed(2));
}

/** Rate math (hours, percentages) keeps 4 decimals before the final rounding. */
export function round4(value: Decimal | number | string): Decimal {
  return money(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function formatMoney(
  value: Decimal | number | string,
  currency = 'THB',
  locale = 'th-TH',
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    Number(round2(value).toFixed(2)),
  );
}

export { Decimal };
