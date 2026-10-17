// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { qk } from '@/app/query-client';
import { Button, Card, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useT } from '@/lib/i18n/useT';
import type { EmployeeDetail } from '@/types/api';

/**
 * The employee's user number on the fingerprint scanner (CW-061, CW-090).
 * It is text, never a number: the scanner writes 007 and 007 is what is kept.
 * Giving a number to an employee counts the days that were waiting on it in
 * earlier scanner files; the days of a number they had before stay with them.
 */
export function ScannerNumberCard({
  person,
  canEdit,
}: {
  person: Pick<EmployeeDetail, 'id' | 'scannerId'>;
  canEdit: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
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
        </div>
      )}
    </Card>
  );
}
