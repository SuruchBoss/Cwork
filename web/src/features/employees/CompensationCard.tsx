// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { qk } from '@/app/query-client';
import { Badge, Button, Card, DateInput, Field, Input, Select } from '@/components/ui';
import { describeWarning } from '@/features/payroll/payslip-warnings';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatDate, formatMoney, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type { EmployeeCompensation, PayslipWarning } from '@/types/api';

type PayBasis = 'SALARY' | 'DAILY';

/**
 * What an employee is paid (CW-069): a monthly salary, or a daily wage paid
 * twice a month. A change is a new record from a date, never an edit of the
 * old one, so payroll for past months keeps the pay it was calculated on.
 */
export function CompensationCard({
  employeeId,
  canManage,
}: {
  employeeId: string;
  canManage: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [warnings, setWarnings] = useState<PayslipWarning[]>([]);

  const history = useQuery({
    queryKey: qk.compensation(employeeId),
    queryFn: () => api.get<EmployeeCompensation[]>(`/payroll/compensation/${employeeId}`),
  });

  const records = history.data ?? [];
  const today = todayIso();
  const current = records.find((record) => day(record.effectiveFrom) <= today) ?? null;
  const upcoming = records
    .filter((record) => day(record.effectiveFrom) > today)
    .sort((a, b) => day(a.effectiveFrom).localeCompare(day(b.effectiveFrom)));
  const earlier = current
    ? records.filter((record) => day(record.effectiveFrom) < day(current.effectiveFrom))
    : [];

  return (
    <Card
      title={t('Pay')}
      actions={
        canManage && !editing && !history.isLoading ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setWarnings([]);
              setEditing(true);
            }}
          >
            {records.length > 0 ? t('Change pay') : t('Set pay')}
          </Button>
        ) : undefined
      }
    >
      {history.isLoading ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('Loading')}
        </p>
      ) : history.isError ? (
        <div className="alert alert--danger" role="alert">
          {t('Could not load the pay history.')}
        </div>
      ) : editing ? (
        <CompensationForm
          employeeId={employeeId}
          current={current ?? upcoming[0] ?? null}
          onSaved={(saved) => {
            setWarnings(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="stack stack--sm">
          {warnings.length > 0 && (
            <div className="alert alert--warning" role="status">
              <strong>{t('Saved. Check before the next payroll run:')}</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                {warnings.map((warning) => (
                  <li key={warning.code}>{describeWarning(warning, t)}</li>
                ))}
              </ul>
            </div>
          )}
          {records.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              {t('No pay set. Payroll skips an employee without one.')}
            </p>
          ) : (
            <dl className="stack stack--sm" style={{ margin: 0 }}>
              {current ? (
                <>
                  <Row label={t('Current pay')} value={<PayAmount record={current} />} />
                  <Row label={t('Since')} value={formatDate(day(current.effectiveFrom))} />
                </>
              ) : (
                <Row label={t('Current pay')} value={t('Not yet in effect')} />
              )}
              {upcoming.map((record) => (
                <Row
                  key={record.id}
                  label={t('From {date}', { date: formatDate(day(record.effectiveFrom)) })}
                  value={
                    <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <PayAmount record={record} />
                      <Badge tone="info">{t('Upcoming')}</Badge>
                    </span>
                  }
                />
              ))}
              {earlier.slice(0, 3).map((record) => (
                <Row
                  key={record.id}
                  label={
                    <span className="subtle">
                      {formatDate(day(record.effectiveFrom))} –{' '}
                      {record.effectiveTo ? formatDate(day(record.effectiveTo)) : ''}
                    </span>
                  }
                  value={
                    <span className="subtle">
                      <PayAmount record={record} />
                    </span>
                  }
                />
              ))}
            </dl>
          )}
        </div>
      )}
    </Card>
  );
}

function day(value: string): string {
  return value.slice(0, 10);
}

function isDaily(record: EmployeeCompensation): boolean {
  return record.dailyRate !== null && record.dailyRate !== undefined;
}

function PayAmount({ record }: { record: EmployeeCompensation }) {
  const t = useT();
  return isDaily(record) ? (
    <>
      {t('{amount} a day, paid twice a month', {
        amount: formatMoney(Number(record.dailyRate)),
      })}
    </>
  ) : (
    <>{t('{amount} a month', { amount: formatMoney(Number(record.baseSalary)) })}</>
  );
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="row row--between" style={{ gap: 16, alignItems: 'baseline' }}>
      <dt className="subtle" style={{ flexShrink: 0 }}>
        {label}
      </dt>
      <dd style={{ margin: 0, textAlign: 'right' }}>{value}</dd>
    </div>
  );
}

function CompensationForm({
  employeeId,
  current,
  onSaved,
  onCancel,
}: {
  employeeId: string;
  current: EmployeeCompensation | null;
  onSaved: (warnings: PayslipWarning[]) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [basis, setBasis] = useState<PayBasis>(current && isDaily(current) ? 'DAILY' : 'SALARY');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<EmployeeCompensation & { warnings?: PayslipWarning[] }>(
        '/payroll/compensation',
        body,
      ),
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.compensation(employeeId) }),
        queryClient.invalidateQueries({ queryKey: qk.employmentEvents(employeeId) }),
      ]);
      onSaved(saved?.warnings ?? []);
    },
    onError: (error) => setProblem(saveError(error, t)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    const value = amount.trim().replace(/,/g, '');
    if (!effectiveFrom) return setProblem(t('Choose the date the pay starts.'));
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
      return setProblem(t('Enter the amount in baht, with at most two decimal places.'));
    }
    const pay =
      basis === 'DAILY'
        ? { baseSalary: 0, payFrequency: 'SEMI_MONTHLY', dailyRate: Number(value) }
        : { baseSalary: Number(value), payFrequency: 'MONTHLY' };
    save.mutate({
      employeeId,
      effectiveFrom,
      ...pay,
      // A pay change is not a change of overtime, social security or
      // provident fund: carry those over, or a new record would reset them.
      ...(current
        ? {
            isOvertimeEligible: current.isOvertimeEligible,
            isSsoEligible: current.isSsoEligible,
            pvdEmployeeRate: Number(current.pvdEmployeeRate),
            pvdEmployerRate: Number(current.pvdEmployerRate),
          }
        : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <Field label={t('Starts on')}>
          <DateInput value={effectiveFrom} onChange={setEffectiveFrom} />
        </Field>
        <Field label={t('Paid as')}>
          <Select value={basis} onChange={(e) => setBasis(e.target.value as PayBasis)}>
            <option value="SALARY">{t('Monthly salary')}</option>
            <option value="DAILY">{t('Daily wage, paid twice a month')}</option>
          </Select>
        </Field>
      </div>
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <Field
          label={basis === 'DAILY' ? t('Baht a day') : t('Baht a month')}
          hint={
            basis === 'DAILY'
              ? t('Checked against the minimum wage set on the work location.')
              : undefined
          }
        >
          <Input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            className="mono"
          />
        </Field>
        <Field label={t('Reason (optional)')}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      </div>
      {problem && (
        <div className="alert alert--danger" role="alert">
          {problem}
        </div>
      )}
      <div className="row">
        <Button type="submit" variant="primary" loading={save.isPending}>
          {t('Save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

function saveError(error: unknown, t: ReturnType<typeof useT>): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'COMPENSATION_ALREADY_EXISTS':
        return t('A pay record already starts on that date. Choose another date.');
      case 'VALIDATION_FAILED':
        return t('Enter the amount in baht, with at most two decimal places.');
      case 'DAILY_RATE_WITH_SALARY':
      case 'DAILY_RATE_REQUIRED':
      case 'DAILY_RATE_NEEDS_SEMI_MONTHLY':
      case 'PAY_FREQUENCY_NOT_SUPPORTED':
        return t('Pay is either a monthly salary or a daily wage paid twice a month.');
    }
  }
  return error instanceof Error ? error.message : t('Could not save');
}
