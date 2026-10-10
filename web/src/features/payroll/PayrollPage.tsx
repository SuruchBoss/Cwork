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
  DateInput,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api, saveBlob } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatDate, formatMoney, formatPeriod, formatYear } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { payrollPeriodStatusLabels, payrollStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { PayrollPeriod, PayrollRun } from '@/types/api';

/** Which part of the month a new period pays (CW-069): all of it, or one half. */
type Cycle = 'MONTH' | 'H1' | 'H2';

/**
 * A half's dates are fixed, the 1st to the 15th and the 16th to the month's
 * last day, and the server refuses any other; a month's are a suggestion HR
 * can change. Months count from 1.
 */
function cycleDates(year: number, month: number, cycle: Cycle) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = (d: number) => `${year}-${pad(month)}-${pad(d)}`;
  const last = new Date(year, month, 0).getDate();
  if (cycle === 'H1') return { periodStart: day(1), periodEnd: day(15) };
  if (cycle === 'H2') return { periodStart: day(16), periodEnd: day(last) };
  return { periodStart: day(1), periodEnd: day(last) };
}

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const t = useT();
  const canRun = can(P.PAYROLL_RUN);
  const canExport = can(P.PAYROLL_EXPORT);

  const [creating, setCreating] = useState(false);
  const now = new Date();
  const [cycle, setCycle] = useState<Cycle>('MONTH');
  const [form, setForm] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    ...cycleDates(now.getFullYear(), now.getMonth() + 1, 'MONTH'),
    payDate: '',
  }));
  /** A change of year, month or cycle moves the dates with it. */
  const choose = (next: { year?: number; month?: number; cycle?: Cycle }) => {
    const year = next.year ?? form.year;
    const month = next.month ?? form.month;
    const nextCycle = next.cycle ?? cycle;
    setCycle(nextCycle);
    setForm({ ...form, year, month, ...cycleDates(year, month, nextCycle) });
  };

  const periods = useQuery({
    queryKey: qk.payrollPeriods(),
    queryFn: () => api.get<PayrollPeriod[]>('/payroll/periods'),
  });

  const runs = useQuery({
    queryKey: qk.payrollRuns(),
    queryFn: () => api.get<PayrollRun[]>('/payroll/runs'),
  });

  const createPeriod = useMutation({
    mutationFn: () =>
      api.post<PayrollPeriod>('/payroll/periods', {
        ...form,
        ...(cycle === 'MONTH'
          ? {}
          : { payFrequency: 'SEMI_MONTHLY', half: cycle === 'H1' ? 1 : 2 }),
      }),
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
            <>
              <Link to="/payroll/import" className="btn btn--secondary">
                {t('Import pay before Cwork')}
              </Link>
              <Button variant="primary" onClick={() => setCreating((v) => !v)}>
                + {t('New pay period')}
              </Button>
            </>
          )
        }
      />

      {latest && (
        <div className="grid grid--4">
          <Stat
            label={t('Latest run')}
            value={latest.runNo}
            hint={latest.period ? formatPeriod(latest.period.code) : undefined}
          />
          <Stat label={t('Employees')} value={latest.employeeCount} />
          <Stat label={t('Total gross')} value={formatMoney(latest.totalGross, latest.currency)} />
          <Stat label={t('Net pay')} value={formatMoney(latest.totalNet, latest.currency)} />
        </div>
      )}

      {creating && (
        <Card title={t('Create a pay period')}>
          <div className="toolbar">
            {/* Chosen from lists, so the year reads in the reader's era (CW-058). */}
            <Field label={t('Year')}>
              <Select value={form.year} onChange={(e) => choose({ year: Number(e.target.value) })}>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((year) => (
                  <option key={year} value={year}>
                    {formatYear(year)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Month')}>
              <Select value={form.month} onChange={(e) => choose({ month: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {formatDate(new Date(2000, month - 1, 1), 'LLLL')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t('Pays')}
              hint={cycle === 'MONTH' ? undefined : t('Half-month periods pay daily-wage employees')}
            >
              <Select value={cycle} onChange={(e) => choose({ cycle: e.target.value as Cycle })}>
                <option value="MONTH">{t('The whole month')}</option>
                <option value="H1">{t('First half (1st–15th)')}</option>
                <option value="H2">{t('Second half (16th–month end)')}</option>
              </Select>
            </Field>
            <Field label={t('Period start')}>
              <DateInput
                value={form.periodStart}
                disabled={cycle !== 'MONTH'}
                onChange={(value) => setForm({ ...form, periodStart: value })}
              />
            </Field>
            <Field label={t('Period end')}>
              <DateInput
                value={form.periodEnd}
                disabled={cycle !== 'MONTH'}
                onChange={(value) => setForm({ ...form, periodEnd: value })}
              />
            </Field>
            <Field label={t('Pay date')}>
              <DateInput
                value={form.payDate}
                onChange={(value) => setForm({ ...form, payDate: value })}
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
            <div className="alert alert--danger" role="alert" style={{ marginTop: 10 }}>
              {periodError(createPeriod.error, t)}
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
                  <th>
                    <span className="visually-hidden">{t('Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {periods.data.map((period) => (
                  <tr key={period.id}>
                    <td>{formatPeriod(period.code)}</td>
                    <td>
                      {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
                    </td>
                    <td>{formatDate(period.payDate)}</td>
                    <td>
                      <Badge tone={statusTone(period.status)}>
                        {t(payrollPeriodStatusLabels[period.status] ?? period.status)}
                      </Badge>
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
                  <th>
                    <span className="visually-hidden">{t('Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((run) => (
                  <tr key={run.id}>
                    <td className="mono">{run.runNo}</td>
                    <td>{formatPeriod(run.period?.code)}</td>
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

/** Why a period was refused, in the reader's language for the reasons HR can act on. */
function periodError(
  error: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (error instanceof ApiError) {
    const details = (error.details ?? {}) as Record<string, string>;
    if (error.code === 'PAYROLL_PERIOD_EXISTS') {
      return t('That month already has this period: {period}', {
        period: formatPeriod(details.code),
      });
    }
    if (error.code === 'INVALID_PERIOD_DATES') {
      return t('A half runs from {from} to {to}', {
        from: formatDate(details.periodStart),
        to: formatDate(details.periodEnd),
      });
    }
    return error.message;
  }
  return error instanceof Error ? error.message : t('Could not create');
}
