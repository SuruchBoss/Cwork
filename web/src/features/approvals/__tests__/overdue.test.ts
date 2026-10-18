// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { ApprovalTask } from '@/types/api';
import { overdueDays, overdueFirst } from '../overdue';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

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
    expect(overdueDays(hoursAhead(5), NOW)).toBeNull();
    expect(overdueDays(new Date(NOW).toISOString(), NOW)).toBeNull();
  });

  it('counts any lateness up to a day as one day, then whole days', () => {
    expect(overdueDays(hoursAgo(1), NOW)).toBe(1);
    expect(overdueDays(hoursAgo(24), NOW)).toBe(1);
    expect(overdueDays(hoursAgo(25), NOW)).toBe(2);
    expect(overdueDays(hoursAgo(24 * 5), NOW)).toBe(5);
  });
});

describe('overdueFirst', () => {
  it('puts late tasks first, most late on top, and keeps the API order for the rest', () => {
    const ordered = overdueFirst(
      [
        task('a', null),
        task('b', hoursAhead(3)),
        task('c', hoursAgo(30)),
        task('d', null),
        task('e', hoursAgo(80)),
        task('f', hoursAgo(31)),
        task('g', hoursAgo(100)),
      ],
      NOW,
    );
    // g is 5 days late, e 4, c and f 2 (a tie: the API's order holds)
    expect(ordered.map((t) => t.id)).toEqual(['g', 'e', 'c', 'f', 'a', 'b', 'd']);
  });

  it('does not change the list it is given', () => {
    const input = [task('a', null), task('b', hoursAgo(30))];
    overdueFirst(input, NOW);
    expect(input.map((t) => t.id)).toEqual(['a', 'b']);
  });
});
