import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { qk } from '@/app/query-client';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Person,
  Progress,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';

interface ReviewCycle {
  id: string;
  code: string;
  name: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  kpiWeight: number;
  competencyWeight: number;
  _count: { goals: number; reviews: number };
}

interface TeamProgressRow {
  employee: { id: string; employeeCode: string; firstNameTh: string; lastNameTh: string };
  goalCount: number;
  totalWeight: string;
  weightedScore: number;
  isWeightValid: boolean;
  scoredGoals: number;
  unscoredGoals: number;
}

export default function PerformancePage() {
  const canAny = useAuthStore((s) => s.canAny);
  const t = useT();
  const [cycleId, setCycleId] = useState('');

  const cycles = useQuery({
    queryKey: qk.reviewCycles,
    queryFn: () => api.get<ReviewCycle[]>('/performance/cycles'),
  });

  useEffect(() => {
    if (!cycleId && cycles.data?.length) setCycleId(cycles.data[0].id);
  }, [cycles.data, cycleId]);

  const teamProgress = useQuery({
    queryKey: qk.teamProgress(cycleId),
    queryFn: () => api.get<TeamProgressRow[]>(`/performance/cycles/${cycleId}/team-progress`),
    enabled: Boolean(cycleId) && canAny(P.KPI_MANAGE_TEAM),
  });

  const cycle = cycles.data?.find((c) => c.id === cycleId);

  return (
    <div className="page">
      <PageHeader title={t('Performance / KPI')} description={t('Review cycles and team progress')} />

      {cycles.isLoading ? (
        <Card flush>
          <TableSkeleton rows={3} columns={4} />
        </Card>
      ) : cycles.isError ? (
        <Card>
          <ErrorState error={cycles.error} onRetry={() => void cycles.refetch()} />
        </Card>
      ) : cycles.data && cycles.data.length > 0 ? (
        <>
          <Card>
            <div className="toolbar">
              <Field label={t('Review cycle')}>
                <Select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                  {cycles.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          {cycle && (
            <div className="grid grid--4">
              <Stat
                label={t('Review period')}
                value={formatDate(cycle.periodStart, 'MMM yyyy')}
                hint={t('to {date}', { date: formatDate(cycle.periodEnd) })}
              />
              <Stat
                label={t('Cycle status')}
                value={<Badge tone={statusTone(cycle.status)}>{cycle.status}</Badge>}
              />
              <Stat label={t('KPI goals')} value={cycle._count.goals} />
              <Stat
                label={t('Score weighting')}
                value={`${cycle.kpiWeight}/${cycle.competencyWeight}`}
                hint={t('KPI / competency')}
              />
            </div>
          )}

          {canAny(P.KPI_MANAGE_TEAM) && (
            <Card title={t('Team progress')} flush>
              {teamProgress.isLoading ? (
                <TableSkeleton rows={4} columns={4} />
              ) : teamProgress.data && teamProgress.data.length > 0 ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('Employee')}</th>
                        <th className="num">{t('KPI count')}</th>
                        <th className="num">{t('Total weight')}</th>
                        <th style={{ width: 220 }}>{t('Weighted score')}</th>
                        <th>{t('Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamProgress.data.map((row) => (
                        <tr key={row.employee.id}>
                          <td>
                            <Person
                              name={`${row.employee.firstNameTh} ${row.employee.lastNameTh}`}
                              meta={row.employee.employeeCode}
                            />
                          </td>
                          <td className="num">{row.goalCount}</td>
                          <td className="num">
                            {formatNumber(row.totalWeight, 0)}%
                            {!row.isWeightValid && row.goalCount > 0 && (
                              <div>
                                <Badge tone="warning">{t('Must total 100%')}</Badge>
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="row" style={{ gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <Progress value={row.weightedScore} max={150} />
                              </div>
                              <span className="num" style={{ fontWeight: 600, minWidth: 48 }}>
                                {formatNumber(row.weightedScore, 1)}%
                              </span>
                            </div>
                          </td>
                          <td className="subtle">
                            {t('Scored {scored}/{count}', {
                              scored: row.scoredGoals,
                              count: row.goalCount,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon="◈"
                  title={t('No team KPI data yet')}
                  description={t('Set goals for your reports first')}
                />
              )}
            </Card>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            icon="◈"
            title={t('No review cycles yet')}
            description={t('Create a review cycle to start setting KPIs')}
          />
        </Card>
      )}
    </div>
  );
}
