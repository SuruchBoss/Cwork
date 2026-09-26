// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Input,
  PageHeader,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api, saveBlob } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatDate, formatMoney } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { payrollStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { PayrollPeriod, PayrollRun } from '@/types/api';

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const t = useT();
  const canRun = can(P.PAYROLL_RUN);
  const canExport = can(P.PAYROLL_EXPORT);

  const [creating, setCreating] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    periodStart: '',
    periodEnd: '',
    payDate: '',
  });

  const periods = useQuery({
    queryKey: qk.payrollPeriods(),
    queryFn: () => api.get<PayrollPeriod[]>('/payroll/periods'),
  });

  const runs = useQuery({
    queryKey: qk.payrollRuns(),
    queryFn: () => api.get<PayrollRun[]>('/payroll/runs'),
  });

  const createPeriod = useMutation({
    mutationFn: () => api.post<PayrollPeriod>('/payroll/periods', form),
    onSuccess: () => {
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
    },
  });

  const createRun = useMutation({
    mutationFn: (periodId: string) => api.post<PayrollRun>('/payroll/runs', { periodId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['payroll'] }),
  });

  // The server reconciles before it sends anything; a period that does not
  // reconcile is refused with the reason, which surfaces as the error below.
  const exportPeriod = useMutation({
    mutationFn: async (periodId: string) => {
      const { blob, filename } = await api.download(`/payroll/periods/${periodId}/export`);
      saveBlob(blob, filename);
    },
  });

  const latest = runs.data?.[0];

  return (
    <div className="page">
      <PageHeader
        title={t('Payroll')}
        description={t('Pay periods, runs and payslips')}
        actions={
          canRun && (
            <Button variant="primary" onClick={() => setCreating((v) => !v)}>
              + {t('New pay period')}
            </Button>
          )
        }
      />

      {latest && (
        <div className="grid grid--4">
          <Stat label={t('Latest run')} value={latest.runNo} hint={latest.period?.code} />
          <Stat label={t('Employees')} value={latest.employeeCount} />
          <Stat label={t('Total gross')} value={formatMoney(latest.totalGross, latest.currency)} />
          <Stat label={t('Net pay')} value={formatMoney(latest.totalNet, latest.currency)} />
        </div>
      )}

      {creating && (
        <Card title={t('Create a pay period')}>
          <div className="toolbar">
            <Field label={t('Year')}>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('Month')}>
              <Input
                type="number"
                min={1}
                max={12}
                value={form.month}
                onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('Period start')}>
              <Input
                type="date"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              />
            </Field>
            <Field label={t('Period end')}>
              <Input
                type="date"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              />
            </Field>
            <Field label={t('Pay date')}>
              <Input
                type="date"
                value={form.payDate}
                onChange={(e) => setForm({ ...form, payDate: e.target.value })}
              />
            </Field>
            <Button
              variant="primary"
              loading={createPeriod.isPending}
              disabled={!form.periodStart || !form.periodEnd || !form.payDate}
              onClick={() => createPeriod.mutate()}
            >
              {t('Create period')}
            </Button>
          </div>
          {createPeriod.isError && (
            <div className="alert alert--danger" style={{ marginTop: 10 }}>
              {createPeriod.error instanceof Error ? createPeriod.error.message : t('Could not create')}
            </div>
          )}
        </Card>
      )}

      {exportPeriod.isError && (
        <div className="alert alert--danger" role="alert">
          {exportPeriod.error instanceof ApiError ? exportPeriod.error.message : t('Could not export')}
        </div>
      )}

      <Card title={t('Pay periods')} flush>
        {periods.isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : periods.isError ? (
          <ErrorState error={periods.error} onRetry={() => void periods.refetch()} />
        ) : periods.data && periods.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Period')}</th>
                  <th>{t('Dates')}</th>
                  <th>{t('Pay date')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Runs')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {periods.data.map((period) => (
                  <tr key={period.id}>
                    <td className="mono">{period.code}</td>
                    <td>
                      {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
                    </td>
                    <td>{formatDate(period.payDate)}</td>
                    <td>
                      <Badge tone={statusTone(period.status)}>{period.status}</Badge>
                    </td>
                    <td>{period._count?.runs ?? 0}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        {canRun && period.status !== 'CLOSED' && (
                          <Button
                            size="sm"
                            loading={createRun.isPending && createRun.variables === period.id}
                            onClick={() => createRun.mutate(period.id)}
                          >
                            {t('Create run')}
                          </Button>
                        )}
                        {canExport && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={exportPeriod.isPending && exportPeriod.variables === period.id}
                            onClick={() => exportPeriod.mutate(period.id)}
                          >
                            {t('Export CSV')}
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
          <EmptyState
            icon="฿"
            title={t('No pay periods yet')}
            description={t('Create the first period to start running payroll')}
          />
        )}
      </Card>

      <Card title={t('Payroll runs')} flush>
        {runs.data && runs.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Run no.')}</th>
                  <th>{t('Period')}</th>
                  <th className="num">{t('Employees')}</th>
                  <th className="num">{t('Total gross')}</th>
                  <th className="num">{t('Net pay')}</th>
                  <th>{t('Status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.data.map((run) => (
                  <tr key={run.id}>
                    <td className="mono">{run.runNo}</td>
                    <td>{run.period?.code ?? '—'}</td>
                    <td className="num">{run.employeeCount}</td>
                    <td className="num">{formatMoney(run.totalGross, run.currency)}</td>
                    <td className="num">{formatMoney(run.totalNet, run.currency)}</td>
                    <td>
                      <Badge tone={statusTone(run.status)}>
                        {t(payrollStatusLabels[run.status] ?? run.status)}
                      </Badge>
                    </td>
                    <td>
                      <Link to={`/payroll/runs/${run.id}`} className="btn btn--secondary btn--sm">
                        {t('Open')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="฿" title={t('No payroll runs yet')} />
        )}
      </Card>
    </div>
  );
}
