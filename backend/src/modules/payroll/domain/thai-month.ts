// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/** Thai month names, January first. */
export const MONTHS_TH = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

/** "ตุลาคม 2569": the month name and the Buddhist-era year, as HR writes it. */
export function thaiMonthYear(year: number, month: number): string {
  return `${MONTHS_TH[month - 1] ?? month} ${year + 543}`;
}
