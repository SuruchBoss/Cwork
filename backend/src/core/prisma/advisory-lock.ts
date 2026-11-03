// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Postgres advisory locks Cwork takes, and the namespace they all share.
 *
 * `0x43574F52` spells `CWOR` — arbitrary, but recognisable in `pg_locks.classid`
 * and comfortably inside a signed 32-bit integer. Postgres takes two 32-bit keys
 * or one 64-bit one; two keys is the form that lets a namespace exist at all, so
 * Cwork cannot collide with another application sharing the database.
 */
export const ADVISORY_LOCK_NAMESPACE = 0x43574f52;

/**
 * Lock ids that are **not** scheduled jobs.
 *
 * Jobs number themselves from 1 upwards in `modules/jobs/domain/job-locks.ts`;
 * everything here starts at 1000 so the two sequences can grow without ever
 * having to meet. The same rule applies on both sides: **never renumber or
 * reuse an id.** A rolling deploy runs two versions side by side, and they only
 * agree on who holds what while an id means the same thing in both.
 */
export const ADVISORY_LOCKS = {
  /**
   * Held for the length of first-run setup. Two browsers posting the wizard at
   * the same moment would otherwise each see an empty database and each create
   * an organisation, and the loser's administrator would be a second, silent
   * account with full permissions.
   */
  'first-run-setup': 1000,
} as const;

export type AdvisoryLockName = keyof typeof ADVISORY_LOCKS;

/**
 * Locks that are keyed by a row's identity rather than named one by one, such as
 * "writes for this scanner number". Postgres takes two 32-bit keys: the first is
 * the family below and the second is `hashtext` of what the lock is for.
 *
 * A family is never `ADVISORY_LOCK_NAMESPACE`, so a hash that happens to land on a
 * job's or a named lock's id cannot be mistaken for it: two hashes that meet only
 * make two writers for the same family wait a moment for each other. **Never
 * renumber or reuse a family.**
 */
export const ADVISORY_LOCK_FAMILIES = {
  /** `SCAN`. Writes to one scanner number of one organisation, one at a time (CW-109). */
  'scanner-number': 0x5343414e,
} as const;
