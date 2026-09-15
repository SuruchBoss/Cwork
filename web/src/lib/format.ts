import { differenceInYears, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';

const locales = { th };

export function formatDate(value: string | Date | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, pattern, { locale: locales.th });
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
  return formatDistanceToNowStrict(date, { addSuffix: true, locale: locales.th });
}

/** API decimals arrive as strings to avoid float drift; format, don't compute. */
export function formatMoney(
  value: string | number | null | undefined,
  currency = 'THB',
): string {
  if (value === null || value === undefined) return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: string | number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes === 0) return '0 ชม.';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const mins = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';
  if (hours === 0) return `${sign}${mins} นาที`;
  if (mins === 0) return `${sign}${hours} ชม.`;
  return `${sign}${hours} ชม. ${mins} นาที`;
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
  return years < 1 ? 'น้อยกว่า 1 ปี' : `${years} ปี`;
}

/** Today in `yyyy-MM-dd`, matching the API's date-only fields. */
export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function isoDate(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}
