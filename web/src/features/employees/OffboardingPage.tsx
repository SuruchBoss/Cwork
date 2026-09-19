import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Person,
  Progress,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';

interface Resignation {
  id: string;
  separationType: string;
  submittedAt: string;
  requestedLastWorkingDate: string;
  agreedLastWorkingDate: string | null;
  noticeDays: number | null;
  reasonCategory: string | null;
  reason: string | null;
  status: string;
  employee: {
    id: string;
    employeeCode: string;
    firstNameTh: string;
    lastNameTh: string;
    department: { name: string } | null;
    position: { title: string } | null;
  };
  _count: { tasks: number };
}

interface ResignationDetail extends Resignation {
  tasks: Array<{ id: string; title: string; category: string; status: string; dueDate: string | null }>;
}

export default function OffboardingPage() {
  const queryClient = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const t = useT();
  const [status, setStatus] = useState('PENDING');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resignations = useQuery({
    queryKey: ['offboarding', status],
    queryFn: () =>
      api.get<Resignation[]>('/offboarding/resignations', { query: { status: status || undefined } }),
  });

  const detail = useQuery({
    queryKey: ['offboarding', 'detail', expandedId],
    queryFn: () => api.get<ResignationDetail>(`/offboarding/resignations/${expandedId}`),
    enabled: Boolean(expandedId),
  });

  const completeTask = useMutation({
    mutationFn: (taskId: string) => api.patch(`/offboarding/tasks/${taskId}/complete`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['offboarding'] }),
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      api.post(`/offboarding/resignations/${input.id}/decide`, { decision: input.decision }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['offboarding'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  return (
    <div className="page">
      <PageHeader
        title={t('Offboarding')}
        description={t('Resignation requests and the handover checklist before the last working day')}
      />

      <Card>
        <div className="toolbar">
          <Field label={t('Status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">{t('Pending')}</option>
              <option value="APPROVED">{t('Approved')}</option>
              <option value="COMPLETED">{t('Left')}</option>
              <option value="">{t('All')}</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card flush>
        {resignations.isLoading ? (
          <TableSkeleton rows={4} columns={6} />
        ) : resignations.isError ? (
          <ErrorState error={resignations.error} onRetry={() => void resignations.refetch()} />
        ) : resignations.data && resignations.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Employee')}</th>
                  <th>{t('Position')}</th>
                  <th>{t('Last working day')}</th>
                  <th className="num">{t('Notice')}</th>
                  <th>{t('Status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resignations.data.map((resignation) => (
                  <tr key={resignation.id}>
                    <td>
                      <Person
                        name={`${resignation.employee.firstNameTh} ${resignation.employee.lastNameTh}`}
                        meta={resignation.employee.employeeCode}
                      />
                    </td>
                    <td>
                      {resignation.employee.position?.title ?? '—'}
                      <div className="subtle">{resignation.employee.department?.name}</div>
                    </td>
                    <td>
                      {formatDate(
                        resignation.agreedLastWorkingDate ?? resignation.requestedLastWorkingDate,
                      )}
                      {resignation.reasonCategory && (
                        <div className="subtle">{resignation.reasonCategory}</div>
                      )}
                    </td>
                    <td className="num">
                      {resignation.noticeDays ?? '—'} {t('days')}
                    </td>
                    <td>
                      <Badge tone={statusTone(resignation.status)}>{resignation.status}</Badge>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setExpandedId(expandedId === resignation.id ? null : resignation.id)
                          }
                        >
                          {expandedId === resignation.id ? t('Hide') : t('Checklist')}
                        </Button>
                        {can(P.OFFBOARDING_MANAGE) && resignation.status === 'PENDING' && (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={decide.isPending && decide.variables?.id === resignation.id}
                            onClick={() => decide.mutate({ id: resignation.id, decision: 'APPROVE' })}
                          >
                            {t('Approve')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="↪" title={t('No resignations match')} />
        )}
      </Card>

      {expandedId && detail.data && (
        <Card
          title={t('Handover checklist — {name}', {
            name: `${detail.data.employee.firstNameTh} ${detail.data.employee.lastNameTh}`,
          })}
        >
          <div className="stack">
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Progress
                  value={detail.data.tasks.filter((t) => t.status === 'DONE').length}
                  max={detail.data.tasks.length || 1}
                />
              </div>
              <span className="subtle">
                {t('{done} / {total} done', {
                  done: detail.data.tasks.filter((task) => task.status === 'DONE').length,
                  total: detail.data.tasks.length,
                })}
              </span>
            </div>

            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {detail.data.tasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.title}</td>
                      <td>
                        <Badge tone="neutral">{task.category}</Badge>
                      </td>
                      <td className="subtle">{formatDate(task.dueDate)}</td>
                      <td>
                        <Badge tone={task.status === 'DONE' ? 'success' : 'warning'}>
                          {task.status}
                        </Badge>
                      </td>
                      <td>
                        {task.status !== 'DONE' && can(P.OFFBOARDING_MANAGE) && (
                          <Button
                            size="sm"
                            loading={completeTask.isPending && completeTask.variables === task.id}
                            onClick={() => completeTask.mutate(task.id)}
                          >
                            {t('Mark done')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
