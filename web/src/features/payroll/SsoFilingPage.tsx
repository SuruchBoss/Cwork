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
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api, saveBlob } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatMoney, formatMonthYear, formatYear } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type { SsoFilingSheet } from '@/types/api';

/**
 * The month's social security filing, สปส.1-10 (CW-048): the form's data, worked
 * out from the approved and paid runs with the rules the form states. It is not
 * the file the Social Security Office's e-Services takes for upload; that
 * layout is only handed out inside e-Services.
 */
export default function SsoFilingPage() {
  const t = useT();
  const now = new Date();
  // The month most likely being filed: the one that just ended.
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [year, setYear] = useState(last.getFullYear());
  const [month, setMonth] = useState(last.getMonth() + 1);

  const sheet = useQuery({
    queryKey: qk.ssoFiling(year, month),
    queryFn: () =>
      api.get<SsoFilingSheet>('/payroll/reports/sso-filing', {
        query: { year: String(year), month: String(month) },
      }),
    retry: false,
  });

  // The server refuses a file while anyone cannot be put on the form, and
  // records each download in the audit log.
  const download = useMutation({
    mutationFn: async (format: 'csv' | 'xlsx' | 'pdf') => {
      const { blob, filename } = await api.download('/payroll/reports/sso-filing', {
        query: { year: String(year), month: String(month), format },
      });
      saveBlob(blob, filename);
    },
  });

  const data = sheet.data;
  const blocked = Boolean(data && data.problems.length > 0);
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="page">
      <PageHeader
        title={t('Social security filing')}
        description={t(
          'The month’s contributions for form สปส.1-10, one row for each insured person',
        )}
        actions={
          <Link to="/payroll" className="btn btn--secondary btn--sm">
            ← {t('Back')}
          </Link>
        }
      />

      <div className="alert alert--info" role="note">
        {t(
          'This is the form’s data, to read, check against your own file and type or paste into e-Services. It is not the upload file e-Services takes: that layout is only given inside e-Services.',
        )}
      </div>

      <Card
        title={t('Month')}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => download.mutate('pdf')}
              loading={download.isPending && download.variables === 'pdf'}
              disabled={!data || blocked}
            >
              {t('Download PDF')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => download.mutate('xlsx')}
              loading={download.isPending && download.variables === 'xlsx'}
              disabled={!data || blocked}
            >
              {t('Download Excel')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => download.mutate('csv')}
              loading={download.isPending && download.variables === 'csv'}
              disabled={!data || blocked}
            >
              {t('Download CSV')}
            </Button>
          </>
        }
      >
        <div className="toolbar">
          <Field label={t('Month')}>
            <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {formatMonthYear(year, m).replace(/\s?\d+$/, '')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('Year')}>
            <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {formatYear(y)}
                </option>
              ))}
            </Select>
          </Field>
          {data && (
            <p className="subtle">
              {t('Rate {rate}%, wage from {floor} to {ceiling} a month', {
                rate: data.ratePercent,
                floor: formatMoney(data.floor),
                ceiling: formatMoney(data.ceiling),
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

      {data && blocked && (
        <div className="alert alert--danger" role="alert">
          <strong>
            {t('Cannot be put on the form: {count}', { count: data.problems.length })}
          </strong>
          <ul>
            {data.problems.map((problem) => (
              <li key={`${problem.employeeId}:${problem.code}`}>
                {problem.employeeCode} {problem.name}:{' '}
                {t(problemLabels[problem.code] ?? problem.code)}
              </li>
            ))}
          </ul>
          {t('Fix these on the employee’s page. Nothing can be downloaded until they are.')}
        </div>
      )}

      <Card title={t('Insured people')} flush>
        {sheet.isLoading ? (
          <TableSkeleton rows={4} columns={7} />
        ) : sheet.isError ? (
          <MonthError error={sheet.error} onRetry={() => void sheet.refetch()} />
        ) : data ? (
          <FilingTable sheet={data} />
        ) : null}
      </Card>
    </div>
  );
}

const problemLabels: Record<string, string> = {
  NO_NATIONAL_ID: 'No national ID number is recorded',
  NATIONAL_ID_NOT_13_DIGITS: 'The national ID number is not 13 digits',
  NO_SOCIAL_SECURITY_CARD:
    'A foreign worker is filed under the social security card number, and none is recorded',
  SOCIAL_SECURITY_CARD_NOT_DIGITS: 'The social security card number is not digits only',
};

/** A month that cannot be filed yet is said in words; anything else is the server's own message. */
function MonthError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  if (error instanceof ApiError && error.code === 'NO_PAYROLL_FOR_MONTH') {
    return (
      <EmptyState
        icon="฿"
        title={t('No payroll for this month')}
        description={t('There is no pay period for it yet.')}
      />
    );
  }
  if (error instanceof ApiError && error.code === 'SSO_MONTH_NOT_FINISHED') {
    return (
      <EmptyState
        icon="…"
        title={t('This month is not finished')}
        description={t(
          'Every pay period of the month needs an approved or paid run, and both halves of a half-month pay. {reason}',
          { reason: error.message },
        )}
      />
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}

function FilingTable({ sheet }: { sheet: SsoFilingSheet }) {
  const t = useT();
  if (sheet.rows.length === 0 && sheet.problems.length === 0) {
    return (
      <EmptyState
        icon="✓"
        title={t('Nobody was insured in {month}', {
          month: formatMonthYear(sheet.year, sheet.month),
        })}
        description={t('No approved or paid payslip counted for social security.')}
      />
    );
  }
  const money = (value: string) => formatMoney(Number(value));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th className="num">{t('Row no.')}</th>
            <th style={{ width: 150 }}>
              {t('ID number')}
              <div className="subtle">{t('(foreign worker: social security card number)')}</div>
            </th>
            <th>{t('Name')}</th>
            <th className="num">{t('Wage paid')}</th>
            <th className="num">{t('Employee contribution')}</th>
            <th className="num">{t('Employer contribution')}</th>
            <th className="num">{t('Deducted on the payslips')}</th>
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row) => (
            <tr key={row.employeeId}>
              <td className="num">{row.sequence}</td>
              <td className="mono">{row.identifier}</td>
              <td>
                {row.name}
                <div className="subtle">{row.employeeCode}</div>
              </td>
              <td className="num">{money(row.wage)}</td>
              <td className="num" style={{ fontWeight: 600 }}>
                {money(row.employee)}
              </td>
              <td className="num" style={{ fontWeight: 600 }}>
                {money(row.employer)}
              </td>
              <td className="num">
                {money(row.deductedEmployee)}
                {row.differsFromPayslips && (
                  <div>
                    <Badge tone="warning">{t('Differs from the form')}</Badge>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              {t('Total, {count} insured', { count: sheet.totals.insured })}
            </th>
            <td className="num">{money(sheet.totals.wage)}</td>
            <td className="num">{money(sheet.totals.employee)}</td>
            <td className="num">{money(sheet.totals.employer)}</td>
            <td className="num">{money(sheet.totals.deductedEmployee)}</td>
          </tr>
          <tr>
            <th scope="row" colSpan={4}>
              {t('Contributions to send in all')}
            </th>
            <td className="num" colSpan={2} style={{ fontWeight: 600 }}>
              {money(sheet.totals.total)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
