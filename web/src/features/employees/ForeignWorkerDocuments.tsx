// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { qk } from '@/app/query-client';
import { Badge, Button, Card, DateInput, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatDate, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type { EmployeeDetail } from '@/types/api';

/**
 * A foreign worker's passport and work permit (CW-068): the two numbers and
 * when each expires. The numbers are shown only to someone who may see
 * sensitive identifiers, like the national ID; someone who may edit the
 * record but not read them can still enter a renewed one. The dates are not
 * secret, and they are what HR watches.
 */
export function ForeignWorkerDocuments({
  person,
  canEdit,
}: {
  person: EmployeeDetail;
  canEdit: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const canRead = 'passportNo' in person;

  const recorded = (number: 'passport' | 'workPermit') =>
    number === 'passport'
      ? Boolean(person.passportNo) || Boolean(person.passportNoRecorded)
      : Boolean(person.workPermitNo) || Boolean(person.workPermitNoRecorded);
  const hasAny =
    recorded('passport') ||
    recorded('workPermit') ||
    Boolean(person.passportExpiresOn) ||
    Boolean(person.workPermitExpiresOn);

  const number = (value: string | null | undefined, onFile: boolean) => {
    if (canRead) return value ?? '—';
    return onFile ? t('Recorded; not permitted to view') : '—';
  };

  return (
    <Card
      title={t('Passport and work permit')}
      actions={
        canEdit && !editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {hasAny ? t('Edit') : t('Add')}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <DocumentsForm person={person} canRead={canRead} onDone={() => setEditing(false)} />
      ) : hasAny ? (
        <dl className="stack stack--sm" style={{ margin: 0 }}>
          <Row label={t('Passport no.')} value={number(person.passportNo, recorded('passport'))} />
          <Row label={t('Passport expiry')} value={<Expiry date={person.passportExpiresOn} />} />
          <Row
            label={t('Work permit no.')}
            value={number(person.workPermitNo, recorded('workPermit'))}
          />
          <Row
            label={t('Work permit expiry')}
            value={<Expiry date={person.workPermitExpiresOn} />}
          />
        </dl>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          {t('None recorded. For a foreign worker.')}
        </p>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="row row--between" style={{ gap: 16, alignItems: 'baseline' }}>
      <dt className="subtle" style={{ flexShrink: 0 }}>
        {label}
      </dt>
      <dd style={{ margin: 0, textAlign: 'right' }}>{value}</dd>
    </div>
  );
}

function Expiry({ date }: { date: string | null | undefined }) {
  const t = useT();
  if (!date) return <>—</>;
  const day = date.slice(0, 10);
  return (
    <span className="row" style={{ gap: 6 }}>
      {formatDate(day)}
      {day < todayIso() && <Badge tone="danger">{t('Expired')}</Badge>}
    </span>
  );
}

function DocumentsForm({
  person,
  canRead,
  onDone,
}: {
  person: EmployeeDetail;
  canRead: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

  const [passportNo, setPassportNo] = useState(canRead ? (person.passportNo ?? '') : '');
  const [passportExpiresOn, setPassportExpiresOn] = useState(day(person.passportExpiresOn));
  const [workPermitNo, setWorkPermitNo] = useState(canRead ? (person.workPermitNo ?? '') : '');
  const [workPermitExpiresOn, setWorkPermitExpiresOn] = useState(day(person.workPermitExpiresOn));
  const [problem, setProblem] = useState<string | null>(null);

  // Only what changed is sent. Someone who cannot read the numbers sees them
  // blank, so for them blank means "keep", not "clear".
  const changes = () => {
    const body: Record<string, string | null> = {};
    const numberChange = (key: string, value: string, before: string | null | undefined) => {
      const typed = value.trim();
      if (canRead) {
        if (typed !== (before ?? '')) body[key] = typed || null;
      } else if (typed) {
        body[key] = typed;
      }
    };
    numberChange('passportNo', passportNo, person.passportNo);
    numberChange('workPermitNo', workPermitNo, person.workPermitNo);
    if (passportExpiresOn !== day(person.passportExpiresOn)) {
      body.passportExpiresOn = passportExpiresOn || null;
    }
    if (workPermitExpiresOn !== day(person.workPermitExpiresOn)) {
      body.workPermitExpiresOn = workPermitExpiresOn || null;
    }
    return body;
  };

  const save = useMutation({
    mutationFn: (body: Record<string, string | null>) => api.patch(`/employees/${person.id}`, body),
    // Wait for the fresh record, so the card does not flash the old values.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.employee(person.id) });
      onDone();
    },
    onError: (error) => {
      const passport =
        error instanceof ApiError &&
        error.code === 'VALIDATION_FAILED' &&
        JSON.stringify(error.details ?? '').includes('passportNo');
      setProblem(
        passport
          ? t('A passport number is 5 to 20 English letters and digits.')
          : error instanceof Error
            ? error.message
            : t('Could not save'),
      );
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    const body = changes();
    if (Object.keys(body).length === 0) return onDone();
    save.mutate(body);
  };

  const keepHint = (onFile: boolean | undefined) =>
    !canRead && onFile ? t('A number is on file. Leave blank to keep it.') : undefined;

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <Field label={t('Passport no.')} hint={keepHint(person.passportNoRecorded)}>
          <Input
            autoFocus
            value={passportNo}
            onChange={(e) => setPassportNo(e.target.value)}
            maxLength={30}
            autoComplete="off"
            className="mono"
          />
        </Field>
        <Field label={t('Passport expiry')}>
          <DateInput value={passportExpiresOn} onChange={setPassportExpiresOn} />
        </Field>
      </div>
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <Field label={t('Work permit no.')} hint={keepHint(person.workPermitNoRecorded)}>
          <Input
            value={workPermitNo}
            onChange={(e) => setWorkPermitNo(e.target.value)}
            maxLength={32}
            autoComplete="off"
            className="mono"
          />
        </Field>
        <Field label={t('Work permit expiry')}>
          <DateInput value={workPermitExpiresOn} onChange={setWorkPermitExpiresOn} />
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
        <Button variant="ghost" onClick={onDone}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}
