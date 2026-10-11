// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { formatDate, formatMoney } from '@/lib/format';
import { overtimeTypeLabels } from '@/lib/labels';
import type { PayslipWarning } from '@/types/api';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * What HR should check on a payslip before approving it (CW-069), said in the
 * reader's language. The server sends a code and its figures; dates arrive as
 * ISO dates and amounts as numbers, and both are written here the way the
 * rest of the console writes them, so a Thai screen shows Buddhist-era dates.
 */
export function describeWarning(warning: PayslipWarning, t: Translate): string {
  const p = warning.params ?? {};
  const money = (value: unknown) => formatMoney(Number(value ?? 0));
  const dates = () =>
    String(p.dates ?? '')
      .split(',')
      .map((date) => date.trim())
      .filter(Boolean)
      .map((date) => formatDate(date, 'd MMM yyyy'))
      .join(', ');
  // "DAY_OFF 1x" or "DAY_OFF 1x → 2x", comma-separated.
  const rates = (value: unknown) =>
    String(value ?? '')
      .split(',')
      .map((rate) => rate.trim())
      .filter(Boolean)
      .map((rate) => {
        const [type, ...multipliers] = rate.split(' ');
        const label = overtimeTypeLabels[type];
        return `${label ? t(label) : type} ${multipliers.join(' ').replace(/x/g, '×')}`.trim();
      })
      .join(', ');

  switch (warning.code) {
    case 'INCOMPLETE_PUNCH_COUNTED':
      return t('Counted {days} day(s) with an incomplete punch as worked: {dates}', {
        days: Number(p.days ?? 0),
        dates: dates(),
      });
    case 'NO_ATTENDANCE_RECORD':
      return t('Not paid for {days} scheduled day(s) with no attendance and no leave: {dates}', {
        days: Number(p.days ?? 0),
        dates: dates(),
      });
    case 'HOLIDAY_ON_DAY_OFF':
      return t(
        'A public holiday fell on the weekly day off ({dates}) and the employee leaves before a working day it could move to: it is owed, so pay it by hand',
        { dates: dates() },
      );
    case 'SUBSTITUTE_HOLIDAY':
      return t(
        'Paid {days} public holiday(s) that fell on the weekly day off on the next working day instead: {dates}. Do not add these days to the holiday calendar as well',
        {
          days: Number(p.days ?? 0),
          dates: String(p.dates ?? '')
            .split(',')
            .map((pair) =>
              pair
                .split('→')
                .map((date) => formatDate(date.trim(), 'd MMM yyyy'))
                .join(' → '),
            )
            .join(', '),
        },
      );
    case 'REST_DAY_RATE_RAISED':
      return t(
        'Paid {hours} h of rest-day work at the least the law allows a daily-wage employee (section 62): {rates}',
        { hours: Number(p.hours ?? 0), rates: rates(p.rates) },
      );
    case 'BELOW_MINIMUM_WAGE':
      return t(
        'The daily rate {rate} is below the minimum wage {minimum} at {location} ({source})',
        {
          rate: money(p.dailyRate),
          minimum: money(p.minimum),
          location: String(p.location ?? ''),
          source: String(p.source ?? ''),
        },
      );
    case 'MINIMUM_WAGE_NOT_SET':
      return t('{location} has no minimum wage set, so the daily rate was not checked', {
        location: String(p.location ?? ''),
      });
    case 'NO_WORK_LOCATION':
      return t(
        'The employee has no work location, so the daily rate was not checked against a minimum wage',
      );
    case 'SSO_OVER_IN_FIRST_HALF':
      return t(
        'The first half deducted {amount} more social security than the whole month owes; it is not refunded automatically',
        { amount: money(p.amount) },
      );
    case 'WITHHOLDING_OVER_IN_FIRST_HALF':
      return t(
        'The first half withheld {amount} more tax than the whole month owes, so this half withholds none',
        { amount: money(p.amount) },
      );
    case 'REST_DAY_WORK_RATE':
      return t(
        'Work on a day off or a holiday ({hours} h at {rates}): check the rate owed to a daily-wage employee',
        { hours: Number(p.hours ?? 0), rates: rates(p.rates) },
      );
    case 'ADVANCE_CARRIED_OVER':
      return t(
        "Advances of {amount} were more than this period could take back; the rest comes off the next pay run. Section 76 of the Labour Protection Act does not list repaying an advance among the deductions from wages it allows, so taking it from a later pay run may need the employee's consent in writing, signed and naming this purpose (section 77); Cwork does not keep that consent, HR must",
        { amount: money(p.amount) },
      );
    default:
      return warning.code;
  }
}
