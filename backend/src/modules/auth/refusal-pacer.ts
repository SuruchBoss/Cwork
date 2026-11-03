// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { HttpException, Inject, Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';

/** The clock the pacer reads and waits on, so a test can supply its own. */
export interface PacingClock {
  /** Milliseconds from any fixed starting point; only differences matter. */
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const PACING_CLOCK = 'PACING_CLOCK';

export const systemClock: PacingClock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** How much longer to wait for a refusal to have taken `minimumMs` in all. */
export function remainingWait(minimumMs: number, elapsedMs: number): number {
  return Math.max(0, minimumMs - elapsedMs);
}

/**
 * Makes a refused sign-in take at least a fixed time, whichever way it was
 * refused.
 *
 * The refusals do different amounts of work: one for an account that exists
 * writes a count to the database, one for an address with none does not, and no
 * amount of imitating the one in the other keeps the two the same length. So
 * the length is set from outside instead: a refusal is not answered until
 * `refusedSignInMinMillis` have passed since the request began, which is more
 * than the slowest refusal takes. A sign-in that succeeds is not held back.
 */
@Injectable()
export class RefusalPacer {
  constructor(
    @Inject(APP_CONFIG) private readonly config: RootConfig,
    @Inject(PACING_CLOCK) private readonly clock: PacingClock,
  ) {}

  async pace<T>(attempt: () => Promise<T>): Promise<T> {
    const started = this.clock.now();
    try {
      return await attempt();
    } catch (error) {
      // A server fault (5xx) is not a refusal and is not held back.
      if (error instanceof HttpException && error.getStatus() < 500) {
        const wait = remainingWait(
          this.config.auth.refusedSignInMinMillis,
          this.clock.now() - started,
        );
        if (wait > 0) await this.clock.sleep(wait);
      }
      throw error;
    }
  }
}
