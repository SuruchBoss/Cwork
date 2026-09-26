// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { useState } from 'react';
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
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { isoDate, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { Roster, Shift, WorkSchedule } from '@/types/api';

type Tab = 'roster' | 'shifts' | 'schedules';
type NamedRef = { id: string; name: string };

// `key` is an English weekday abbreviation, translated at render.
const WEEKDAYS = [
  { n: 1, key: 'Mon' },
  { n: 2, key: 'Tue' },
  { n: 3, key: 'Wed' },
  { n: 4, key: 'Thu' },
  { n: 5, key: 'Fri' },
  { n: 6, key: 'Sat' },
  { n: 7, key: 'Sun' },
];

/** ISO weekday (1=Mon…7=Sun) of a `YYYY-MM-DD` string, read in UTC. */
function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function RosterPage() {
  const [tab, setTab] = useState<Tab>('roster');
  const canManage = useAuthStore((s) => s.can)(P.SHIFT_MANAGE);
  const t = useT();

  return (
    <div className="page">
      <PageHeader
        title={t('Shifts & roster')}
        description={t(
          'Define shifts, weekly schedules and assignments — what you set here is what the system uses to judge lateness',
        )}
      />

      <div className="row" role="tablist" style={{ gap: 8 }}>
        <Button variant={tab === 'roster' ? 'primary' : 'ghost'} onClick={() => setTab('roster')}>
          {t('Roster')}
        </Button>
        <Button variant={tab === 'shifts' ? 'primary' : 'ghost'} onClick={() => setTab('shifts')}>
          {t('Shifts')}
        </Button>
        <Button
          variant={tab === 'schedules' ? 'primary' : 'ghost'}
          onClick={() => setTab('schedules')}
        >
          {t('Schedules')}
        </Button>
      </div>

      {tab === 'roster' && <RosterTab canManage={canManage} />}
      {tab === 'shifts' && <ShiftsTab canManage={canManage} />}
      {tab === 'schedules' && <SchedulesTab canManage={canManage} />}
    </div>
  );
}

// --------------------------------------------------------------------- shifts

function ShiftsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const t = useT();
  const [creating, setCreating] = useState(false);
  const empty = { code: '', name: '', startTime: '09:00', endTime: '18:00', graceInMinutes: 5 };
  const [form, setForm] = useState(empty);

  const shifts = useQuery({
    queryKey: qk.shifts(),
    queryFn: () => api.get<Shift[]>('/shifts'),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['shifts'] });

  const create = useMutation({
    mutationFn: () =>
      api.post('/shifts', {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        startTime: form.startTime,
        endTime: form.endTime,
        graceInMinutes: Number(form.graceInMinutes),
      }),
    onSuccess: () => {
      setCreating(false);
      setForm(empty);
      invalidate();
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/shifts/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="stack">
      {canManage && (
        <div className="row">
          <Button variant="primary" onClick={() => setCreating((v) => !v)}>
            + {t('Add shift')}
          </Button>
        </div>
      )}

      {creating && (
        <Card title={t('New shift')}>
          <div className="stack">
            <div className="toolbar">
              <Field label={t('Shift code')}>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="DAY"
                />
              </Field>
              <Field label={t('Shift name')}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t('Day shift')}
                />
              </Field>
              <Field label={t('Start time')}>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </Field>
              <Field label={t('End time')}>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </Field>
              <Field label={t('Grace (minutes)')}>
                <Input
                  type="number"
                  min={0}
                  value={form.graceInMinutes}
                  onChange={(e) =>
                    setForm({ ...form, graceInMinutes: Number(e.target.value) || 0 })
                  }
                />
              </Field>
            </div>
            <div className="row">
              <Button
                variant="primary"
                loading={create.isPending}
                disabled={!form.code.trim() || !form.name.trim()}
                onClick={() => create.mutate()}
              >
                {t('Save')}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                {t('Cancel')}
              </Button>
            </div>
            {create.isError && (
              <div className="alert alert--danger" role="alert">
                {errorMessage(create.error, t('Could not save'))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card flush>
        {shifts.isLoading ? (
          <TableSkeleton rows={5} columns={5} />
        ) : shifts.isError ? (
          <ErrorState error={shifts.error} onRetry={() => void shifts.refetch()} />
        ) : shifts.data && shifts.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Code')}</th>
                  <th>{t('Shift name')}</th>
                  <th>{t('Time')}</th>
                  <th className="num">{t('Grace')}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {shifts.data.map((shift) => (
                  <tr key={shift.id}>
                    <td className="mono">{shift.code}</td>
                    <td style={{ fontWeight: 500 }}>{shift.name}</td>
                    <td>
                      {shift.startTime}–{shift.endTime}
                      {shift.crossesMidnight && <span className="subtle"> (+1)</span>}
                    </td>
                    <td className="num">
                      {shift.graceInMinutes} {t('min')}
                    </td>
                    {canManage && (
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={deactivate.isPending && deactivate.variables === shift.id}
                          onClick={() => deactivate.mutate(shift.id)}
                        >
                          {t('Deactivate')}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="◷"
            title={t('No shifts yet')}
            description={t('Add a shift to set clock times and lateness')}
          />
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------- schedules

function SchedulesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const t = useT();
  const [creating, setCreating] = useState(false);
  const empty = { code: '', name: '', workingDays: [1, 2, 3, 4, 5], defaultShiftId: '' };
  const [form, setForm] = useState<{
    code: string;
    name: string;
    workingDays: number[];
    defaultShiftId: string;
  }>(empty);

  const schedules = useQuery({
    queryKey: qk.workSchedules(),
    queryFn: () => api.get<WorkSchedule[]>('/work-schedules'),
  });
  const shifts = useQuery({
    queryKey: qk.shifts(),
    queryFn: () => api.get<Shift[]>('/shifts'),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['work-schedules'] });

  const create = useMutation({
    mutationFn: () =>
      api.post('/work-schedules', {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        workingDays: [...form.workingDays].sort((a, b) => a - b),
        defaultShiftId: form.defaultShiftId || undefined,
      }),
    onSuccess: () => {
      setCreating(false);
      setForm(empty);
      invalidate();
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/work-schedules/${id}`),
    onSuccess: invalidate,
  });

  const toggleDay = (n: number) =>
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(n)
        ? f.workingDays.filter((d) => d !== n)
        : [...f.workingDays, n],
    }));

  return (
    <div className="stack">
      {canManage && (
        <div className="row">
          <Button variant="primary" onClick={() => setCreating((v) => !v)}>
            + {t('Add schedule')}
          </Button>
        </div>
      )}

      {creating && (
        <Card title={t('New weekly schedule')}>
          <div className="stack">
            <div className="toolbar">
              <Field label={t('Code')}>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="MON_FRI"
                />
              </Field>
              <Field label={t('Schedule name')}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t('Monday–Friday')}
                />
              </Field>
              <Field label={t('Default shift')}>
                <Select
                  value={form.defaultShiftId}
                  onChange={(e) => setForm({ ...form, defaultShiftId: e.target.value })}
                >
                  <option value="">{t('— None —')}</option>
                  {(shifts.data ?? []).map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name} ({shift.startTime}–{shift.endTime})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t('Working days')}>
              <div className="row" style={{ gap: 6 }}>
                {WEEKDAYS.map((day) => (
                  <Button
                    key={day.n}
                    size="sm"
                    variant={form.workingDays.includes(day.n) ? 'primary' : 'ghost'}
                    onClick={() => toggleDay(day.n)}
                  >
                    {t(day.key)}
                  </Button>
                ))}
              </div>
            </Field>
            <div className="row">
              <Button
                variant="primary"
                loading={create.isPending}
                disabled={!form.code.trim() || !form.name.trim() || form.workingDays.length === 0}
                onClick={() => create.mutate()}
              >
                {t('Save')}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                {t('Cancel')}
              </Button>
            </div>
            {create.isError && (
              <div className="alert alert--danger" role="alert">
                {errorMessage(create.error, t('Could not save'))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card flush>
        {schedules.isLoading ? (
          <TableSkeleton rows={5} columns={4} />
        ) : schedules.isError ? (
          <ErrorState error={schedules.error} onRetry={() => void schedules.refetch()} />
        ) : schedules.data && schedules.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Code')}</th>
                  <th>{t('Schedule name')}</th>
                  <th>{t('Working days')}</th>
                  <th>{t('Default shift')}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {schedules.data.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className="mono">{schedule.code}</td>
                    <td style={{ fontWeight: 500 }}>{schedule.name}</td>
                    <td>
                      {WEEKDAYS.filter((d) => schedule.workingDays.includes(d.n))
                        .map((d) => t(d.key))
                        .join(' ')}
                    </td>
                    <td>{schedule.defaultShift?.name ?? '—'}</td>
                    {canManage && (
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={deactivate.isPending && deactivate.variables === schedule.id}
                          onClick={() => deactivate.mutate(schedule.id)}
                        >
                          {t('Deactivate')}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="▦"
            title={t('No schedules yet')}
            description={t('Create a weekly schedule, then assign it to employees on the Roster tab')}
          />
        )}
      </Card>
    </div>
  );
}

// -------------------------------------------------------------------- roster

function RosterTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const t = useT();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(isoDate(addDays(new Date(), 13)));
  const [departmentId, setDepartmentId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignForm, setAssignForm] = useState({
    scheduleId: '',
    departmentId: '',
    effectiveFrom: todayIso(),
    effectiveTo: '',
  });

  const departments = useQuery({
    queryKey: qk.departments,
    queryFn: () => api.get<NamedRef[]>('/departments'),
  });
  const schedules = useQuery({
    queryKey: qk.workSchedules(),
    queryFn: () => api.get<WorkSchedule[]>('/work-schedules'),
    enabled: canManage,
  });

  const roster = useQuery({
    queryKey: qk.roster(from, to, departmentId),
    queryFn: () =>
      api.get<Roster>('/roster', {
        query: { from, to, departmentId: departmentId || undefined },
      }),
    enabled: Boolean(from && to),
    placeholderData: (previous) => previous,
  });

  const assign = useMutation({
    mutationFn: () =>
      api.post('/schedule-assignments/bulk', {
        scheduleId: assignForm.scheduleId,
        departmentId: assignForm.departmentId,
        effectiveFrom: assignForm.effectiveFrom,
        effectiveTo: assignForm.effectiveTo || undefined,
      }),
    onSuccess: () => {
      setAssigning(false);
      void queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
  });

  const rows = roster.data?.employees ?? [];
  const dates = rows[0]?.days.map((d) => d.date) ?? [];

  return (
    <div className="stack">
      <Card>
        <div className="toolbar">
          <Field label={t('From')}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t('To')}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label={t('Department')}>
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">{t('All departments')}</option>
              {(departments.data ?? []).map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </Select>
          </Field>
          {canManage && (
            <Field label="&nbsp;">
              <Button variant="secondary" onClick={() => setAssigning((v) => !v)}>
                {t('Assign a schedule to a department')}
              </Button>
            </Field>
          )}
        </div>
      </Card>

      {assigning && canManage && (
        <Card title={t('Assign a schedule to a whole department')}>
          <div className="stack">
            <div className="toolbar">
              <Field label={t('Schedule')}>
                <Select
                  value={assignForm.scheduleId}
                  onChange={(e) => setAssignForm({ ...assignForm, scheduleId: e.target.value })}
                >
                  <option value="">{t('— Select a schedule —')}</option>
                  {(schedules.data ?? []).map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('Department')}>
                <Select
                  value={assignForm.departmentId}
                  onChange={(e) => setAssignForm({ ...assignForm, departmentId: e.target.value })}
                >
                  <option value="">{t('— Select a department —')}</option>
                  {(departments.data ?? []).map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('Effective from')}>
                <Input
                  type="date"
                  value={assignForm.effectiveFrom}
                  onChange={(e) => setAssignForm({ ...assignForm, effectiveFrom: e.target.value })}
                />
              </Field>
              <Field label={t('To (blank = indefinite)')}>
                <Input
                  type="date"
                  value={assignForm.effectiveTo}
                  onChange={(e) => setAssignForm({ ...assignForm, effectiveTo: e.target.value })}
                />
              </Field>
            </div>
            <div className="row">
              <Button
                variant="primary"
                loading={assign.isPending}
                disabled={!assignForm.scheduleId || !assignForm.departmentId}
                onClick={() => assign.mutate()}
              >
                {t('Assign')}
              </Button>
              <Button variant="ghost" onClick={() => setAssigning(false)}>
                {t('Cancel')}
              </Button>
            </div>
            {assign.isError && (
              <div className="alert alert--danger" role="alert">
                {errorMessage(assign.error, t('Could not assign'))}
              </div>
            )}
            {assign.isSuccess && <div className="alert alert--info">{t('Assigned successfully')}</div>}
          </div>
        </Card>
      )}

      <Card flush>
        {roster.isLoading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : roster.isError ? (
          <ErrorState error={roster.error} onRetry={() => void roster.refetch()} />
        ) : rows.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0 }}>{t('Employee')}</th>
                  {dates.map((date) => (
                    <th key={date} className="num" title={date}>
                      {Number(date.slice(8, 10))}
                      <div className="subtle" style={{ fontWeight: 400 }}>
                        {t(WEEKDAYS[isoWeekday(date) - 1].key)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employeeId}>
                    <td style={{ position: 'sticky', left: 0, fontWeight: 500 }}>
                      {row.name}
                      {row.department && <div className="subtle">{row.department}</div>}
                    </td>
                    {row.days.map((day) => (
                      <td key={day.date} className="num" title={day.shiftName ?? undefined}>
                        <RosterCell
                          shiftName={day.shiftName}
                          isDayOff={day.isDayOff}
                          source={day.source}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="◷"
            title={t('No employees in this range')}
            description={t('Pick a date range or department, then assign schedules to see the roster')}
          />
        )}
      </Card>
    </div>
  );
}

function RosterCell({
  shiftName,
  isDayOff,
  source,
}: {
  shiftName: string | null;
  isDayOff: boolean;
  source: 'override' | 'schedule' | 'none';
}) {
  const t = useT();
  if (isDayOff) return <span className="subtle">{t('Off')}</span>;
  if (!shiftName) return <span className="subtle">—</span>;
  // An override is a deliberate one-off, so mark it apart from the routine schedule.
  return source === 'override' ? (
    <Badge tone="info">{shiftName}</Badge>
  ) : (
    <span>{shiftName}</span>
  );
}
