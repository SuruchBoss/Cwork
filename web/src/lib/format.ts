// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { differenceInYears, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { enUS, th } from 'date-fns/locale';
import { getLanguage, translate } from '@/lib/i18n';

/** date-fns locale for the current language: Thai month names, or English. */
function dateFnsLocale() {
  return getLanguage() === 'en' ? enUS : th;
}

/** BCP-47 locale for Intl number/currency formatting. */
function intlLocale(): string {
  return getLanguage() === 'en' ? 'en-US' : 'th-TH';
}

/**
 * Thai years are counted in the Buddhist era (CW-058): 2569 is 2026. Only what
 * is displayed changes. Stored values and the API stay Gregorian ISO dates.
 */
export const BUDDHIST_ERA_OFFSET = 543;

/** A Gregorian year as the reader counts it: Buddhist era in Thai, unchanged in English. */
export function formatYear(year: number): string {
  return String(getLanguage() === 'en' ? year : year + BUDDHIST_ERA_OFFSET);
}

/**
 * date-fns has no Buddhist calendar, so in Thai every `y` token outside quotes
 * is replaced by the Buddhist-era year as a quoted literal before formatting.
 * `yy` keeps its meaning of the last two digits.
 */
function displayPattern(pattern: string, date: Date): string {
  if (getLanguage() === 'en') return pattern;
  const year = String(date.getFullYear() + BUDDHIST_ERA_OFFSET);
  let out = '';
  let quoted = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "'") {
      quoted = !quoted;
      out += char;
    } else if (char === 'y' && !quoted) {
      let run = 1;
      while (pattern[i + run] === 'y') run += 1;
      out += `'${run === 2 ? year.slice(-2) : year}'`;
      i += run - 1;
    } else {
      out += char;
    }
  }
  return out;
}

export function formatDate(
  value: string | Date | null | undefined,
  pattern = 'd MMM yyyy',
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, displayPattern(pattern, date), { locale: dateFnsLocale() });
}

/** A calendar month as words: "สิงหาคม 2569" / "August 2026". `month` counts from 1. */
export function formatMonthYear(year: number, month: number): string {
  return formatDate(new Date(year, month - 1, 1), 'LLLL yyyy');
}

/**
 * A pay period's code as the dates it covers. A month, "2026-08", reads
 * "สิงหาคม 2569" / "August 2026"; a half of a semi-monthly month (CW-069),
 * "2026-11-H1", reads "1–15 พฤศจิกายน 2569" and "2026-11-H2" reads
 * "16–30 พฤศจิกายน 2569", the second half running to the month's last day.
 * Any other code is shown as HR wrote it.
 */
export function formatPeriod(code: string | null | undefined): string {
  if (!code) return '—';
  const match = /^(\d{4})-(\d{2})(?:-H([12]))?$/.exec(code);
  if (!match) return code;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return code;
  const monthYear = formatMonthYear(year, month);
  if (!match[3]) return monthYear;
  const lastDay = new Date(year, month, 0).getDate();
  return match[3] === '1' ? `1–15 ${monthYear}` : `16–${lastDay} ${monthYear}`;
}

/** A Date as the API's date-only string, from its local calendar day: 2026-10-01. */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Thai month names and abbreviations, January first, as date-fns writes them. */
const THAI_MONTHS: string[][] = Array.from({ length: 12 }, (_, month) => {
  const date = new Date(2000, month, 1);
  return [format(date, 'LLLL', { locale: th }), format(date, 'LLL', { locale: th })];
});

/**
 * Reads a date typed into a Thai date field (CW-058) and returns it as the
 * API's ISO date, or null if it is not one. Day comes first, the way Thai is
 * written: "1/10/2569", "1-10-69", "1 ต.ค. 2569" and "1 ตุลาคม 2569" all mean
 * 2026-10-01. A year of 2400 or more is Buddhist era; a smaller four-digit year
 * is taken as Gregorian, since nobody types a date from before 1857; two digits
 * are the end of a Buddhist-era year, as Thai offices abbreviate it. An ISO
 * date (2026-10-01) is read as it is.
 */
export function parseThaiDate(text: string): string | null {
  const input = text.trim().replace(/\s+/g, ' ');
  if (!input) return null;

  let day: number;
  let month: number;
  let year: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  const numeric = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2}|\d{4})$/.exec(input);
  const named = /^(\d{1,2}) ?([฀-๿.]+) ?(\d{2}|\d{4})$/.exec(input);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (numeric) {
    [day, month, year] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
  } else if (named) {
    const name = named[2];
    const index = THAI_MONTHS.findIndex((names) => names.includes(name));
    if (index < 0) return null;
    [day, month, year] = [Number(named[1]), index + 1, Number(named[3])];
  } else {
    return null;
  }

  if (!iso) {
    if (year < 100) year += 2500;
    if (year >= 2400) year -= BUDDHIST_ERA_OFFSET;
  }
  const date = new Date(year, month - 1, day);
  // Rejects 31/2 and 13/1, which Date would quietly roll into the next month.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return toIsoDate(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'd MMM yyyy HH:mm');
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'HH:mm');
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return formatDistanceToNowStrict(date, { addSuffix: true, locale: dateFnsLocale() });
}

/** API decimals arrive as strings to avoid float drift; format, don't compute. */
export function formatMoney(
  value: string | number | null | undefined,
  currency = 'THB',
): string {
  if (value === null || value === undefined) return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: string | number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(intlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const lang = getLanguage();
  const hr = translate('hr', lang);
  const min = translate('min', lang);
  if (minutes === 0) return `0 ${hr}`;
  const hours = Math.floor(Math.abs(minutes) / 60);
  const mins = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';
  if (hours === 0) return `${sign}${mins} ${min}`;
  if (mins === 0) return `${sign}${hours} ${hr}`;
  return `${sign}${hours} ${hr} ${mins} ${min}`;
}

export function fullName(person: { firstNameTh: string; lastNameTh: string } | null | undefined): string {
  if (!person) return '—';
  return `${person.firstNameTh} ${person.lastNameTh}`.trim();
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? '') + (parts[1][0] ?? '');
}

export function yearsOfService(hireDate: string | null | undefined): string {
  if (!hireDate) return '—';
  const years = differenceInYears(new Date(), parseISO(hireDate));
  const lang = getLanguage();
  return years < 1 ? translate('less than 1 year', lang) : `${years} ${translate('yr', lang)}`;
}

/** Today in `yyyy-MM-dd`, matching the API's date-only fields. */
export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function isoDate(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}
