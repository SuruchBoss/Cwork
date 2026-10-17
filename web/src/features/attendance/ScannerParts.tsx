// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type { ScannerDayStatus, UnmappedNumber, WaitingReason } from './scanner-types';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const TONES: Record<ScannerDayStatus, Tone> = {
  NO_PUNCH: 'neutral',
  UNMAPPED: 'warning',
  COUNTED: 'success',
  WAITING: 'warning',
  DECIDED_USE: 'info',
  DECIDED_IGNORE: 'neutral',
};

/** What a day of a scanner file is, in words HR uses. */
export function ScannerStatusBadge({
  status,
  reason,
  locked,
}: {
  status: ScannerDayStatus;
  reason?: WaitingReason | null;
  /** Payroll has used the day: a waiting one will not be counted, and cannot be decided now. */
  locked?: boolean;
}) {
  const t = useT();
  if (locked && status === 'WAITING') {
    return <Badge tone="neutral">{t('Not counted; the month is paid')}</Badge>;
  }
  const labels: Record<ScannerDayStatus, string> = {
    NO_PUNCH: t('No punch'),
    UNMAPPED: t('Number not registered'),
    COUNTED: t('Counted'),
    WAITING:
      reason === 'ONE_TIME'
        ? t('Waiting: one time only')
        : reason === 'MANY_TIMES'
          ? t('Waiting: three or more times')
          : t('Waiting for HR'),
    DECIDED_USE: t('HR chose the times'),
    DECIDED_IGNORE: t('HR left it out'),
  };
  return <Badge tone={TONES[status]}>{labels[status]}</Badge>;
}

/**
 * Scanner numbers no employee has been given, with how many days of the file
 * each one holds. They are not an error: nothing is counted for them until HR
 * says whose number it is.
 */
export function UnmappedTable({
  items,
  action,
}: {
  items: UnmappedNumber[];
  /** A control for one row, such as choosing the employee the number belongs to. */
  action?: (item: UnmappedNumber) => ReactNode;
}) {
  const t = useT();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('Scanner number')}</th>
            <th>{t('Name on the scanner')}</th>
            <th>{t('Days')}</th>
            <th>{t('From')}</th>
            <th>{t('To')}</th>
            {action && <th>{t('Whose number is it?')}</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.scannerNumber}>
              <td className="mono">{item.scannerNumber}</td>
              <td>{item.name}</td>
              <td>
                {formatNumber(item.daysWithTimes)}
                {item.days !== item.daysWithTimes && (
                  <div className="subtle">
                    {t('{count} days with no punch', {
                      count: formatNumber(item.days - item.daysWithTimes),
                    })}
                  </div>
                )}
              </td>
              <td>{formatDate(item.firstDay)}</td>
              <td>{formatDate(item.lastDay)}</td>
              {action && <td>{action(item)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
