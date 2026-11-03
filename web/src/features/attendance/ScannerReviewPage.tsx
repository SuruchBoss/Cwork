// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { qk } from '@/app/query-client';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DateInput,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-messages';
import { formatDate, formatNumber } from '@/lib/format';
import { plural } from '@/lib/i18n';
import { useT } from '@/lib/i18n/useT';
import type { EmployeeSummary, Page } from '@/types/api';
import { ScannerStatusBadge, UnmappedTable } from './ScannerParts';
import { suggestTimes } from './suggest-times';
import type {
  ScannerDay,
  ScannerDaysPage,
  ScannerDecision,
  ScannerStatusFilter,
  UnmappedNumber,
} from './scanner-types';

const PAGE_SIZE = 100;
const FILTERS: ScannerStatusFilter[] = [
  'WAITING',
  'DECIDED_USE',
  'DECIDED_IGNORE',
  'COUNTED',
  'NO_PUNCH',
  'UNMAPPED',
  'LOCKED',
  'ALL',
];

/**
 * What HR does with one day the scanner could not settle on its own: pick the
 * time that is the clock-in and the one that is the clock-out from the times
 * the scanner recorded, or leave the day out. A decision can be changed later;
 * the raw times are never altered.
 */
function DecisionControls({
  day,
  onDecide,
  busy,
}: {
  day: ScannerDay;
  onDecide: (decision: ScannerDecision) => void;
  busy: boolean;
}) {
  const t = useT();
  const suggested = suggestTimes(day.times);
  const decided = day.decision?.action === 'USE' ? day.decision : null;
  const [clockIn, setClockIn] = useState(decided ? (decided.clockIn ?? '') : suggested.clockIn);
  const [clockOut, setClockOut] = useState(decided ? (decided.clockOut ?? '') : suggested.clockOut);

  if (day.locked) {
    return <Badge tone="neutral">{t('Payroll has used this day')}</Badge>;
  }

  const optionsFor = (kind: 'In' | 'Out') =>
    day.times.map((time) => (
      <option key={time} value={time}>
        {kind === 'In' ? t('In {time}', { time }) : t('Out {time}', { time })}
      </option>
    ));
  const label = formatDate(day.workDate);
  // Nobody decides their own day while someone else may; where no one else
  // could, they may, and the page says it will be noted.
  const leftToAnother = day.ownDay !== null && !day.ownDay.canDecide;
  const valid =
    !leftToAnother && Boolean(clockIn || clockOut) && (!clockIn || !clockOut || clockOut > clockIn);

  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Select
        aria-label={t('Clock-in for {day}', { day: `${day.scannerNumber} ${label}` })}
        value={clockIn}
        disabled={leftToAnother}
        onChange={(event) => setClockIn(event.target.value)}
      >
        <option value="">{t('No clock-in')}</option>
        {optionsFor('In')}
      </Select>
      <Select
        aria-label={t('Clock-out for {day}', { day: `${day.scannerNumber} ${label}` })}
        value={clockOut}
        disabled={leftToAnother}
        onChange={(event) => setClockOut(event.target.value)}
      >
        <option value="">{t('No clock-out')}</option>
        {optionsFor('Out')}
      </Select>
      <Button
        size="sm"
        variant="primary"
        disabled={!valid}
        loading={busy}
        onClick={() =>
          onDecide({
            action: 'USE',
            clockIn: clockIn || undefined,
            clockOut: clockOut || undefined,
          })
        }
      >
        {t('Use these times')}
      </Button>
      <Button
        size="sm"
        disabled={busy || leftToAnother}
        onClick={() => onDecide({ action: 'IGNORE' })}
      >
        {t('Do not count this day')}
      </Button>
      {day.ownDay && (
        <span className="subtle" role="note" style={{ flexBasis: '100%' }}>
          {leftToAnother
            ? t('This is your own day. Someone else who manages attendance has to decide it.')
            : t(
                'This is your own day and no one else can decide it. Your decision will be noted on the payroll run and in the audit log.',
              )}
        </span>
      )}
    </div>
  );
}

/** Searching for the employee a scanner number belongs to, then registering it. */
/** What registering a waiting number for some days would count (CW-115). */
interface BindPreview {
  from: string;
  to: string;
  days: number;
  daysWithTimes: number;
  daysAlsoScannedOnAnotherNumber: number;
}

function BindControl({
  item,
  onBound,
}: {
  item: UnmappedNumber;
  onBound: (message: string) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  // Asked, not assumed: a number carried by someone else later is bound for these days only.
  const [scope, setScope] = useState<'' | 'THESE_DAYS' | 'ALWAYS'>('');
  // The first and last of the waiting days to bind; the whole stretch unless narrowed (CW-115).
  const [from, setFrom] = useState(item.firstDay);
  const [to, setTo] = useState(item.lastDay);
  const [problem, setProblem] = useState<string | null>(null);
  // Registering a number counts waiting days for the person: said first, as ending one is.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const matches = useQuery({
    queryKey: qk.employees({ search: term, limit: 8, for: 'scanner-bind' }),
    queryFn: () =>
      api.get<Page<EmployeeSummary>>('/employees', { query: { search: term, limit: 8 } }),
    enabled: term.length > 0,
  });

  // Asked before it is done: how many waiting days the range counts, and how many of them
  // the person already has scans for under another number.
  const rangeKnown = scope === 'THESE_DAYS' && Boolean(employeeId) && Boolean(from) && Boolean(to);
  const preview = useQuery({
    queryKey: ['attendance', 'scanner-bind-preview', item.scannerNumber, employeeId, from, to],
    queryFn: () =>
      api.get<BindPreview>('/attendance/scanner/unmapped/bind-preview', {
        query: { scannerNumber: item.scannerNumber, employeeId, from, to },
      }),
    enabled: rangeKnown,
    retry: false,
  });

  const bind = useMutation({
    mutationFn: () =>
      api.post<{ daysMatched: number; punchesAdded: number }>('/attendance/scanner/unmapped/bind', {
        scannerNumber: item.scannerNumber,
        employeeId,
        scope,
        ...(scope === 'THESE_DAYS' ? { from, to } : {}),
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
      onBound(
        t('Number {number} registered: {days} days matched, {punches} punches added', {
          number: item.scannerNumber,
          days: formatNumber(result.daysMatched),
          punches: formatNumber(result.punchesAdded),
        }),
      );
    },
    onError: (caught) => setProblem(describeApiError(caught, t, t('Something went wrong'))),
  });

  const people = matches.data?.data ?? [];
  const chosen = people.find((person) => person.id === employeeId);
  const chosenName = chosen ? `${chosen.firstNameTh} ${chosen.lastNameTh}` : '';

  return (
    <div className="stack stack--sm">
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input
          className="input"
          type="search"
          aria-label={t('Find an employee for number {number}', { number: item.scannerNumber })}
          placeholder={t('Search by name or code')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setEmployeeId('');
            setProblem(null);
          }}
        />
        {people.length > 0 && (
          <Select
            aria-label={t('Employee for number {number}', { number: item.scannerNumber })}
            value={employeeId}
            onChange={(event) => {
              setEmployeeId(event.target.value);
              setProblem(null);
            }}
          >
            <option value="">{t('Choose…')}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.employeeCode} · {person.firstNameTh} {person.lastNameTh}
              </option>
            ))}
          </Select>
        )}
        <Select
          aria-label={t('How long number {number} is theirs', { number: item.scannerNumber })}
          value={scope}
          onChange={(event) => {
            setScope(event.target.value as typeof scope);
            setProblem(null);
          }}
        >
          <option value="">{t('Choose…')}</option>
          <option value="THESE_DAYS">
            {t('Only these days ({from} to {to})', {
              from: formatDate(item.firstDay),
              to: formatDate(item.lastDay),
            })}
          </option>
          <option value="ALWAYS" disabled={item.foreverPossible === false}>
            {item.foreverPossible === false
              ? t('From now on: not possible, someone holds this number now')
              : item.foreverFrom
                ? t(
                    'From {date}, until it is ended ({count} waiting days counted for this person)',
                    {
                      date: formatDate(item.foreverFrom),
                      count: formatNumber(item.foreverDays ?? 0),
                    },
                  )
                : t(
                    'From the beginning, until it is ended ({count} waiting days counted for this person)',
                    { count: formatNumber(item.foreverDays ?? item.days) },
                  )}
          </option>
        </Select>
        {scope === 'THESE_DAYS' && (
          <>
            <DateInput
              aria-label={t('First day of number {number}', { number: item.scannerNumber })}
              value={from}
              min={item.firstDay}
              max={item.lastDay}
              onChange={(value) => {
                setFrom(value);
                setProblem(null);
              }}
            />
            <DateInput
              aria-label={t('Last day of number {number}', { number: item.scannerNumber })}
              value={to}
              min={item.firstDay}
              max={item.lastDay}
              onChange={(value) => {
                setTo(value);
                setProblem(null);
              }}
            />
          </>
        )}
        <Button
          size="sm"
          variant="primary"
          disabled={!employeeId || !scope || (scope === 'THESE_DAYS' && preview.isError)}
          loading={bind.isPending}
          onClick={() => setConfirming(true)}
        >
          {t('Register this number')}
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t('Register number {number} for {name}?', {
            number: item.scannerNumber,
            name: chosenName,
          })}
          confirmLabel={t('Register this number')}
          cancelLabel={t('Cancel')}
          busy={bind.isPending}
          onConfirm={() => bind.mutate(undefined, { onSettled: () => setConfirming(false) })}
          onCancel={() => setConfirming(false)}
        >
          <p>
            {scope === 'THESE_DAYS'
              ? t('{count} waiting days from {from} to {to} would be counted for this person.', {
                  count: formatNumber(preview.data?.days ?? item.days),
                  from: formatDate(preview.data?.from ?? from),
                  to: formatDate(preview.data?.to ?? to),
                })
              : item.foreverFrom
                ? t(
                    'From {date}, until it is ended ({count} waiting days counted for this person)',
                    {
                      date: formatDate(item.foreverFrom),
                      count: formatNumber(item.foreverDays ?? 0),
                    },
                  )
                : t(
                    'From the beginning, until it is ended ({count} waiting days counted for this person)',
                    { count: formatNumber(item.foreverDays ?? item.days) },
                  )}
          </p>
          {scope === 'THESE_DAYS' &&
            preview.data &&
            preview.data.daysAlsoScannedOnAnotherNumber > 0 && (
              <p>
                {t(
                  'This person already has scans under another number on {count} of these days. Both numbers would count for the same day. Choose fewer days if this card was not theirs on all of them.',
                  { count: formatNumber(preview.data.daysAlsoScannedOnAnotherNumber) },
                )}
              </p>
            )}
        </ConfirmDialog>
      )}
      {rangeKnown && preview.data && (
        <p className="muted" role="status" style={{ margin: 0 }}>
          {t('{count} waiting days from {from} to {to} would be counted for this person.', {
            count: formatNumber(preview.data.days),
            from: formatDate(preview.data.from),
            to: formatDate(preview.data.to),
          })}
        </p>
      )}
      {rangeKnown && preview.data && preview.data.daysAlsoScannedOnAnotherNumber > 0 && (
        <p className="alert alert--warning" role="alert" style={{ margin: 0 }}>
          {t(
            'This person already has scans under another number on {count} of these days. Both numbers would count for the same day. Choose fewer days if this card was not theirs on all of them.',
            { count: formatNumber(preview.data.daysAlsoScannedOnAnotherNumber) },
          )}
        </p>
      )}
      {rangeKnown && preview.isError && (
        <p className="alert alert--danger" role="alert" style={{ margin: 0 }}>
          {describeApiError(preview.error, t, t('Something went wrong'))}
        </p>
      )}
      {problem && (
        <p className="alert alert--danger" role="alert" style={{ margin: 0 }}>
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * HR's page for the scanner's days (CW-061). By default it lists the days
 * waiting for a decision; every other day is one click away, so nothing the
 * scanner recorded is hidden. The totals follow each decision.
 */
export default function ScannerReviewPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ScannerStatusFilter>('WAITING');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const filters = { status, from, to, page };
  const days = useQuery({
    queryKey: qk.scannerDays(filters),
    queryFn: () =>
      api.get<ScannerDaysPage>('/attendance/scanner/days', {
        query: {
          status,
          page,
          limit: PAGE_SIZE,
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      }),
  });

  const unmapped = useQuery({
    queryKey: qk.scannerUnmapped,
    queryFn: () => api.get<UnmappedNumber[]>('/attendance/scanner/unmapped'),
  });

  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string;
      decision: ScannerDecision;
      who: string;
      date: string;
    }) => api.post(`/attendance/scanner/days/${id}/decision`, decision),
    onMutate: ({ id }) => {
      setFailure(null);
      setDeciding(id);
    },
    onSuccess: async (_result, { decision, who, date }) => {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
      const day = formatDate(date);
      setNotice(
        decision.action === 'IGNORE'
          ? t('{who}, {day}: left out, not counted', { who, day })
          : decision.clockIn && decision.clockOut
            ? t('{who}, {day}: counted {from} to {to}', {
                who,
                day,
                from: decision.clockIn,
                to: decision.clockOut,
              })
            : decision.clockIn
              ? t('{who}, {day}: counted with clock-in {time} only', {
                  who,
                  day,
                  time: decision.clockIn,
                })
              : t('{who}, {day}: counted with clock-out {time} only', {
                  who,
                  day,
                  time: decision.clockOut ?? '—',
                }),
      );
    },
    onError: (caught) => setFailure(describeApiError(caught, t, t('Something went wrong'))),
    onSettled: () => setDeciding(null),
  });

  const rematch = useMutation({
    mutationFn: () =>
      api.post<{ daysMatched: number; punchesAdded: number }>('/attendance/scanner/rematch'),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setNotice(
        t('Matched again: {days} days matched, {punches} punches added', {
          days: formatNumber(result.daysMatched),
          punches: formatNumber(result.punchesAdded),
        }),
      );
    },
    onError: (caught) => setFailure(describeApiError(caught, t, t('Something went wrong'))),
  });

  const data = days.data;
  const totals = data?.totals;
  const filterLabels: Record<ScannerStatusFilter, string> = {
    WAITING: t('Waiting for HR'),
    DECIDED_USE: t('HR chose the times'),
    DECIDED_IGNORE: t('HR left it out'),
    COUNTED: t('Counted'),
    NO_PUNCH: t('No punch'),
    UNMAPPED: t('Number not registered'),
    LOCKED: t('Payroll has used it'),
    ALL: t('All rows'),
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const decidable = (day: ScannerDay) =>
    day.status === 'WAITING' || day.status === 'DECIDED_USE' || day.status === 'DECIDED_IGNORE';

  return (
    <div className="page">
      <PageHeader
        title={t('Scanner days')}
        description={t(
          'Every day the fingerprint scanner recorded, as it recorded it. Decide the days it could not settle; the totals change as you do.',
        )}
        actions={
          <Link to="/attendance/scanner/import" className="btn btn--primary">
            {t('Import a file')}
          </Link>
        }
      />

      {notice && (
        <div className="alert alert--info" role="status">
          {notice}
        </div>
      )}
      {failure && (
        <div className="alert alert--danger" role="alert">
          {failure}
        </div>
      )}

      {totals && (
        <div className="grid grid--4">
          <Stat
            label={t('Waiting for HR')}
            value={formatNumber(totals.waiting)}
            hint={t('Not counted until you decide')}
          />
          <Stat
            label={t('Counted')}
            value={formatNumber(totals.counted + totals.decidedUse)}
            hint={t('{count} chosen by HR', { count: formatNumber(totals.decidedUse) })}
          />
          <Stat label={t('Left out by HR')} value={formatNumber(totals.decidedIgnore)} />
          <Stat
            label={t('Number not registered')}
            value={formatNumber(totals.unmapped)}
            hint={totals.unmapped > 0 ? t('Not counted until you say whose they are') : undefined}
          />
        </div>
      )}
      {totals && totals.noPunch > 0 && (
        <p className="subtle" style={{ margin: 0 }}>
          {t(
            plural(
              totals.noPunch,
              '{count} day has no punch at all. Choose “No punch” under Show to see it.',
              '{count} days have no punch at all. Choose “No punch” under Show to see it.',
            ),
            { count: formatNumber(totals.noPunch) },
          )}
        </p>
      )}

      {(unmapped.data?.length ?? 0) > 0 && (
        <Card
          title={t('Scanner numbers nobody has registered')}
          actions={
            <Button size="sm" loading={rematch.isPending} onClick={() => rematch.mutate()}>
              {t('Match again')}
            </Button>
          }
          flush
        >
          <div className="stack" style={{ padding: '12px 16px' }}>
            <p className="muted" style={{ margin: 0 }}>
              {t(
                'Nothing is counted for these numbers until you say whose they are. If a number was added to an employee some other way, such as the employee import, press Match again.',
              )}
            </p>
          </div>
          <UnmappedTable
            items={unmapped.data!}
            action={(item) => <BindControl item={item} onBound={setNotice} />}
          />
        </Card>
      )}

      <Card title={t('Days from the scanner')} flush>
        <div className="row" style={{ flexWrap: 'wrap', gap: 12, padding: '12px 16px' }}>
          <Field label={t('Show')}>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ScannerStatusFilter);
                setPage(1);
              }}
            >
              {FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {filterLabels[filter]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('From')}>
            <DateInput
              value={from || data?.from || ''}
              onChange={(value) => {
                setFrom(value);
                setPage(1);
              }}
            />
          </Field>
          <Field label={t('To')}>
            <DateInput
              value={to || data?.to || ''}
              onChange={(value) => {
                setTo(value);
                setPage(1);
              }}
            />
          </Field>
        </div>

        {days.isLoading ? (
          <TableSkeleton columns={5} />
        ) : days.isError ? (
          <ErrorState error={days.error} onRetry={() => void days.refetch()} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon="clock"
            title={
              status === 'WAITING'
                ? t('Nothing is waiting for you')
                : t('No days match this filter')
            }
            description={
              data?.from
                ? undefined
                : t('Import the scanner’s file first, then its days appear here.')
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Scanner number')}</th>
                  <th>{t('Name')}</th>
                  <th>{t('Times on the scanner')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Decision')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((day) => (
                  <tr key={day.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(day.workDate)}</td>
                    <td className="mono">{day.scannerNumber}</td>
                    <td>
                      {day.employee ? (
                        <>
                          {day.employee.name}
                          <div className="subtle mono">{day.employee.employeeCode}</div>
                        </>
                      ) : (
                        day.name
                      )}
                    </td>
                    <td className="mono">
                      {day.times.length > 0 ? (
                        day.times.join('  ')
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td>
                      <ScannerStatusBadge
                        status={day.status}
                        reason={day.reason}
                        locked={day.locked}
                      />
                      {day.decisionOutdated && (
                        <div className="subtle">
                          {t('The scanner has more times now than when you decided')}
                        </div>
                      )}
                    </td>
                    <td>
                      {decidable(day) ? (
                        <DecisionControls
                          // Start from what is on record whenever the day changes under it.
                          key={`${day.id}:${day.times.join(',')}:${day.decision?.decidedAt ?? ''}`}
                          day={day}
                          busy={deciding === day.id}
                          onDecide={(decision) =>
                            decide.mutate({
                              id: day.id,
                              decision,
                              who: day.employee?.name ?? day.name,
                              date: day.workDate,
                            })
                          }
                        />
                      ) : day.locked ? (
                        <Badge tone="neutral">{t('Payroll has used this day')}</Badge>
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && pages > 1 && (
          <div className="row" style={{ padding: 16, justifyContent: 'space-between' }}>
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('Previous')}
            </Button>
            <span className="muted">{t('Page {page} of {pages}', { page, pages })}</span>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {t('Next')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
