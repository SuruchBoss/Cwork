// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { qk } from '@/app/query-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Person,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api, saveBlob } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatMoney, formatMonthYear, formatYear } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { useUiStore } from '@/stores/ui.store';
import type { SsoShortfallReport } from '@/types/api';

/**
 * Social security that locked and paid runs deducted against the ceiling in
 * force for their year (CW-075). Read only: it changes no run. It is what HR
 * settles with the Social Security Office for months paid before Cwork knew
 * the new ceiling, not a filing.
 */
export default function SsoShortfallPage() {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  const report = useQuery({
    queryKey: qk.ssoShortfall(year),
    queryFn: () =>
      api.get<SsoShortfallReport>('/payroll/reports/sso-shortfall', {
        query: { year: String(year) },
      }),
  });

  // The server records the download in the audit log.
  const download = useMutation({
    mutationFn: async () => {
      const { blob, filename } = await api.download('/payroll/reports/sso-shortfall', {
        query: { year: String(year), format: 'csv', lang: language },
      });
      saveBlob(blob, filename);
    },
  });

  const data = report.data;
  const hasRows = Boolean(data && data.rows.length > 0);

  return (
    <div className="page">
      <PageHeader
        title={t('Social security shortfall')}
        description={t(
          'What locked and paid runs deducted, against the ceiling in force for their year',
        )}
        actions={
          <Link to="/payroll" className="btn btn--secondary btn--sm">
            ← {t('Back')}
          </Link>
        }
      />

      <div className="alert alert--info" role="note">
        {t(
          'A calculation to help HR settle with the Social Security Office. It is not a filing, and Cwork has changed no paid or locked run.',
        )}
      </div>

      <Card
        title={t('Year')}
        actions={
          <Button
            variant="secondary"
            onClick={() => download.mutate()}
            loading={download.isPending}
            disabled={!hasRows}
          >
            {t('Download CSV')}
          </Button>
        }
      >
        <div className="toolbar">
          <Field label={t('Year')}>
            <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
                <option key={y} value={y}>
                  {formatYear(y)}
                </option>
              ))}
            </Select>
          </Field>
          {data && (
            <p className="subtle">
              {t('Ceiling for {year}: {amount} a month', {
                year: formatYear(data.year),
                amount: formatMoney(data.ceiling),
              })}
            </p>
          )}
        </div>
        {download.isError && (
          <div className="alert alert--danger" role="alert">
            {download.error instanceof ApiError ? download.error.message : t('Could not export')}
          </div>
        )}
      </Card>

      <Card title={t('Differences by employee and month')} flush>
        {report.isLoading ? (
          <TableSkeleton rows={4} columns={7} />
        ) : report.isError ? (
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        ) : data && hasRows ? (
          <ShortfallTable report={data} />
        ) : data && data.payslipsChecked === 0 ? (
          <EmptyState
            icon="฿"
            title={t('No locked or paid run in {year}', { year: formatYear(year) })}
            description={t('There is nothing to compare yet.')}
          />
        ) : (
          <EmptyState
            icon="✓"
            title={t('Nothing owed for {year}', { year: formatYear(year) })}
            description={t(
              'Every locked and paid run deducted what the ceiling for the year gives.',
            )}
          />
        )}
      </Card>
    </div>
  );
}

function ShortfallTable({ report }: { report: SsoShortfallReport }) {
  const t = useT();
  const monthName = (month: number) => formatMonthYear(report.year, month);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('Employee')}</th>
            <th>{t('Month')}</th>
            <th className="num">{t('Social security wage')}</th>
            <th className="num">{t('Deducted')}</th>
            <th className="num">{t('Owed on the ceiling')}</th>
            <th className="num">{t('Employee difference')}</th>
            <th className="num">{t('Employer difference')}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={`${row.employeeId}:${row.month}`}>
              <td>
                <Person name={row.name} meta={row.employeeCode} />
              </td>
              <td>{monthName(row.month)}</td>
              <td className="num">
                {formatMoney(row.wage)}
                {row.wageRebuilt && (
                  <div>
                    <Badge tone="neutral">{t('Worked out from the payslip lines')}</Badge>
                  </div>
                )}
              </td>
              <td className="num">{formatMoney(row.deductedEmployee)}</td>
              <td className="num">{formatMoney(row.owed)}</td>
              <td className="num" style={{ fontWeight: 600 }}>
                {formatMoney(row.employeeDifference)}
              </td>
              <td className="num" style={{ fontWeight: 600 }}>
                {formatMoney(row.employerDifference)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {report.byMonth.map((month) => (
            <tr key={month.month}>
              <th scope="row" colSpan={5}>
                {t('Total for {month}', { month: monthName(month.month) })}
              </th>
              <td className="num">{formatMoney(month.employee)}</td>
              <td className="num">{formatMoney(month.employer)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" colSpan={5}>
              {t('Total for {year}', { year: formatYear(report.year) })}
            </th>
            <td className="num" style={{ fontWeight: 700 }}>
              {formatMoney(report.total.employee)}
            </td>
            <td className="num" style={{ fontWeight: 700 }}>
              {formatMoney(report.total.employer)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
