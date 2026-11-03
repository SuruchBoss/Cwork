// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { judgeOwnRecord } from './duty-separation';

describe('judgeOwnRecord', () => {
  it('has nothing to say about someone else’s record', () => {
    expect(
      judgeOwnRecord({
        subjectEmployeeId: 'a',
        actorEmployeeId: 'b',
        anotherHolderExists: false,
      }),
    ).toBe('NOT_OWN');
  });

  it('asks for another decider when there is one', () => {
    expect(
      judgeOwnRecord({ subjectEmployeeId: 'a', actorEmployeeId: 'a', anotherHolderExists: true }),
    ).toBe('LEAVE_TO_ANOTHER');
  });

  it('allows it, marked, when the person is the only one who may decide', () => {
    expect(
      judgeOwnRecord({ subjectEmployeeId: 'a', actorEmployeeId: 'a', anotherHolderExists: false }),
    ).toBe('ALLOWED_AS_ONLY_HOLDER');
  });

  it('does not take an account with no employee record, or a day with no owner, for the same person', () => {
    expect(
      judgeOwnRecord({
        subjectEmployeeId: null,
        actorEmployeeId: null,
        anotherHolderExists: false,
      }),
    ).toBe('NOT_OWN');
    expect(
      judgeOwnRecord({ subjectEmployeeId: 'a', actorEmployeeId: null, anotherHolderExists: false }),
    ).toBe('NOT_OWN');
  });
});
