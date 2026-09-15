/**
 * Which scheduled tasks must run once across the whole fleet, and the advisory
 * lock each one holds while it runs.
 *
 * Ids are written out by hand rather than hashed from the name. A hash is one
 * collision away from two unrelated jobs silently blocking each other for ever,
 * and a literal is what you can actually look for when `pg_locks` shows you
 * `objid = 3` at two in the morning.
 *
 * **Never renumber or reuse an id.** A rolling deploy runs the old and new
 * versions side by side, and they only agree on who holds what while an id
 * means the same job in both. Retiring a job means retiring its number with it.
 */
export const JOB_LOCKS = {
  'purge-rate-limit-counters': 1,
  'rescan-pending-files': 2,
  'attendance-close-out': 3,
  'finalise-separations': 4,
  'purge-expired-candidates': 5,
  'prune-expired-tokens': 6,
  'leave-year-rollover': 7,
  'purge-delivered-outbox': 8,
} as const;

export type JobName = keyof typeof JOB_LOCKS;

/**
 * The first half of every lock id, so Cwork cannot collide with another
 * application's advisory locks in a database it shares. Postgres takes two
 * 32-bit keys or one 64-bit one; two keys is the form that lets a namespace
 * exist at all.
 *
 * `0x43574F52` spells `CWOR` — arbitrary, but recognisable in `pg_locks.classid`
 * and comfortably inside a signed 32-bit integer.
 */
export const JOB_LOCK_NAMESPACE = 0x43574f52;

/** The lock id for a task, by name. */
export function lockIdFor(name: JobName): number {
  return JOB_LOCKS[name];
}
