// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { JOB_LOCKS, JOB_LOCK_NAMESPACE, lockIdFor } from './job-locks';

const INT32_MAX = 2_147_483_647;

/**
 * Small guarantees, but every one of them is a silent failure if it breaks:
 * a duplicate id means two jobs block each other and nobody finds out, and a
 * value Postgres cannot take means the lock query errors at 02:00.
 */
describe('job locks', () => {
  it('gives every job an id of its own', () => {
    const ids = Object.values(JOB_LOCKS);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stays inside the signed 32-bit range Postgres accepts', () => {
    for (const id of [JOB_LOCK_NAMESPACE, ...Object.values(JOB_LOCKS)]) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThanOrEqual(INT32_MAX);
    }
  });

  it('returns the same id for the same job every time', () => {
    // Not a tautology: it is the promise that the id is a constant and not
    // something derived from a hash, a load order or a clock. Two instances
    // mid-deploy only exclude each other while this holds.
    expect(lockIdFor('attendance-close-out')).toBe(3);
    expect(lockIdFor('attendance-close-out')).toBe(lockIdFor('attendance-close-out'));
  });
});
