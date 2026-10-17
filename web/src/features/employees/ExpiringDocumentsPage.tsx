// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type { ExpiringDocument, ExpiringDocumentsReport } from '@/types/api';

const WITHIN = [30, 60, 90] as const;

/**
 * Passports and work permits that have lapsed or will soon (CW-073), for HR.
 * Names and dates only: the API never sends a document number, so there is none
 * to show.
 */
export default function ExpiringDocumentsPage() {
  const t = useT();
  const [within, setWithin] = useState<number>(90);

  const report = useQuery({
    queryKey: ['employees', 'expiring-documents', within],
    queryFn: () =>
      api.get<ExpiringDocumentsReport>('/employees/expiring-documents', { query: { within } }),
  });

  const documentLabel = (document: ExpiringDocument['document']) =>
    document === 'PASSPORT' ? t('Passport') : t('Work permit');

  const when = (item: ExpiringDocument) => {
    if (item.window === 0) return <Badge tone="danger">{t('Expired')}</Badge>;
    return (
      <Badge tone={item.window === 30 ? 'warning' : 'neutral'}>
        {t('{days} days left', { days: item.daysLeft })}
      </Badge>
    );
  };

  return (
    <div className="page">
      <PageHeader
        title={t('Documents expiring')}
        description={t(
          'Passports and work permits that have expired or will soon, for people who are still employed. HR is told once as each document comes within 90, 60 and 30 days.',
        )}
        actions={
          <Link to="/employees" className="btn btn--secondary">
            {t('Back to the directory')}
          </Link>
        }
      />
      <Card flush>
        <div className="row" style={{ flexWrap: 'wrap', gap: 12, padding: '12px 16px' }}>
          <Field label={t('Look ahead')}>
            <Select value={within} onChange={(event) => setWithin(Number(event.target.value))}>
              {WITHIN.map((days) => (
                <option key={days} value={days}>
                  {t('{days} days', { days })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {report.isLoading ? (
          <TableSkeleton columns={4} />
        ) : report.isError ? (
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        ) : !report.data || report.data.items.length === 0 ? (
          <EmptyState
            title={t('Nothing has expired or expires in the next {days} days', { days: within })}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Employee')}</th>
                  <th>{t('Document')}</th>
                  <th>{t('Expires on')}</th>
                  <th>{t('Status')}</th>
                </tr>
              </thead>
              <tbody>
                {report.data.items.map((item) => (
                  <tr key={`${item.employeeId}:${item.document}`}>
                    <td>
                      <Link to={`/employees/${item.employeeId}`}>{item.name}</Link>{' '}
                      <span className="mono subtle">{item.employeeCode}</span>
                    </td>
                    <td>{documentLabel(item.document)}</td>
                    <td>{formatDate(item.expiresOn)}</td>
                    <td>{when(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
