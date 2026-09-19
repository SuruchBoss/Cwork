import { useMutation, useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
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
  Person,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatMinutes, formatTime, isoDate, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { anomalyFlagLabels, attendanceStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { AttendanceRecord, Page } from '@/types/api';

interface FlagExplanation {
  reply: string;
}

/**
 * The assistant's read of a team's flagged attendance punches, for a manager
 * (CW-039).
 *
 * It renders nothing unless the deployment has the assistant switched on, and
 * the caller who reaches the endpoint must be able to see their team's
 * attendance — so it is only offered to a viewer who holds that permission. The
 * model is not called until the manager asks: the panel is a button, and it
 * explains exactly the date window the table is showing.
 */
function FlagExplanationPanel({ from, to }: { from: string; to: string }) {
  const t = useT();
  const status = useQuery({
    queryKey: ['assistant', 'status'],
    queryFn: () => api.get<{ enabled: boolean }>('/assistant/status'),
    staleTime: 5 * 60_000,
  });

  const explain = useMutation({
    mutationFn: () =>
      api.post<FlagExplanation>('/assistant/attendance/flag-explanation', { from, to }),
  });

  if (!status.data?.enabled) return null;

  return (
    <Card
      title={t('Explain with AI')}
      actions={
        <Button
          variant="secondary"
          size="sm"
          loading={explain.isPending}
          onClick={() => explain.mutate()}
        >
          {explain.data ? t('Explain again') : t('Explain the flags')}
        </Button>
      }
    >
      {explain.isError ? (
        <div className="alert alert--danger" role="alert">
          {explain.error instanceof Error ? explain.error.message : t('Could not explain')}
        </div>
      ) : explain.data ? (
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{explain.data.reply}</p>
      ) : (
        <p className="subtle" style={{ margin: 0 }}>
          {t(
            'Groups the records to review by location and flag type, with distances and counts, to help tell a too-tight geofence from something worth checking — every figure comes from real data',
          )}
        </p>
      )}
    </Card>
  );
}

export default function AttendancePage() {
  const t = useT();
  const [from, setFrom] = useState(isoDate(subDays(new Date(), 6)));
  const [to, setTo] = useState(todayIso());
  const [status, setStatus] = useState('');
  const [anomaliesOnly, setAnomaliesOnly] = useState(false);
  const canReadTeam = useAuthStore((s) =>
    s.canAny(P.ATTENDANCE_READ_TEAM, P.ATTENDANCE_READ, P.ATTENDANCE_MANAGE),
  );

  const records = useQuery({
    queryKey: qk.attendanceRecords({ from, to, status, anomaliesOnly }),
    queryFn: () =>
      api.get<Page<AttendanceRecord>>('/attendance/records', {
        query: {
          from,
          to,
          status: status || undefined,
          anomaliesOnly: anomaliesOnly || undefined,
          limit: 100,
          sortOrder: 'desc',
        },
      }),
    placeholderData: (previous) => previous,
  });

  const rows = records.data?.data ?? [];
  const summary = rows.reduce(
    (acc, record) => {
      if (record.status === 'LATE') acc.late += 1;
      if (record.status === 'ABSENT') acc.absent += 1;
      if (record.anomalyFlags.length > 0 || record.isOutsideGeofence) acc.flagged += 1;
      acc.overtimeMinutes += record.approvedOvertimeMinutes;
      return acc;
    },
    { late: 0, absent: 0, flagged: 0, overtimeMinutes: 0 },
  );

  return (
    <div className="page">
      <PageHeader
        title={t('Attendance')}
        description={t('Daily clock-in/out records, with anything that needs review')}
      />

      <div className="grid grid--4">
        <Stat label={t('Records in range')} value={rows.length} />
        <Stat label={t('Late')} value={summary.late} />
        <Stat label={t('Absent')} value={summary.absent} />
        <Stat
          label={t('To review')}
          value={summary.flagged}
          hint={t('Outside the geofence or with an anomaly')}
        />
      </div>

      <Card>
        <div className="toolbar">
          <Field label={t('From')}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t('To')}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label={t('Status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('All')}</option>
              <option value="PRESENT">{t('Present')}</option>
              <option value="LATE">{t('Late')}</option>
              <option value="ABSENT">{t('Absent')}</option>
              <option value="ON_LEAVE">{t('On leave')}</option>
              <option value="INCOMPLETE">{t('Incomplete')}</option>
            </Select>
          </Field>
          <Field label={t('Extra filter')}>
            <label className="row" style={{ gap: 6, paddingTop: 8 }}>
              <input
                type="checkbox"
                checked={anomaliesOnly}
                onChange={(e) => setAnomaliesOnly(e.target.checked)}
              />
              <span>{t('Only records to review')}</span>
            </label>
          </Field>
        </div>
      </Card>

      {canReadTeam && summary.flagged > 0 && <FlagExplanationPanel from={from} to={to} />}

      <Card flush>
        {records.isLoading ? (
          <TableSkeleton rows={8} columns={7} />
        ) : records.isError ? (
          <ErrorState error={records.error} onRetry={() => void records.refetch()} />
        ) : rows.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Employee')}</th>
                  <th>{t('In')}</th>
                  <th>{t('Out')}</th>
                  <th className="num">{t('Worked')}</th>
                  <th className="num">{t('Late')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Review')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDate(record.workDate, 'd MMM')}</td>
                    <td>
                      <Person
                        name={`${record.employee.firstNameTh} ${record.employee.lastNameTh}`}
                        meta={record.employee.department?.name}
                      />
                    </td>
                    <td className="num">{formatTime(record.firstClockInAt)}</td>
                    <td className="num">{formatTime(record.lastClockOutAt)}</td>
                    <td className="num">{formatMinutes(record.workedMinutes)}</td>
                    <td className="num">
                      {record.lateMinutes > 0 ? (
                        <span style={{ color: 'var(--danger)' }}>
                          {record.lateMinutes} {t('min')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <Badge tone={statusTone(record.status)}>
                        {attendanceStatusLabels[record.status] ?? record.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {record.anomalyFlags.map((flag) => (
                          <Badge key={flag} tone="warning">
                            {anomalyFlagLabels[flag] ?? flag}
                          </Badge>
                        ))}
                        {record.lockedAt && <Badge tone="neutral">{t('Locked')}</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="◔" title={t('No attendance records in this range')} />
        )}
      </Card>
    </div>
  );
}
