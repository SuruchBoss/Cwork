// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { addDays, calendarToday, isoDate } from './dates';
import type { Api } from './test-app';

/**
 * The first day, `daysAhead` days from the organisation's today or later, that the
 * leave calendar will charge for this person: not a weekend, not a public holiday.
 *
 * A spec that files leave on "today plus N" is refused on the days of the week when N
 * lands on a weekend, so it passes on some days and fails on others. Ask the calendar
 * instead of counting.
 */
export async function firstWorkingDay(
  api: Api,
  token: string,
  leaveTypeId: string,
  daysAhead: number,
  from: Date = calendarToday(),
): Promise<string> {
  for (let offset = 0; offset < 14; offset += 1) {
    const date = isoDate(addDays(from, daysAhead + offset));
    const preview = await api.post('/leave/requests/preview', token, {
      leaveTypeId,
      startDate: date,
      endDate: date,
    });
    if (preview.status < 400 && Number(preview.body.totalDays) > 0) return date;
  }
  throw new Error('No working day found in the fortnight after the offset');
}
