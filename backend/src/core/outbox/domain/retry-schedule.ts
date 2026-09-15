/**
 * When a failed outbox event should be tried again, and when to stop trying.
 *
 * Pure arithmetic on purpose: retry policy is the part of a dispatcher that is
 * easy to get subtly wrong and impossible to observe once it is tangled up with
 * a database and a clock.
 */

/** First retry delay. Doubles each attempt. */
export const BASE_DELAY_MS = 30_000;

/**
 * Longest a retry is ever pushed out.
 *
 * Without a cap the eighth attempt lands two hours out and the tenth over a
 * day: by then whatever broke has been fixed and the event is still waiting for
 * a deadline set while it was broken.
 */
export const MAX_DELAY_MS = 30 * 60_000;

/**
 * Delay before the attempt that follows `attempts` failures.
 *
 * `attempts` is the count *including* the one that just failed, which is what
 * the row holds after it is incremented — so the first failure waits
 * `BASE_DELAY_MS`, not none.
 */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);

  // Guard the shift itself: 2 ** 1024 is Infinity, and `Infinity` in a date
  // arithmetic is an Invalid Date rather than a loud failure.
  if (exponent > 20) return MAX_DELAY_MS;

  return Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
}

/** When the event becomes eligible again after its `attempts`-th failure. */
export function nextAttemptAt(attempts: number, now: Date): Date {
  return new Date(now.getTime() + retryDelayMs(attempts));
}

/**
 * Whether the event has run out of attempts and belongs in the dead-letter
 * state rather than back in the queue.
 */
export function isExhausted(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}
