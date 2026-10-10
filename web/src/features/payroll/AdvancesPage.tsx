// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
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
  Input,
  PageHeader,
  Person,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatDate, formatMoney, formatPeriod, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { EmployeeSummary, Page, PayrollAdvance } from '@/types/api';

type Method = PayrollAdvance['method'];

interface Chosen {
  id: string;
  name: string;
  code: string;
}

/**
 * Cash advances (เบิกล่วงหน้า, CW-070): money paid before payday, taken back
 * by the regular runs that follow, after tax and social security. What a
 * period cannot cover waits for the next one, and this page shows what each
 * person still owes.
 */
export default function AdvancesPage() {
  const t = useT();
  const can = useAuthStore((s) => s.can);
  const canRecord = can(P.PAYROLL_RUN);
  const [owingOnly, setOwingOnly] = useState(true);
  const [editing, setEditing] = useState<PayrollAdvance | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // A fresh form after each save, so the next advance starts empty.
  const [formKey, setFormKey] = useState(0);

  const advances = useQuery({
    queryKey: qk.advances(owingOnly),
    queryFn: () =>
      api.get<PayrollAdvance[]>('/payroll/advances', {
        query: owingOnly ? { owing: 'true' } : {},
      }),
  });

  return (
    <div className="page">
      <PageHeader
        title={t('Cash advances')}
        description={t(
          'Paid before payday and taken back by the next pay run, after tax and social security',
        )}
        actions={
          <Link to="/payroll" className="btn btn--secondary btn--sm">
            ← {t('Back')}
          </Link>
        }
      />

      {canRecord && (
        <AdvanceForm
          key={editing?.id ?? `new-${formKey}`}
          editing={editing}
          onDone={(message) => {
            setEditing(null);
            setFormKey((key) => key + 1);
            setSaved(message);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {saved && (
        <div className="alert alert--success" role="status">
          {saved}
        </div>
      )}

      <Card
        title={owingOnly ? t('Still owed') : t('All advances')}
        actions={
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={owingOnly}
              onChange={(e) => setOwingOnly(e.target.checked)}
            />
            {t('Only what is still owed')}
          </label>
        }
        flush
      >
        {advances.isLoading ? (
          <TableSkeleton rows={4} columns={6} />
        ) : advances.isError ? (
          <ErrorState error={advances.error} onRetry={() => void advances.refetch()} />
        ) : advances.data && advances.data.length > 0 ? (
          <AdvanceTable
            rows={advances.data}
            canRecord={canRecord}
            onEdit={(advance) => {
              setSaved(null);
              setEditing(advance);
              window.scrollTo({ top: 0 });
            }}
            onCancelled={(advance) =>
              setSaved(
                t('Cancelled the advance of {amount} to {name}', {
                  amount: formatMoney(advance.amount),
                  name: nameOf(advance),
                }),
              )
            }
          />
        ) : (
          <EmptyState
            icon="฿"
            title={owingOnly ? t('Nobody owes an advance') : t('No advances recorded')}
          />
        )}
      </Card>
    </div>
  );
}

const nameOf = (advance: PayrollAdvance) =>
  `${advance.employee.firstNameTh} ${advance.employee.lastNameTh}`;

function AdvanceTable({
  rows,
  canRecord,
  onEdit,
  onCancelled,
}: {
  rows: PayrollAdvance[];
  canRecord: boolean;
  onEdit: (advance: PayrollAdvance) => void;
  onCancelled: (advance: PayrollAdvance) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: (advance: PayrollAdvance) =>
      api.delete<PayrollAdvance>(`/payroll/advances/${advance.id}`),
    onSuccess: async (_, advance) => {
      await queryClient.invalidateQueries({ queryKey: ['payroll', 'advances'] });
      onCancelled(advance);
    },
  });

  return (
    <>
      {cancel.isError && (
        <div className="alert alert--danger" role="alert" style={{ margin: 12 }}>
          {advanceError(cancel.error, t)}
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Employee')}</th>
              <th>{t('Paid on')}</th>
              <th className="num">{t('Amount')}</th>
              <th className="num">{t('Taken back')}</th>
              <th className="num">{t('Still owed')}</th>
              <th>{t('Taken back in')}</th>
              <th>
                <span className="visually-hidden">{t('Actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((advance) => (
              <tr key={advance.id}>
                <td>
                  <Person name={nameOf(advance)} meta={advance.employee.employeeCode} />
                </td>
                <td>
                  {formatDate(advance.paidOn)}
                  <div className="subtle">
                    {advance.method === 'CASH' ? t('Cash') : t('Bank transfer')}
                    {advance.note ? ` · ${advance.note}` : ''}
                  </div>
                </td>
                <td className="num">{formatMoney(advance.amount)}</td>
                <td className="num">{formatMoney(advance.deducted)}</td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {advance.status === 'CANCELLED' ? (
                    <Badge tone="neutral">{t('Cancelled')}</Badge>
                  ) : advance.outstanding > 0 ? (
                    formatMoney(advance.outstanding)
                  ) : (
                    <Badge tone="success">{t('Settled')}</Badge>
                  )}
                </td>
                <td>
                  {advance.deductions.length > 0
                    ? advance.deductions.map((d) => (
                        <div key={d.runId}>
                          <Link to={`/payroll/runs/${d.runId}`}>{formatPeriod(d.periodCode)}</Link>{' '}
                          <span className="subtle">{formatMoney(d.amount)}</span>
                        </div>
                      ))
                    : '—'}
                </td>
                <td>
                  {canRecord && advance.status === 'ACTIVE' && !advance.locked ? (
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('Edit the advance of {name}', { name: nameOf(advance) })}
                        onClick={() => onEdit(advance)}
                      >
                        {t('Edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={cancel.isPending && cancel.variables?.id === advance.id}
                        aria-label={t('Cancel the advance of {name}', { name: nameOf(advance) })}
                        onClick={() => cancel.mutate(advance)}
                      >
                        {t('Cancel')}
                      </Button>
                    </div>
                  ) : advance.locked ? (
                    <span className="subtle">{t('In an approved run')}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AdvanceForm({
  editing,
  onDone,
  onCancel,
}: {
  editing: PayrollAdvance | null;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const resultsId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [employee, setEmployee] = useState<Chosen | null>(
    editing
      ? { id: editing.employeeId, name: nameOf(editing), code: editing.employee.employeeCode }
      : null,
  );
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [paidOn, setPaidOn] = useState(editing?.paidOn ?? todayIso());
  const [method, setMethod] = useState<Method>(editing?.method ?? 'CASH');
  const [note, setNote] = useState(editing?.note ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  // Search as HR types, but not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const matches = useQuery({
    queryKey: qk.employees({ search: term, limit: 8, for: 'advance' }),
    queryFn: () =>
      api.get<Page<EmployeeSummary>>('/employees', { query: { search: term, limit: 8 } }),
    enabled: !employee && term.length > 0,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing
        ? api.patch<PayrollAdvance>(`/payroll/advances/${editing.id}`, body)
        : api.post<PayrollAdvance>('/payroll/advances', body),
    onSuccess: async (advance) => {
      await queryClient.invalidateQueries({ queryKey: ['payroll', 'advances'] });
      onDone(
        editing
          ? t('Saved the advance of {amount} to {name}', {
              amount: formatMoney(advance.amount),
              name: nameOf(advance),
            })
          : t('Recorded {amount} paid to {name} on {date}', {
              amount: formatMoney(advance.amount),
              name: nameOf(advance),
              date: formatDate(advance.paidOn),
            }),
      );
    },
    onError: (error) => setProblem(advanceError(error, t)),
  });

  const choose = (person: EmployeeSummary) => {
    setEmployee({
      id: person.id,
      name: `${person.firstNameTh} ${person.lastNameTh}`,
      code: person.employeeCode,
    });
    setProblem(null);
  };

  // Enter in the search box picks the first match rather than submitting.
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = matches.data?.data[0];
    if (first) choose(first);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    const value = amount.trim().replace(/,/g, '');
    if (!employee) return setProblem(t('Choose the employee first.'));
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
      return setProblem(t('Enter the amount in baht, with at most two decimal places.'));
    }
    if (!paidOn) return setProblem(t('Choose the day the advance was paid.'));
    save.mutate({
      ...(editing ? {} : { employeeId: employee.id }),
      amount: Number(value),
      paidOn,
      method,
      note: note.trim(),
    });
  };

  return (
    <Card title={editing ? t('Edit an advance') : t('Record an advance')}>
      <form className="stack" onSubmit={submit} noValidate>
        <Field label={t('Employee')}>
          {employee ? (
            <div className="row row--between">
              <span>
                <strong>{employee.name}</strong> <span className="mono">({employee.code})</span>
              </span>
              {!editing && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEmployee(null);
                    setTimeout(() => searchRef.current?.focus());
                  }}
                >
                  {t('Change')}
                </Button>
              )}
            </div>
          ) : (
            <input
              ref={searchRef}
              className="input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={t('Search by name, nickname or employee code')}
              aria-controls={term ? resultsId : undefined}
              autoComplete="off"
            />
          )}
        </Field>
        {!employee && term && (
          <ul className="pick-list" id={resultsId} aria-label={t('Matching employees')}>
            {matches.data?.data.map((person) => (
              <li key={person.id}>
                <button type="button" className="pick-list__item" onClick={() => choose(person)}>
                  <span>
                    {person.firstNameTh} {person.lastNameTh}{' '}
                    <span className="mono">{person.employeeCode}</span>
                  </span>
                  <span className="subtle">{person.department?.name ?? '—'}</span>
                </button>
              </li>
            ))}
            {matches.data && matches.data.data.length === 0 && (
              <li className="subtle">{t('No one matches "{term}"', { term })}</li>
            )}
          </ul>
        )}
        <div className="toolbar" style={{ alignItems: 'flex-start' }}>
          <Field label={t('Amount (baht)')}>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              className="mono"
            />
          </Field>
          <Field label={t('Paid on')}>
            <DateInput value={paidOn} onChange={setPaidOn} />
          </Field>
          <Field label={t('Paid by')}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              <option value="CASH">{t('Cash')}</option>
              <option value="BANK_TRANSFER">{t('Bank transfer')}</option>
            </Select>
          </Field>
          <Field label={t('Note (optional)')}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
        </div>
        {problem && (
          <div className="alert alert--danger" role="alert">
            {problem}
          </div>
        )}
        <div className="row">
          <Button type="submit" variant="primary" loading={save.isPending}>
            {editing ? t('Save') : t('Record advance')}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={onCancel}>
              {t('Cancel')}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function advanceError(error: unknown, t: ReturnType<typeof useT>): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'ADVANCE_IN_FUTURE':
        return t(
          'An advance is recorded once it has been paid, so the date cannot be in the future.',
        );
      case 'ADVANCE_LOCKED':
        return t(
          'An approved or paid run has taken this advance back, so it can no longer change.',
        );
      case 'ADVANCE_CANCELLED':
        return t('This advance has already been cancelled.');
      case 'VALIDATION_FAILED':
        return t('Enter the amount in baht, with at most two decimal places.');
    }
  }
  return error instanceof Error ? error.message : t('Could not save');
}
