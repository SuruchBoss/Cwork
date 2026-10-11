// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { qk } from '@/app/query-client';
import { Button, Card, EmptyState, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatDate, formatYear } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';

export interface Holiday {
  id: string;
  date: string;
  name: string;
  nameEn: string | null;
  workLocationId: string | null;
  /** The holiday this row was entered as the substitute for (CW-081). */
  substituteForId: string | null;
  substituteFor: { id: string; date: string; name: string } | null;
  /** On a weekend holiday with no substitute entered: where a Monday-to-Friday week takes it. */
  substituteOnWeekdays: string | null;
}

const DAY_MS = 86_400_000;

/**
 * The year's public holidays (CW-081). A holiday on the weekly day off is
 * taken on another day (Labour Protection Act s.29): Cwork works that day out
 * for each employee, and shows here where it lands for a Monday-to-Friday
 * week. HR can instead mark a holiday row as the substitute for another, and
 * that day is then used for everyone whose day off the holiday fell on.
 */
export function HolidaysCard({ year, canManage }: { year: number; canManage: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const holidays = useQuery({
    queryKey: qk.holidays(year),
    queryFn: () => api.get<Holiday[]>('/holidays', { query: { year } }),
  });

  const mark = useMutation({
    mutationFn: ({ id, substituteForId }: { id: string; substituteForId: string | null }) =>
      api.patch(`/holidays/${id}`, { substituteForId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.holidays(year) }),
    onError: (error) => setProblem(holidayError(error, t)),
  });

  const rows = holidays.data ?? [];
  const takenOn = new Map(
    rows.filter((r) => r.substituteForId).map((r) => [r.substituteForId!, r.date]),
  );
  // What a row could stand in for: an ordinary holiday of the same calendar,
  // up to a month before it, that has no substitute yet.
  const candidates = (row: Holiday) =>
    rows.filter(
      (other) =>
        other.id !== row.id &&
        other.substituteForId === null &&
        other.workLocationId === row.workLocationId &&
        !takenOn.has(other.id) &&
        other.date < row.date &&
        Date.parse(row.date) - Date.parse(other.date) <= 31 * DAY_MS,
    );

  return (
    <Card title={t('Public holidays {year}', { year: formatYear(year) })} flush>
      {problem && (
        <div className="alert alert--danger" role="alert" style={{ margin: 12 }}>
          {problem}
        </div>
      )}
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {rows.map((holiday) => {
                const options = holiday.substituteForId === null ? candidates(holiday) : [];
                return (
                  <tr key={holiday.id}>
                    <td style={{ width: 130 }}>{formatDate(holiday.date)}</td>
                    <td>
                      {holiday.name}
                      {holiday.nameEn && <div className="subtle">{holiday.nameEn}</div>}
                      {holiday.substituteFor && (
                        <div className="subtle">
                          {t('Substitute for {name}, {date}', {
                            name: holiday.substituteFor.name,
                            date: formatDate(holiday.substituteFor.date),
                          })}
                        </div>
                      )}
                      {takenOn.has(holiday.id) && (
                        <div className="subtle">
                          {t('On the weekly day off: taken on {date}, marked by HR', {
                            date: formatDate(takenOn.get(holiday.id)!),
                          })}
                        </div>
                      )}
                      {holiday.substituteOnWeekdays && (
                        <div className="subtle">
                          {t(
                            'On a weekend: taken on {date} for a Monday-to-Friday week, unless a later holiday row is marked as its substitute',
                            { date: formatDate(holiday.substituteOnWeekdays) },
                          )}
                        </div>
                      )}
                    </td>
                    {canManage && (
                      <td style={{ width: 240 }}>
                        {holiday.substituteForId ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={mark.isPending && mark.variables?.id === holiday.id}
                            onClick={() => {
                              setProblem(null);
                              mark.mutate({ id: holiday.id, substituteForId: null });
                            }}
                          >
                            {t('Not a substitute')}
                          </Button>
                        ) : (
                          options.length > 0 && (
                            <Select
                              aria-label={t('Substitute for {name}', { name: holiday.name })}
                              value=""
                              disabled={mark.isPending}
                              onChange={(e) => {
                                setProblem(null);
                                mark.mutate({ id: holiday.id, substituteForId: e.target.value });
                              }}
                            >
                              <option value="">{t('Mark as a substitute for…')}</option>
                              {options.map((other) => (
                                <option key={other.id} value={other.id}>
                                  {formatDate(other.date)} {other.name}
                                </option>
                              ))}
                            </Select>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="⌗" title={t('No holidays set yet')} />
      )}
    </Card>
  );
}

function holidayError(error: unknown, t: ReturnType<typeof useT>): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'HOLIDAY_ALREADY_HAS_SUBSTITUTE':
        return t('That holiday already has a substitute day.');
      case 'SUBSTITUTE_OF_SUBSTITUTE':
        return t('A substitute day cannot stand in for another substitute, or have one.');
      case 'SUBSTITUTE_NOT_AFTER_HOLIDAY':
        return t('A substitute day comes after the holiday it stands in for.');
      case 'SUBSTITUTE_LOCATION_MISMATCH':
        return t('A substitute applies to the same work location as its holiday.');
    }
  }
  return error instanceof Error ? error.message : t('Could not save');
}
