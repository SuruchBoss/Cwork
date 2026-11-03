// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { qk } from '@/app/query-client';
import { Button, Card, ConfirmDialog, DateInput, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { describeApiError } from '@/lib/api-messages';
import { useT } from '@/lib/i18n/useT';
import { formatDate } from '@/lib/format';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { EmployeeDetail } from '@/types/api';

/**
 * The employee's user number on the fingerprint scanner (CW-061, CW-090).
 * It is text, never a number: the scanner writes 007 and 007 is what is kept.
 * Giving a number to an employee counts the days that were waiting on it in
 * earlier scanner files; the days of a number they had before stay with them.
 */
/** What ending a number on a date would do (CW-109). */
interface EndPreview {
  scannerNumber: string;
  daysReleased: number;
  daysKept: number;
  blocked: { date: string; runNo: string | null } | null;
}

export function ScannerNumberCard({
  person,
  canEdit,
}: {
  person: Pick<EmployeeDetail, 'id' | 'scannerId' | 'scannerNumbers'>;
  canEdit: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const canEnd = useAuthStore((s) => s.canAny)(P.ATTENDANCE_MANAGE);
  const [ending, setEnding] = useState(false);
  const [endDate, setEndDate] = useState('');
  const periods = person.scannerNumbers ?? [];
  const inUse = periods.find((period) => period.validTo === null);
  const current = person.scannerId ?? '';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<'set' | 'cleared' | null>(null);

  const save = useMutation({
    mutationFn: (scannerId: string | null) => api.patch(`/employees/${person.id}`, { scannerId }),
    onSuccess: async (_data, scannerId) => {
      await queryClient.invalidateQueries({ queryKey: qk.employee(person.id) });
      setSaved(scannerId ? 'set' : 'cleared');
      setEditing(false);
    },
    onError: (error) => {
      setProblem(
        error instanceof ApiError && error.code === 'DUPLICATE_SCANNER_ID'
          ? t('This scanner number already belongs to another employee.')
          : error instanceof Error
            ? error.message
            : t('Could not save'),
      );
    },
  });

  // Asked before it is done: how many later days would go back to no one.
  const [preview, setPreview] = useState<EndPreview | null>(null);
  const askEnd = useMutation({
    mutationFn: () =>
      api.get<EndPreview>(`/attendance/scanner/numbers/${inUse!.id}/end-preview`, {
        query: { endDate },
      }),
    onSuccess: (result) => {
      setProblem(null);
      if (result.blocked) {
        setProblem(
          t(
            'Scanner number {scannerNumber} cannot end before {date}: that day is in payroll run {runNo}',
            {
              scannerNumber: result.scannerNumber,
              date: formatDate(result.blocked.date),
              runNo: result.blocked.runNo ?? '—',
            },
          ),
        );
        return;
      }
      setPreview(result);
    },
    onError: (error) => setProblem(describeApiError(error, t, t('Could not save'))),
  });

  const end = useMutation({
    mutationFn: () => api.post(`/attendance/scanner/numbers/${inUse!.id}/end`, { endDate }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
      await queryClient.invalidateQueries({ queryKey: qk.employee(person.id) });
      setPreview(null);
      setEnding(false);
      setSaved('cleared');
    },
    onError: (error) => {
      setPreview(null);
      setProblem(describeApiError(error, t, t('Could not save')));
    },
  });

  const open = () => {
    setValue(current);
    setProblem(null);
    setSaved(null);
    setEditing(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    const typed = value.trim();
    if (/\s/.test(typed)) {
      setProblem(t('A scanner number has no spaces.'));
      return;
    }
    if (typed === current) {
      setEditing(false);
      return;
    }
    save.mutate(typed || null);
  };

  return (
    <Card
      title={t('Scanner number')}
      actions={
        canEdit && !editing ? (
          <Button size="sm" variant="ghost" onClick={open}>
            {current ? t('Edit') : t('Add')}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <form className="stack" onSubmit={submit} noValidate>
          <Field
            label={t('Scanner number')}
            hint={
              current
                ? t(
                    'Type it as the scanner writes it: 007 is not 7. Days already imported under the old number stay with this employee.',
                  )
                : t(
                    'Type it as the scanner writes it: 007 is not 7. Days already imported under this number are counted for this employee.',
                  )
            }
          >
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={32}
              autoComplete="off"
              className="mono"
            />
          </Field>
          {problem && (
            <div className="alert alert--danger" role="alert">
              {problem}
            </div>
          )}
          <div className="row">
            <Button type="submit" variant="primary" loading={save.isPending}>
              {t('Save')}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t('Cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="stack stack--sm">
          <p className="mono" style={{ margin: 0 }}>
            {current || '—'}
          </p>
          {!current && (
            <p className="muted" style={{ margin: 0 }}>
              {t('No scanner number. Days from the scanner wait until one is given.')}
            </p>
          )}
          {saved === 'set' && (
            <p className="muted" role="status" style={{ margin: 0 }}>
              {t(
                'Saved. Days already imported under this number now belong to this employee: those with two times are counted, the others wait for HR on the scanner days page.',
              )}
            </p>
          )}
          {saved === 'cleared' && (
            <p className="muted" role="status" style={{ margin: 0 }}>
              {t('Saved. The days already counted for this employee stay as they are.')}
            </p>
          )}
          {periods.length > 0 && (
            <ul
              className="stack stack--sm"
              aria-label={t('Numbers this employee has had')}
              style={{ margin: 0, paddingLeft: 18 }}
            >
              {periods.map((period) => (
                <li key={period.id}>
                  <span className="mono">{period.scannerNumber}</span>{' '}
                  <span className="muted">
                    {period.validFrom
                      ? t('from {date}', { date: formatDate(period.validFrom) })
                      : t('from the beginning')}
                    {', '}
                    {period.validTo
                      ? t('until {date}', { date: formatDate(period.validTo) })
                      : t('in use')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canEdit && canEnd && inUse && !ending && (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setEnding(true)}>
                {t('End this number on a date')}
              </Button>
            </div>
          )}
          {ending && inUse && (
            <form
              className="row"
              style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
              onSubmit={(event) => {
                event.preventDefault();
                askEnd.mutate();
              }}
            >
              <Field label={t('Last day this number counts')}>
                <DateInput value={endDate} onChange={setEndDate} />
              </Field>
              <Button
                type="submit"
                variant="primary"
                disabled={!endDate}
                loading={askEnd.isPending}
              >
                {t('End this number')}
              </Button>
              <Button variant="ghost" onClick={() => setEnding(false)}>
                {t('Cancel')}
              </Button>
            </form>
          )}
          {preview && inUse && (
            <ConfirmDialog
              title={t('End scanner number {number}?', { number: inUse.scannerNumber })}
              confirmLabel={t('End this number')}
              cancelLabel={t('Cancel')}
              busy={end.isPending}
              onConfirm={() => end.mutate()}
              onCancel={() => setPreview(null)}
            >
              <p>
                {t('The number counts to this employee through {date}.', {
                  date: formatDate(endDate),
                })}
              </p>
              <p>
                {preview.daysReleased > 0
                  ? t(
                      '{count} later days that no one has decided go back to no one, and are counted for whoever holds the number then.',
                      { count: preview.daysReleased },
                    )
                  : t('No later day goes back to no one.')}
              </p>
              {preview.daysKept > 0 && (
                <p>
                  {t('{count} later days someone has decided stay with this employee.', {
                    count: preview.daysKept,
                  })}
                </p>
              )}
            </ConfirmDialog>
          )}
          {problem && !editing && (
            <div className="alert alert--danger" role="alert">
              {problem}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
