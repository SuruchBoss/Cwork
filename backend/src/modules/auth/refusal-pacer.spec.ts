// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RootConfig } from '../../core/config/configuration';
import { RefusalPacer, remainingWait, type PacingClock } from './refusal-pacer';

const config = (refusedSignInMinMillis: number) =>
  ({ auth: { refusedSignInMinMillis } }) as unknown as RootConfig;

/** A clock that only moves when told to, and records every wait asked of it. */
class FakeClock implements PacingClock {
  time = 0;
  readonly sleeps: number[] = [];
  now() {
    return this.time;
  }
  async sleep(ms: number) {
    this.sleeps.push(ms);
    this.time += ms;
  }
}

describe('remainingWait', () => {
  it('is what is left of the minimum', () => {
    expect(remainingWait(150, 40)).toBe(110);
  });

  it('is nothing once the minimum has passed', () => {
    expect(remainingWait(150, 150)).toBe(0);
    expect(remainingWait(150, 400)).toBe(0);
  });
});

describe('RefusalPacer', () => {
  const refusedAfter = (clock: FakeClock, took: number, error: Error) => async () => {
    clock.time += took;
    throw error;
  };

  it('holds a quick refusal until the minimum has passed since it began', async () => {
    const clock = new FakeClock();
    const pacer = new RefusalPacer(config(150), clock);

    await expect(
      pacer.pace(refusedAfter(clock, 25, new UnauthorizedException())),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(clock.sleeps).toEqual([125]);
    expect(clock.time).toBe(150);
  });

  it('makes a quick and a slow refusal take the same time', async () => {
    const clock = new FakeClock();
    const pacer = new RefusalPacer(config(150), clock);

    const finishes: number[] = [];
    for (const took of [25, 34]) {
      const begun = clock.time;
      await pacer.pace(refusedAfter(clock, took, new UnauthorizedException())).catch(() => {});
      finishes.push(clock.time - begun);
    }

    expect(finishes).toEqual([150, 150]);
  });

  it('adds nothing to a refusal that already took longer', async () => {
    const clock = new FakeClock();
    const pacer = new RefusalPacer(config(150), clock);

    await pacer.pace(refusedAfter(clock, 200, new BadRequestException())).catch(() => {});

    expect(clock.sleeps).toEqual([]);
  });

  it('does not hold back a sign-in that succeeds', async () => {
    const clock = new FakeClock();
    const pacer = new RefusalPacer(config(150), clock);

    const result = await pacer.pace(async () => {
      clock.time += 10;
      return 'signed in';
    });

    expect(result).toBe('signed in');
    expect(clock.sleeps).toEqual([]);
  });

  it('does not hold back a server fault, which is not a refusal', async () => {
    const clock = new FakeClock();
    const pacer = new RefusalPacer(config(150), clock);

    await expect(
      pacer.pace(refusedAfter(clock, 5, new InternalServerErrorException())),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(clock.sleeps).toEqual([]);
  });

  it('is off when the minimum is zero', async () => {
    const clock = new FakeClock();
    const pacer = new RefusalPacer(config(0), clock);

    await pacer.pace(refusedAfter(clock, 5, new UnauthorizedException())).catch(() => {});

    expect(clock.sleeps).toEqual([]);
  });
});
