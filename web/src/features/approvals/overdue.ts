// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { differenceInCalendarDays } from 'date-fns';
import type { ApprovalTask } from '@/types/api';

/**
 * How many days a task is past its due date, or null when it is not late (or
 * has no due time). Days are calendar days in the same time zone that
 * `formatDate` writes the due date in (the browser's), so "Due 4 Oct" read on
 * 18 Oct says 14 days, as a person counting on a calendar would. Lateness on
 * the due day itself counts as one day, so a badge never says "0 days".
 */
export function overdueDays(dueAt: string | null, now: number): number | null {
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  if (!(now > due)) return null;
  return Math.max(1, differenceInCalendarDays(now, due));
}

/**
 * Late tasks first, the most late at the top; the rest keep the order the API
 * gave them (newest request first: `listMyTasks` orders by `createdAt` desc).
 */
export function overdueFirst(tasks: ApprovalTask[], now: number): ApprovalTask[] {
  return tasks
    .map((task, index) => ({ task, index, days: overdueDays(task.dueAt, now) }))
    .sort((a, b) => {
      if (a.days !== null && b.days !== null) return b.days - a.days || a.index - b.index;
      if (a.days !== null) return -1;
      if (b.days !== null) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.task);
}
