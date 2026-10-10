// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { qk } from '@/app/query-client';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/useT';
import { CODE_FORMAT, LOCATION_CODE_FORMAT, orgErrorMessage } from './organization-errors';

/**
 * Adding departments, positions and work locations from the console (CW-072).
 *
 * The forms call the endpoints that were already there and add no rule of their
 * own beyond one check: a name that is already taken. The API keeps codes
 * unique but not names, while the employee import matches a department,
 * position or work location by code *or* name and calls two records with the
 * same name ambiguous. A duplicate name entered here would therefore break the
 * very import this screen exists for, so the form refuses it before sending.
 */

export interface DepartmentRecord {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  parentId: string | null;
}

export interface PositionRecord {
  id: string;
  code: string;
  title: string;
  titleEn: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
}

export interface WorkLocationRecord {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** The minimum daily wage HR read from the Wage Committee's announcement (CW-069). */
  minimumDailyWage?: string | null;
  minimumDailyWageSource?: string | null;
}

export type OrgEditor =
  | { kind: 'department'; record?: DepartmentRecord }
  | { kind: 'position'; record?: PositionRecord }
  | { kind: 'location'; record?: WorkLocationRecord };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Codes are typed in capitals; doing it as the person types saves a refusal. */
const upper = (value: string) => value.toUpperCase().replace(/\s+/g, '');

export function OrgEditorCard({
  editor,
  departments,
  positions,
  locations,
  onDone,
}: {
  editor: OrgEditor;
  departments: DepartmentRecord[];
  positions: PositionRecord[];
  locations: WorkLocationRecord[];
  onDone: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const editing = editor.record;

  const [code, setCode] = useState(editing?.code ?? '');
  const [name, setName] = useState(
    editor.kind === 'department'
      ? (editor.record?.name ?? '')
      : editor.kind === 'position'
        ? (editor.record?.title ?? '')
        : (editor.record?.name ?? ''),
  );
  const [nameEn, setNameEn] = useState(
    editor.kind === 'department'
      ? (editor.record?.nameEn ?? '')
      : editor.kind === 'position'
        ? (editor.record?.titleEn ?? '')
        : '',
  );
  const [parentId, setParentId] = useState(
    editor.kind === 'department'
      ? (editor.record?.parentId ?? '')
      : editor.kind === 'position'
        ? (editor.record?.departmentId ?? '')
        : '',
  );
  // Cwork keeps no table of minimum wages: they differ by area and business
  // type, so HR enters the one that applies here and where it was read (CW-069).
  const location = editor.kind === 'location' ? editor.record : undefined;
  const [minimumWage, setMinimumWage] = useState(
    location?.minimumDailyWage ? String(Number(location.minimumDailyWage)) : '',
  );
  const [wageSource, setWageSource] = useState(location?.minimumDailyWageSource ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  const taken = (): boolean => {
    const others: { id: string; name: string }[] =
      editor.kind === 'department'
        ? departments
        : editor.kind === 'position'
          ? positions.map((p) => ({ id: p.id, name: p.title }))
          : locations.filter((l) => l.isActive);
    return others.some((other) => other.id !== editing?.id && sameName(other.name, name));
  };

  const save = useMutation({
    mutationFn: async () => {
      const english = nameEn.trim() || undefined;
      if (editor.kind === 'department') {
        const body = {
          name: name.trim(),
          nameEn: english,
          parentId: parentId || (editing ? null : undefined),
        };
        return editing
          ? api.patch(`/departments/${editing.id}`, body)
          : api.post('/departments', { ...body, code });
      }
      if (editor.kind === 'position') {
        const body = {
          title: name.trim(),
          titleEn: english,
          departmentId: parentId || (editing ? null : undefined),
        };
        return editing
          ? api.patch(`/positions/${editing.id}`, body)
          : api.post('/positions', { ...body, code });
      }
      const wage = minimumWage.trim() ? Number(minimumWage) : null;
      const body = {
        name: name.trim(),
        minimumDailyWage: wage ?? (editing ? null : undefined),
        minimumDailyWageSource: wage !== null ? wageSource.trim() : editing ? null : undefined,
      };
      return editing
        ? api.patch(`/work-locations/${editing.id}`, body)
        : api.post('/work-locations', { ...body, code });
    },
    onSuccess: () => {
      // A position shows its department's name, so renaming a department refreshes both.
      const keys =
        editor.kind === 'department'
          ? [qk.departments, qk.positions]
          : editor.kind === 'position'
            ? [qk.positions]
            : [qk.workLocations];
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
      onDone();
    },
    onError: (error) => setProblem(orgErrorMessage(error, editor.kind, code, t)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (!editing && !code) return setProblem(t('Enter a code.'));
    if (!name.trim()) return setProblem(t('Enter a name.'));
    if (editor.kind === 'location' && minimumWage.trim()) {
      const wage = Number(minimumWage);
      if (!Number.isFinite(wage) || wage <= 0) {
        return setProblem(t('Enter the minimum daily wage as an amount in baht.'));
      }
      if (!wageSource.trim()) {
        return setProblem(t('Say which Wage Committee announcement the minimum wage comes from.'));
      }
    }
    if (taken()) {
      return setProblem(
        t('"{name}" is already used. Choose another name, so an import can tell them apart.', {
          name: name.trim(),
        }),
      );
    }
    save.mutate();
  };

  const title = {
    department: editing ? t('Rename a department') : t('Add a department'),
    position: editing ? t('Rename a position') : t('Add a position'),
    location: editing ? t('Edit a work location') : t('Add a work location'),
  }[editor.kind];

  const nameLabel =
    editor.kind === 'position'
      ? t('Position title')
      : editor.kind === 'department'
        ? t('Department name')
        : t('Work location name');

  // Departments other than the one being edited, so a department cannot be its own parent.
  const parents = departments.filter((d) => d.id !== editing?.id);

  return (
    <Card title={title}>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="toolbar">
          {editing ? (
            <Field label={t('Code')} hint={t('A code is not changed once it is set up.')}>
              <Input value={editing.code} readOnly />
            </Field>
          ) : (
            <Field
              label={t('Code')}
              hint={
                editor.kind === 'location'
                  ? t('For example HQ or BKK-01')
                  : t('For example HR or SALES-01')
              }
            >
              <Input
                // The form opens on a click elsewhere on the page; focus brings it into view.
                autoFocus
                value={code}
                onChange={(e) => setCode(upper(e.target.value))}
                maxLength={32}
                autoComplete="off"
                className="mono"
              />
            </Field>
          )}
          <Field label={nameLabel}>
            <Input
              autoFocus={Boolean(editing)}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </Field>
          {editor.kind !== 'location' && (
            <Field label={t('English name (optional)')}>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={120} />
            </Field>
          )}
          {editor.kind !== 'location' && (
            <Field
              label={
                editor.kind === 'department'
                  ? t('Parent department (optional)')
                  : t('Department (optional)')
              }
            >
              <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">{t('— None —')}</option>
                {parents.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {editor.kind === 'location' && (
          <div className="toolbar">
            <Field
              label={t('Minimum daily wage (baht, optional)')}
              hint={t(
                'Checked against every daily rate here. Cwork does not know the rates itself.',
              )}
            >
              <Input
                inputMode="decimal"
                value={minimumWage}
                onChange={(e) => setMinimumWage(e.target.value.replace(/[^\d.]/g, ''))}
                maxLength={10}
                autoComplete="off"
              />
            </Field>
            <Field
              label={t('From the announcement')}
              hint={t('For example: Wage Committee announcement No. 14')}
            >
              <Input
                value={wageSource}
                onChange={(e) => setWageSource(e.target.value)}
                maxLength={255}
              />
            </Field>
          </div>
        )}
        {!editing && (
          <p className="muted" style={{ margin: 0 }}>
            {editor.kind === 'location'
              ? `${t(LOCATION_CODE_FORMAT)} ${t(
                  'The code is fixed once anyone clocks in there or is based there. A wrong code after that is replaced, not edited.',
                )}`
              : t(CODE_FORMAT)}
          </p>
        )}
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
    </Card>
  );
}
