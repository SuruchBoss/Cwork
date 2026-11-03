// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Whether the person acting is allowed to act on their own record.
 *
 * Someone who may decide a record and who is also the person it is about is
 * asked to leave it to another holder of the permission. Where nobody else
 * holds it, refusing would stop the work, so it is allowed — and marked, so the
 * people who read the result and the audit log can see that it was done on
 * one's own record.
 */
export type OwnRecordVerdict = 'NOT_OWN' | 'LEAVE_TO_ANOTHER' | 'ALLOWED_AS_ONLY_HOLDER';

export function judgeOwnRecord(input: {
  subjectEmployeeId: string | null;
  actorEmployeeId: string | null;
  anotherHolderExists: boolean;
}): OwnRecordVerdict {
  const own = input.subjectEmployeeId !== null && input.subjectEmployeeId === input.actorEmployeeId;
  if (!own) return 'NOT_OWN';
  return input.anotherHolderExists ? 'LEAVE_TO_ANOTHER' : 'ALLOWED_AS_ONLY_HOLDER';
}
