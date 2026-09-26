// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Whether an access token was issued before the sign-out that invalidated it.
 *
 * `sessionsValidFrom` marks the instant a forced sign-out, a password change or
 * a disabled account invalidated every token issued before it. Deciding that
 * means comparing two clocks that do not have the same resolution:
 *
 *   - `iat` is a JWT NumericDate — **whole seconds** (RFC 7519 §2). A token
 *     issued at 12:00:05.740 carries `iat` for 12:00:05.000.
 *   - `sessionsValidFrom` is a PostgreSQL timestamp, stored in milliseconds.
 *
 * Comparing them directly — `iat * 1000 < validFrom` — reads a token issued
 * *after* the invalidation as older than it, whenever the two fall in the same
 * second. A user whose password change lands at 12:00:05.740 and who signs in
 * at 12:00:05.900 is handed a token whose `iat` says 12:00:05.000, and every
 * request they make is refused with "session has been invalidated". Signing in
 * again fixes it, which is exactly what makes it hard to report.
 *
 * So the comparison happens at the resolution `iat` can actually express. A
 * token is refused only when the second it was issued in is strictly earlier
 * than the second the invalidation happened in.
 *
 * What that gives up: a token issued earlier in the *same second* as a real
 * invalidation is accepted. That window is at most 999ms wide and cannot be
 * closed while the decision rests on `iat` — the claim simply does not record
 * which millisecond it was minted in. It is also immaterial next to a choice
 * this system has already made deliberately: `sid` is not checked against the
 * `sessions` row, so revoking a session leaves its access token working until
 * it expires anyway. Closing the sub-second window means checking the session,
 * not sharpening this.
 */
export function tokenPredatesInvalidation(iat: number, sessionsValidFrom: Date): boolean {
  return iat < Math.floor(sessionsValidFrom.getTime() / 1000);
}
