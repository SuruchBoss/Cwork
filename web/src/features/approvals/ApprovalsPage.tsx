// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  TableSkeleton,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { approvalEntityLabels } from '@/lib/labels';
import type { ApprovalTask } from '@/types/api';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const t = useT();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const tasks = useQuery({
    queryKey: qk.approvalTasks('PENDING'),
    queryFn: () => api.get<ApprovalTask[]>('/approvals/tasks', { query: { status: 'PENDING' } }),
  });

  const decide = useMutation({
    mutationFn: (input: { taskId: string; decision: 'APPROVE' | 'REJECT'; comment?: string }) =>
      api.post(`/approvals/tasks/${input.taskId}/decide`, {
        decision: input.decision,
        comment: input.comment,
      }),
    onSuccess: () => {
      setRejecting(null);
      setComment('');
      // A decision changes the underlying entity too, so refresh broadly.
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      void queryClient.invalidateQueries({ queryKey: ['overtime'] });
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  return (
    <div className="page">
      <PageHeader
        title={t('Pending approvals')}
        description={t('Everything waiting on your decision')}
      />

      <Card flush>
        {tasks.isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : tasks.data && tasks.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Submitter')}</th>
                  <th>{t('Type')}</th>
                  <th>{t('Details')}</th>
                  <th>{t('Submitted')}</th>
                  <th style={{ width: 200 }}>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.data.map((task) => {
                  const submitter = task.instance.submittedBy.employee;
                  const isRejecting = rejecting === task.id;
                  const pending = decide.isPending && decide.variables?.taskId === task.id;

                  return (
                    <tr key={task.id}>
                      <td>
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
                          {t(approvalEntityLabels[task.instance.entityType] ?? task.instance.entityType)}
                        </Badge>
                      </td>
                      <td className="subtle">{describeSnapshot(task.instance.snapshot, t)}</td>
                      <td className="subtle">
                        {formatRelative(task.instance.submittedAt)}
                        {task.dueAt && (
                          <div className="subtle">
                            {t('Due {date}', { date: formatDate(task.dueAt) })}
                          </div>
                        )}
                      </td>
                      <td>
                        {isRejecting ? (
                          <div className="stack stack--sm">
                            <Field label={t('Reason for rejection')}>
                              <Textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder={t('Explain to the submitter')}
                                rows={2}
                                // The reject form is revealed on click; move focus to it so a
                                // keyboard user lands on the reason field instead of having to
                                // tab back to it.
                                autoFocus
                              />
                            </Field>
                            <div className="row" style={{ gap: 6 }}>
                              <Button
                                size="sm"
                                variant="danger"
                                loading={pending}
                                disabled={!comment.trim()}
                                onClick={() =>
                                  decide.mutate({
                                    taskId: task.id,
                                    decision: 'REJECT',
                                    comment: comment.trim(),
                                  })
                                }
                              >
                                {t('Confirm rejection')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                                {t('Cancel')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="row" style={{ gap: 6 }}>
                            <Button
                              size="sm"
                              variant="primary"
                              loading={pending}
                              onClick={() => decide.mutate({ taskId: task.id, decision: 'APPROVE' })}
                            >
                              {t('Approve')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRejecting(task.id);
                                setComment('');
                              }}
                            >
                              {t('Reject')}
                            </Button>
                          </div>
                        )}
                      </td>
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

      {decide.isError && (
        <div className="alert alert--danger" role="alert">
          {decide.error instanceof Error ? decide.error.message : t('Could not complete the action')}
        </div>
      )}
    </div>
  );
}

/**
 * The approval snapshot is entity-specific JSON. Rather than a switch per
 * entity type, surface the handful of fields that are meaningful across all of
 * them — the detail lives one click away on the entity itself.
 */
function describeSnapshot(snapshot: Record<string, unknown>, t: Translate): string {
  const parts: string[] = [];

  if (typeof snapshot.leaveTypeCode === 'string') parts.push(String(snapshot.leaveTypeCode));
  if (typeof snapshot.totalDays === 'number') parts.push(`${snapshot.totalDays} ${t('days')}`);
  if (typeof snapshot.hours === 'number') parts.push(`${snapshot.hours} ${t('hr')}`);
  if (typeof snapshot.totalAmount === 'number') {
    parts.push(`${formatNumber(snapshot.totalAmount)} ${t('THB')}`);
  }
  if (typeof snapshot.startDate === 'string') parts.push(formatDate(snapshot.startDate));
  if (typeof snapshot.workDate === 'string') parts.push(formatDate(snapshot.workDate));
  if (typeof snapshot.lastWorkingDate === 'string') {
    parts.push(t('Last day {date}', { date: formatDate(snapshot.lastWorkingDate) }));
  }
  if (typeof snapshot.type === 'string' && !snapshot.leaveTypeCode) parts.push(String(snapshot.type));

  return parts.join(' · ') || '—';
}
