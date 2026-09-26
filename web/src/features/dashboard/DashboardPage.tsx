// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { qk } from '@/app/query-client';
import { Badge, Card, EmptyState, PageHeader, Person, Stat } from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatRelative } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { approvalEntityLabels, leaveStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { ApprovalTask, LeaveRequest, Page, PayrollRun } from '@/types/api';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const canAny = useAuthStore((s) => s.canAny);
  const t = useT();

  const canSeePeople = canAny(P.EMPLOYEE_READ, P.EMPLOYEE_READ_TEAM);
  const canSeeLeave = canAny(P.LEAVE_READ, P.LEAVE_READ_TEAM);
  const canSeePayroll = canAny(P.PAYROLL_READ);

  const approvals = useQuery({
    queryKey: qk.approvalTasks('PENDING'),
    queryFn: () => api.get<ApprovalTask[]>('/approvals/tasks', { query: { status: 'PENDING' } }),
  });

  const headcount = useQuery({
    queryKey: qk.employees({ scope: 'dashboard' }),
    queryFn: () =>
      api.get<Page<unknown>>('/employees', { query: { limit: 1, status: ['ACTIVE', 'PROBATION'] } }),
    enabled: canSeePeople,
  });

  const pendingLeave = useQuery({
    queryKey: qk.leaveRequests({ scope: 'dashboard' }),
    queryFn: () =>
      api.get<Page<LeaveRequest>>('/leave/requests', { query: { status: 'PENDING', limit: 5 } }),
    enabled: canSeeLeave,
  });

  const latestRun = useQuery({
    queryKey: qk.payrollRuns('dashboard'),
    queryFn: () => api.get<PayrollRun[]>('/payroll/runs'),
    enabled: canSeePayroll,
  });

  const run = latestRun.data?.[0];

  return (
    <div className="page">
      <PageHeader
        title={t('Hi {name}', { name: user?.displayName ?? '' })}
        description={t('Your HR tasks for today')}
      />

      <div className="grid grid--4">
        <Stat
          label={t('Your approvals')}
          value={approvals.data?.length ?? '—'}
          hint={approvals.data?.length ? t('Tap to act') : t('Nothing pending')}
        />
        {canSeePeople && (
          <Stat
            label={t('Active employees')}
            value={headcount.data?.meta.total ?? '—'}
            hint={t('Including those on probation')}
          />
        )}
        {canSeeLeave && (
          <Stat
            label={t('Leave requests pending')}
            value={pendingLeave.data?.meta.total ?? '—'}
            hint={t('Across the organisation you can see')}
          />
        )}
        {canSeePayroll && (
          <Stat
            label={t('Latest payroll run')}
            value={run ? run.period?.code ?? run.runNo : '—'}
            hint={run ? formatMoney(run.totalNet, run.currency) : t('No runs yet')}
          />
        )}
      </div>

      <div className="grid grid--2">
        <Card
          title={t('Pending approvals')}
          actions={
            <Link to="/approvals" className="btn btn--ghost btn--sm">
              {t('View all')}
            </Link>
          }
          flush
        >
          {approvals.isLoading ? (
            <div style={{ padding: 16 }} className="muted">
              {t('Loading')}…
            </div>
          ) : approvals.data && approvals.data.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {approvals.data.slice(0, 6).map((task) => {
                    const submitter = task.instance.submittedBy.employee;
                    return (
                      <tr key={task.id}>
                        <td style={{ width: '45%' }}>
                          <Person
                            name={
                              submitter
                                ? `${submitter.firstNameTh} ${submitter.lastNameTh}`
                                : task.instance.submittedBy.email
                            }
                            meta={submitter?.employeeCode}
                          />
                        </td>
                        <td>
                          <Badge tone="warning">
                            {t(
                              approvalEntityLabels[task.instance.entityType] ??
                                task.instance.entityType,
                            )}
                          </Badge>
                        </td>
                        <td className="subtle">{formatRelative(task.instance.submittedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="✓"
              title={t('No approvals waiting')}
              description={t('You are all caught up')}
            />
          )}
        </Card>

        {canSeeLeave && (
          <Card
            title={t('Recent leave requests')}
            actions={
              <Link to="/leave" className="btn btn--ghost btn--sm">
                {t('View all')}
              </Link>
            }
            flush
          >
            {pendingLeave.data && pendingLeave.data.data.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {pendingLeave.data.data.map((request) => (
                      <tr key={request.id}>
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
                          </span>
                        </td>
                        <td className="subtle">
                          {formatDate(request.startDate)} · {Number(request.totalDays)} {t('days')}
                        </td>
                        <td>
                          <Badge tone={statusTone(request.status)}>
                            {t(leaveStatusLabels[request.status] ?? request.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="⏸" title={t('No leave requests pending')} />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
