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

export function formatDate(value: string | Date | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, pattern, { locale: dateFnsLocale() });
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
