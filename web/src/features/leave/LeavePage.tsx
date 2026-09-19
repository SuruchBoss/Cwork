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
  PageHeader,
  Person,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { leaveStatusLabels, statusTone } from '@/lib/labels';
import type { LeaveRequest, LeaveType, Page } from '@/types/api';

export default function LeavePage() {
  const t = useT();
  const [status, setStatus] = useState('PENDING');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [page, setPage] = useState(1);

  const leaveTypes = useQuery({
    queryKey: qk.leaveTypes,
    queryFn: () => api.get<LeaveType[]>('/leave/types'),
  });

  const requests = useQuery({
    queryKey: qk.leaveRequests({ status, leaveTypeId, page }),
    queryFn: () =>
      api.get<Page<LeaveRequest>>('/leave/requests', {
        query: { status: status || undefined, leaveTypeId: leaveTypeId || undefined, page, limit: 25 },
      }),
    placeholderData: (previous) => previous,
  });

  const onLeaveToday = useQuery({
    queryKey: qk.leaveCalendar(todayIso(), todayIso()),
    queryFn: () =>
      api.get<Array<{ id: string; employee: { firstNameTh: string; lastNameTh: string } }>>(
        '/leave/calendar',
        { query: { from: todayIso(), to: todayIso() } },
      ),
  });

  const counts = requests.data?.meta.total ?? 0;

  return (
    <div className="page">
      <PageHeader title={t('Leave')} description={t('All leave requests you can access')} />

      <div className="grid grid--4">
        <Stat label={t('Matching the filter')} value={counts} />
        <Stat
          label={t('On leave today')}
          value={onLeaveToday.data?.length ?? '—'}
          hint={t('Including pending')}
        />
        <Stat label={t('Active leave types')} value={leaveTypes.data?.length ?? '—'} />
      </div>

      <Card>
        <div className="toolbar">
          <Field label={t('Status')}>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="PENDING">{t('Pending')}</option>
              <option value="APPROVED">{t('Approved')}</option>
              <option value="REJECTED">{t('Rejected')}</option>
              <option value="">{t('All')}</option>
            </Select>
          </Field>
          <Field label={t('Leave type')}>
            <Select
              value={leaveTypeId}
              onChange={(e) => {
                setLeaveTypeId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('All types')}</option>
              {leaveTypes.data?.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card flush>
        {requests.isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : requests.isError ? (
          <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
        ) : requests.data && requests.data.data.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('No.')}</th>
                    <th>{t('Employee')}</th>
                    <th>{t('Type')}</th>
                    <th>{t('Date range')}</th>
                    <th className="num">{t('Days')}</th>
                    <th>{t('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.data.data.map((request) => (
                    <tr key={request.id}>
                      <td className="mono">
                        {request.requestNo}
                        {request.createdViaAssistant && (
                          <div>
                            <Badge tone="brand">{t('Filed via AI assistant')}</Badge>
                          </div>
                        )}
                      </td>
                      <td>
                        <Person
                          name={`${request.employee.firstNameTh} ${request.employee.lastNameTh}`}
                          meta={request.employee.department?.name}
                        />
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <span
                            className="dot"
                            style={{ background: request.leaveType.colorHex }}
                            aria-hidden
                          />
                          {request.leaveType.name}
                          {!request.leaveType.isPaid && (
                            <Badge tone="neutral">{t('Unpaid')}</Badge>
                          )}
                        </span>
                      </td>
                      <td>
                        {formatDate(request.startDate)}
                        {request.startDate !== request.endDate && ` – ${formatDate(request.endDate)}`}
                      </td>
                      <td className="num">{formatNumber(request.totalDays, 1)}</td>
                      <td>
                        <Badge tone={statusTone(request.status)}>
                          {leaveStatusLabels[request.status] ?? request.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {requests.data.meta.totalPages > 1 && (
              <div className="row row--between" style={{ padding: 12 }}>
                <span className="subtle">
                  {t('Page {page} of {total}', {
                    page: requests.data.meta.page,
                    total: requests.data.meta.totalPages,
                  })}
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    {t('Previous')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!requests.data.meta.hasNext}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('Next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon="⏸" title={t('No leave requests match')} />
        )}
      </Card>
    </div>
  );
}
