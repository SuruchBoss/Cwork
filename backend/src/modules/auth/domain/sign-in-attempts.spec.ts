// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { UnknownAccountAttempts } from './sign-in-attempts';

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 3, 12, minutes));

describe('UnknownAccountAttempts', () => {
  it('is not locked before the limit is reached', () => {
    const attempts = new UnknownAccountAttempts(3, 15);

    attempts.registerFailure('a@example.test', at(0));
    attempts.registerFailure('a@example.test', at(1));

    expect(attempts.lockedUntil('a@example.test', at(2))).toBeNull();
  });

  it('locks for the wait once the limit is reached, as an account does', () => {
    const attempts = new UnknownAccountAttempts(3, 15);

    for (const minute of [0, 1, 2]) attempts.registerFailure('a@example.test', at(minute));

    expect(attempts.lockedUntil('a@example.test', at(3))).toEqual(at(17));
    expect(attempts.lockedUntil('a@example.test', at(17))).toBeNull();
  });

  it('locks again at the next failure after the wait, because the count is kept', () => {
    const attempts = new UnknownAccountAttempts(3, 15);
    for (const minute of [0, 1, 2]) attempts.registerFailure('a@example.test', at(minute));

    attempts.registerFailure('a@example.test', at(20));

    expect(attempts.lockedUntil('a@example.test', at(21))).toEqual(at(35));
  });

  it('reads an address the same whatever its case or spacing', () => {
    const attempts = new UnknownAccountAttempts(2, 15);

    attempts.registerFailure('A@Example.test', at(0));
    attempts.registerFailure(' a@example.test ', at(1));

    expect(attempts.lockedUntil('a@EXAMPLE.test', at(2))).not.toBeNull();
  });

  it('keeps addresses apart and forgets the oldest past its capacity', () => {
    const attempts = new UnknownAccountAttempts(1, 15, 2);

    attempts.registerFailure('one@example.test', at(0));
    attempts.registerFailure('two@example.test', at(0));
    attempts.registerFailure('three@example.test', at(0));

    expect(attempts.lockedUntil('one@example.test', at(1))).toBeNull();
    expect(attempts.lockedUntil('two@example.test', at(1))).not.toBeNull();
    expect(attempts.lockedUntil('three@example.test', at(1))).not.toBeNull();
  });
});
