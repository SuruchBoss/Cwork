import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { qk } from '@/app/query-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type { AuditLogEntry, Page } from '@/types/api';

const ACTION_TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  READ: 'neutral',
  LOGIN: 'brand',
  LOGIN_FAILED: 'danger',
  LOGOUT: 'neutral',
  APPROVE: 'success',
  REJECT: 'danger',
  EXPORT: 'warning',
  PERMISSION_CHANGE: 'warning',
  AI_TOOL_CALL: 'brand',
};

export default function AuditPage() {
  const t = useT();
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  const logs = useQuery({
    queryKey: qk.auditLogs({ action, entityType, page }),
    queryFn: () =>
      api.get<Page<AuditLogEntry>>('/audit-logs', {
        query: {
          action: action || undefined,
          entityType: entityType || undefined,
          page,
          limit: 50,
        },
      }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="page">
      <PageHeader
        title={t('Activity log')}
        description={t('Append-only — the database refuses edits and deletes')}
      />

      <Card>
        <div className="toolbar">
          <Field label={t('Action type')}>
            <Select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('All')}</option>
              {Object.keys(ACTION_TONES).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('Entity type')}>
            <Input
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
              placeholder={t('e.g. Employee, PayrollRun')}
            />
          </Field>
        </div>
      </Card>

      <Card flush>
        {logs.isLoading ? (
          <TableSkeleton rows={10} columns={5} />
        ) : logs.isError ? (
          <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
        ) : logs.data && logs.data.data.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Time')}</th>
                    <th>{t('User')}</th>
                    <th>{t('Action')}</th>
                    <th>{t('Entity')}</th>
                    <th>{t('Details')}</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.data.map((entry) => (
                    <tr key={entry.id}>
                      <td className="subtle" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td>{entry.actor?.email ?? t('System')}</td>
                      <td>
                        <Badge tone={ACTION_TONES[entry.action] ?? 'neutral'}>{entry.action}</Badge>
                      </td>
                      <td className="mono">{entry.entityType}</td>
                      <td className="subtle">{entry.summary ?? '—'}</td>
                      <td className="mono subtle">{entry.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row row--between" style={{ padding: 12 }}>
              <span className="subtle">
                {t('{total} entries', { total: formatNumber(logs.data.meta.total) })} ·{' '}
                {t('Page {page} of {total}', {
                  page: logs.data.meta.page,
                  total: logs.data.meta.totalPages,
                })}
              </span>
              <div className="row" style={{ gap: 6 }}>
                <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t('Previous')}
                </Button>
                <Button
                  size="sm"
                  disabled={!logs.data.meta.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('Next')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState icon="⎙" title={t('No log entries match')} />
        )}
      </Card>
    </div>
  );
}
