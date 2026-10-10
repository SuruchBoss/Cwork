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
        'A public holiday fell on the weekly day off ({dates}): add the substitute day to the holiday calendar for it to be paid',
        { dates: dates() },
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
        {
          hours: Number(p.hours ?? 0),
          rates: String(p.rates ?? '')
            .split(',')
            .map((rate) => rate.trim())
            .filter(Boolean)
            .map((rate) => {
              const [type, multiplier] = rate.split(' ');
              const label = overtimeTypeLabels[type];
              return `${label ? t(label) : type} ${multiplier?.replace('x', '×') ?? ''}`.trim();
            })
            .join(', '),
        },
      );
    case 'ADVANCE_CARRIED_OVER':
      return t(
        "Advances of {amount} were more than this period could take back; the rest comes off the next pay run. Taking it from a later period may count as a deduction from wages under section 76, which needs the employee's written consent and has a limit; that has not been checked yet",
        { amount: money(p.amount) },
      );
    default:
      return warning.code;
  }
}
