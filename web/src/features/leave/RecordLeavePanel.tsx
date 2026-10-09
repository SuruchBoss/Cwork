// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { qk } from '@/app/query-client';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type {
  EmployeeSummary,
  LeaveBalance,
  LeavePreview,
  LeaveRequest,
  LeaveType,
  Page,
} from '@/types/api';
import { formatDays, recordLeaveErrorMessage } from './record-leave-errors';

/**
 * HR records leave for an employee (CW-067), most often after the fact and
 * several in a row at month end: someone phoned in sick, or told their manager.
 *
 * A panel beside the leave list rather than a page of its own, so the list
 * behind it fills in as HR goes. "Save and record another" keeps the leave type
 * and the status and starts again at the employee, so ten sick days are ten
 * passes through the same fields, by keyboard.
 */

type Portion = 'FULL' | 'MORNING' | 'AFTERNOON';

interface Chosen {
  id: string;
  name: string;
  code: string;
  department: string | null;
}

/** Recorded leave as the list shows it: who entered it. */
export interface RecordedLeave {
  type: string;
  name: string;
  dates: string;
}

const STATUS_KEY = 'cwork.recordLeave.approved';

/** The last status chosen, for this browser session only. */
function rememberedApproved(): boolean {
  try {
    return sessionStorage.getItem(STATUS_KEY) !== 'false';
  } catch {
    return true;
  }
}

function rememberApproved(value: boolean) {
  try {
    sessionStorage.setItem(STATUS_KEY, String(value));
  } catch {
    // Remembering is a convenience; a browser that refuses storage still works.
  }
}

export function RecordLeavePanel({
  onClose,
  onRecorded,
}: {
  onClose: () => void;
  onRecorded: (recorded: RecordedLeave) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const headingId = useId();
  const resultsId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [employee, setEmployee] = useState<Chosen | null>(null);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [portion, setPortion] = useState<Portion>('FULL');
  const [approved, setApproved] = useState(rememberedApproved);
  const [note, setNote] = useState('');
  const [attachment, setAttachment] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Search as HR types, but not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const matches = useQuery({
    queryKey: qk.employees({ search: term, limit: 8, for: 'record-leave' }),
    queryFn: () =>
      api.get<Page<EmployeeSummary>>('/employees', { query: { search: term, limit: 8 } }),
    enabled: !employee && term.length > 0,
  });

  const leaveTypes = useQuery({
    queryKey: qk.leaveTypes,
    queryFn: () => api.get<LeaveType[]>('/leave/types'),
  });

  const year = Number(startDate.slice(0, 4)) || new Date().getFullYear();
  const balances = useQuery({
    queryKey: qk.leaveBalances(employee?.id ?? '', year),
    queryFn: () => api.get<LeaveBalance[]>(`/leave/balances/${employee!.id}`, { query: { year } }),
    enabled: Boolean(employee),
  });

  // The types this employee may take; the balance list already leaves out the rest.
  const eligible = balances.data ?? [];
  const balance = eligible.find((b) => b.leaveTypeId === leaveTypeId);
  const leaveType = leaveTypes.data?.find((type) => type.id === leaveTypeId);

  // A type kept from the previous person that this one cannot take is cleared.
  useEffect(() => {
    if (balances.data && leaveTypeId && !balances.data.some((b) => b.leaveTypeId === leaveTypeId)) {
      setLeaveTypeId('');
    }
  }, [balances.data, leaveTypeId]);

  // A refusal is about what was asked; once HR changes any of it, it no longer applies.
  useEffect(() => {
    setProblem(null);
  }, [employee, leaveTypeId, startDate, endDate, portion, approved]);

  const oneDay = startDate === endDate;
  const halfDayOffered = oneDay && Boolean(leaveType?.allowHalfDay);
  const effectivePortion: Portion = halfDayOffered ? portion : 'FULL';
  const datesValid = Boolean(startDate && endDate && startDate <= endDate);

  const body = employee &&
    leaveTypeId &&
    datesValid && {
      employeeId: employee.id,
      leaveTypeId,
      startDate,
      endDate,
      startPortion: effectivePortion,
      endPortion: 'FULL' as const,
      reason: note.trim() || undefined,
      attachmentIds: attachment ? [attachment.id] : undefined,
      recordAsApproved: approved,
    };

  const preview = useQuery({
    queryKey: ['leave', 'record-preview', body && { ...body, reason: undefined }],
    queryFn: () => api.post<LeavePreview>('/leave/requests/record/preview', body),
    enabled: Boolean(body),
    retry: false,
  });

  const context = { name: employee?.name ?? '', type: balance?.name ?? leaveType?.name ?? '' };

  const attachmentOffered =
    Boolean(leaveType?.requiresAttachment) &&
    (preview.data?.totalDays ?? 0) >= (leaveType?.attachmentRequiredAfterDays ?? 0);

  const save = useMutation({
    mutationFn: (_next: boolean) => api.post<LeaveRequest>('/leave/requests/record', body),
    onSuccess: (_request, next) => {
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      onRecorded({
        type: context.type,
        name: context.name,
        dates: oneDay ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(endDate)}`,
      });
      if (!next) return onClose();
      // The next person: same leave type and status, new employee and dates.
      setEmployee(null);
      setSearch('');
      setTerm('');
      setStartDate(todayIso());
      setEndDate(todayIso());
      setPortion('FULL');
      setNote('');
      setAttachment(null);
      setProblem(null);
      searchRef.current?.focus();
    },
    onError: (error) => setProblem(recordLeaveErrorMessage(error, context, t)),
  });

  const submit = (next: boolean) => {
    setProblem(null);
    if (!employee) return setProblem(t('Choose the employee first.'));
    if (!leaveTypeId) return setProblem(t('Choose a leave type.'));
    if (!datesValid) return setProblem(t('The last day cannot be before the first.'));
    save.mutate(next);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(true);
  };

  const choose = (person: EmployeeSummary) => {
    setEmployee({
      id: person.id,
      name: `${person.firstNameTh} ${person.lastNameTh}`,
      code: person.employeeCode,
      department: person.department?.name ?? null,
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

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const stored = await api.post<{ id: string }>('/files/upload', form);
      setAttachment({ id: stored.id, name: file.name });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t('Could not upload the file'));
    } finally {
      setUploading(false);
    }
  };

  const shownProblem =
    problem ?? (preview.isError ? recordLeaveErrorMessage(preview.error, context, t) : null);

  return (
    <aside
      className="side-panel"
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <header className="side-panel__header">
        <h2 id={headingId} className="card__title">
          {t('Record leave for an employee')}
        </h2>
        <Button variant="ghost" size="sm" aria-label={t('Close')} onClick={onClose}>
          ✕
        </Button>
      </header>

      <form className="side-panel__body stack" onSubmit={onSubmit} noValidate>
        <Field label={t('Employee')}>
          {employee ? (
            <div className="row row--between">
              <span>
                <strong>{employee.name}</strong> <span className="mono">({employee.code})</span>
                {employee.department && <span className="subtle"> · {employee.department}</span>}
              </span>
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
            </div>
          ) : (
            <input
              ref={searchRef}
              className="input"
              autoFocus
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={t('Search by name, nickname or employee code')}
              aria-controls={resultsId}
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
                    {person.firstNameTh} {person.lastNameTh}
                    {person.nickname && <span className="subtle"> ({person.nickname})</span>}{' '}
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

        <Field
          label={t('Leave type')}
          hint={
            balance
              ? t('{available} of {granted} days left', {
                  available: formatDays(balance.available),
                  granted: formatDays(balance.granted + balance.carriedOver + balance.adjusted),
                })
              : undefined
          }
        >
          <Select
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            disabled={!employee}
          >
            <option value="">{t('— Choose —')}</option>
            {eligible.map((type) => (
              <option key={type.leaveTypeId} value={type.leaveTypeId}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="toolbar" style={{ alignItems: 'flex-start' }}>
          <Field label={t('First day of leave')}>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                const value = e.target.value;
                // The last day follows the first until it is set apart: one day off, one pick.
                if (endDate === startDate || endDate < value) setEndDate(value);
                setStartDate(value);
              }}
            />
          </Field>
          <Field label={t('Until')} hint={oneDay ? t('(one day)') : undefined}>
            <Input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        {halfDayOffered && (
          <fieldset className="choice-group">
            <legend className="visually-hidden">{t('Full or half day')}</legend>
            {(
              [
                ['FULL', t('Full day')],
                ['MORNING', t('Morning')],
                ['AFTERNOON', t('Afternoon')],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="choice">
                <input
                  type="radio"
                  name="portion"
                  value={value}
                  checked={portion === value}
                  onChange={() => setPortion(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}

        <fieldset className="choice-group choice-group--stacked">
          <legend className="field__label">{t('Status')}</legend>
          <label className="choice">
            <input
              type="radio"
              name="status"
              checked={approved}
              onChange={() => {
                setApproved(true);
                rememberApproved(true);
              }}
            />
            <span>
              {t('Record as approved')}
              <span className="field__hint choice__hint">
                {t('The manager already knows; no approval needed')}
              </span>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="status"
              checked={!approved}
              onChange={() => {
                setApproved(false);
                rememberApproved(false);
              }}
            />
            {t('Send to the manager to approve')}
          </label>
        </fieldset>

        <Field label={t('Note (optional)')}>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
        </Field>

        {attachmentOffered && (
          <Field
            label={
              leaveType?.code === 'SICK'
                ? t('Attach a medical certificate (optional)')
                : t('Attach a supporting document (optional)')
            }
            hint={attachment ? attachment.name : t('A PDF or a photo')}
          >
            <input
              type="file"
              accept="application/pdf,image/*"
              disabled={uploading}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </Field>
        )}

        {preview.data && !preview.isError && (
          <section className="summary" aria-label={t('Before you save')}>
            <h3 className="summary__title">{t('Before you save')}</h3>
            <dl className="summary__rows">
              <dt>{t('Leave taken')}</dt>
              <dd>{t('{days} days', { days: formatDays(preview.data.totalDays) })}</dd>
              <dt>{t('Left after saving')}</dt>
              <dd>{t('{days} days', { days: formatDays(preview.data.balanceAfter) })}</dd>
            </dl>
            <p className="subtle" style={{ margin: 0 }}>
              {t('Days taken: {dates} (days off not counted)', {
                dates: preview.data.days.map((d) => formatDate(d.date, 'd MMM')).join(', '),
              })}
            </p>
            {preview.data.warnings.map((warning) => (
              <p key={warning} className="alert alert--warning" style={{ margin: 0 }}>
                {warning}
              </p>
            ))}
          </section>
        )}

        {shownProblem && (
          <div className="alert alert--danger" role="alert">
            {shownProblem}
          </div>
        )}

        <div className="row">
          <Button type="submit" variant="primary" loading={save.isPending && save.variables}>
            {t('Save and record another')}
          </Button>
          <Button loading={save.isPending && !save.variables} onClick={() => submit(false)}>
            {t('Save')}
          </Button>
        </div>
      </form>
    </aside>
  );
}
