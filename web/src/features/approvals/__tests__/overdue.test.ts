// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { ApprovalTask } from '@/types/api';
import { overdueDays, overdueFirst } from '../overdue';

// Local times on purpose: the days are counted on the browser's calendar, the
// way formatDate writes the due date, so the tests build their dates the same way.
const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute);
const iso = (date: Date) => date.toISOString();
const NOW = at(10, 18, 15).getTime();

function task(id: string, dueAt: string | null): ApprovalTask {
  return {
    id,
    stepIndex: 0,
    status: 'PENDING',
    dueAt,
    createdAt: '2026-10-01T00:00:00.000Z',
    instance: {
      id: `inst-${id}`,
      entityType: 'LEAVE_REQUEST',
      entityId: id,
      snapshot: {},
      submittedAt: '2026-10-01T00:00:00.000Z',
      submittedBy: { id: 'u', email: 'a@example.com', employee: null },
    },
  };
}

describe('overdueDays', () => {
  it('is null without a due time, before it, and exactly at it', () => {
    expect(overdueDays(null, NOW)).toBeNull();
    expect(overdueDays(iso(at(10, 18, 20)), NOW)).toBeNull();
    expect(overdueDays(iso(new Date(NOW)), NOW)).toBeNull();
  });

  it('counts calendar days between the due date and today', () => {
    // "Due 4 Oct" read on 18 Oct is 14 days late, whatever the hours
    expect(overdueDays(iso(at(10, 4, 9)), NOW)).toBe(14);
    expect(overdueDays(iso(at(10, 4, 23, 59)), NOW)).toBe(14);
    expect(overdueDays(iso(at(10, 4, 0, 1)), NOW)).toBe(14);
    expect(overdueDays(iso(at(10, 17, 9)), NOW)).toBe(1);
  });

  it('counts a due time crossed at midnight as one day', () => {
    const justAfterMidnight = at(10, 18, 1).getTime();
    expect(overdueDays(iso(at(10, 17, 23)), justAfterMidnight)).toBe(1);
  });

  it('counts lateness on the due day itself as one day, never zero', () => {
    expect(overdueDays(iso(at(10, 18, 9)), NOW)).toBe(1);
    expect(overdueDays(iso(at(10, 18, 14, 59)), NOW)).toBe(1);
  });
});

describe('overdueFirst', () => {
  it('puts late tasks first, most late on top, and keeps the API order for the rest', () => {
    const ordered = overdueFirst(
      [
        task('a', null),
        task('b', iso(at(10, 19, 9))),
        task('c', iso(at(10, 16, 9))),
        task('d', null),
        task('e', iso(at(10, 14, 9))),
        task('f', iso(at(10, 16, 18))),
        task('g', iso(at(10, 13, 9))),
      ],
      NOW,
    );
    // g is 5 days late, e 4, c and f 2 (a tie: the API's order holds)
    expect(ordered.map((t) => t.id)).toEqual(['g', 'e', 'c', 'f', 'a', 'b', 'd']);
  });

  it('does not change the list it is given', () => {
    const input = [task('a', null), task('b', iso(at(10, 16, 9)))];
    overdueFirst(input, NOW);
    expect(input.map((t) => t.id)).toEqual(['a', 'b']);
  });
});
