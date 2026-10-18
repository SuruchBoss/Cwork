// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { ApprovalTask } from '@/types/api';

const DAY_MS = 86_400_000;

/**
 * How many days a task is past its due time, or null when it is not late (or
 * has no due time). Any lateness up to a day counts as one day, so a badge
 * never says "overdue by 0 days".
 */
export function overdueDays(dueAt: string | null, now: number): number | null {
  if (!dueAt) return null;
  const late = now - new Date(dueAt).getTime();
  if (!(late > 0)) return null;
  return Math.ceil(late / DAY_MS);
}

/**
 * Late tasks first, the most late at the top; the rest keep the order the API
 * gave them (it is already oldest first).
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
