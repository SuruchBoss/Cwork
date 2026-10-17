// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { round2 } from './money.util';

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/**
 * 0 to 999,999 in words; the million is handled by the caller. `higher` says a
 * larger group came before, which makes a closing 1 "เอ็ด" (1,000,001).
 */
function belowMillion(n: number, higher = false): string {
  const digits = String(n).split('').map(Number);
  let out = '';
  digits.forEach((digit, i) => {
    const place = digits.length - 1 - i;
    if (digit === 0) return;
    if (place === 0) {
      // 1 at the end is "เอ็ด" after a tens or higher digit (11, 21, 101), "หนึ่ง" alone.
      out += digit === 1 && (digits.length > 1 || higher) ? 'เอ็ด' : DIGITS[digit];
    } else if (place === 1) {
      out += digit === 1 ? 'สิบ' : digit === 2 ? 'ยี่สิบ' : `${DIGITS[digit]}สิบ`;
    } else {
      out += `${DIGITS[digit]}${PLACES[place]}`;
    }
  });
  return out;
}

/** A whole number in Thai words; every "ล้าน" starts a new group of six places. */
function wholeNumber(n: bigint): string {
  if (n === 0n) return DIGITS[0];
  const million = 1_000_000n;
  const groups: number[] = [];
  for (let rest = n; rest > 0n; rest /= million) groups.unshift(Number(rest % million));
  return groups
    .map((group, i) => {
      if (group === 0 && i !== 0) return '';
      const words =
        group === 0
          ? ''
          : belowMillion(
              group,
              groups.slice(0, i).some((g) => g > 0),
            );
      return i < groups.length - 1 ? `${words}ล้าน` : words;
    })
    .join('');
}

/**
 * An amount of baht in Thai words, the way a form writes it under the figure:
 * "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์", and "…บาทถ้วน" when there are no
 * satang. Works on the decimal string, never a float, and rounds to the satang.
 */
export function bahtText(amount: string | number): string {
  const value = round2(amount);
  const negative = value.isNegative();
  const [whole, fraction = '00'] = value.abs().toFixed(2).split('.');
  const satang = Number(fraction);
  const words = `${wholeNumber(BigInt(whole))}บาท`;
  const tail = satang === 0 ? 'ถ้วน' : `${belowMillion(satang)}สตางค์`;
  return `${negative ? 'ลบ' : ''}${words}${tail}`;
}
