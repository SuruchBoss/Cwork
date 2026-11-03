// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Counts the failed sign-ins for an address that has no account.
 *
 * An account that exists counts its failures in the database and, after too
 * many, refuses every sign-in for a while. An address with no account has
 * nowhere to keep a count, so this keeps the same count, with the same limit and
 * the same wait, in memory: every address is answered in the same way.
 *
 * It is deliberately small. A restart forgets it, as a restart forgets the
 * throttler's in-process counts.
 */
export class UnknownAccountAttempts {
  private readonly entries = new Map<string, { failures: number; lockedUntil: Date | null }>();

  constructor(
    private readonly maxFailedAttempts: number,
    private readonly lockoutMinutes: number,
    private readonly capacity = 10_000,
  ) {}

  /** When the lock ends, or null when this address is not locked. */
  lockedUntil(key: string, now: Date): Date | null {
    const lockedUntil = this.entries.get(normalise(key))?.lockedUntil ?? null;
    return lockedUntil && lockedUntil > now ? lockedUntil : null;
  }

  /** Counts one failure. The count is kept after the wait, as an account's is. */
  registerFailure(key: string, now: Date): void {
    const name = normalise(key);
    const failures = (this.entries.get(name)?.failures ?? 0) + 1;
    const lockedUntil =
      failures >= this.maxFailedAttempts
        ? new Date(now.getTime() + this.lockoutMinutes * 60_000)
        : null;
    this.entries.delete(name);
    this.entries.set(name, { failures, lockedUntil });
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}

const normalise = (key: string) => key.trim().toLowerCase();
