// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Who gets told what, and where a message points — all decided without
 * touching the database or the network, so the rules can be read and tested
 * on their own.
 */

export interface PreferenceRow {
  type: string;
  email: boolean;
  push: boolean;
}

export const CATCH_ALL = '*';

/**
 * Resolves whether a channel is on for one notification type.
 *
 * Most specific wins, and silence means yes: somebody who has never opened the
 * settings page should still hear that their leave was approved. The catch-all
 * row is what an unsubscribe link writes, so turning everything off is one row
 * rather than one per type anybody might invent later.
 */
export function channelEnabled(
  rows: PreferenceRow[],
  type: string,
  channel: 'email' | 'push',
): boolean {
  const exact = rows.find((row) => row.type === type);
  if (exact) return exact[channel];

  const catchAll = rows.find((row) => row.type === CATCH_ALL);
  if (catchAll) return catchAll[channel];

  return true;
}

/**
 * Where in the console a notification points.
 *
 * An email saying something is waiting and not saying where is an email that
 * makes somebody go looking. Types are matched by prefix because they are
 * namespaced (`leave.approved`, `approval.leave_request.pending`) and the
 * destination belongs to the namespace, not the individual event.
 */
const DESTINATIONS: Array<[prefix: string, path: string]> = [
  ['approval.', '/approvals'],
  ['leave.', '/leave'],
  ['overtime.', '/attendance/overtime'],
  ['expense.', '/expenses'],
  ['payslip.', '/payroll/payslips'],
  ['document.', '/documents'],
  ['resignation.', '/employees/me'],
  ['performance.', '/performance'],
];

export function destinationFor(type: string): string {
  const match = DESTINATIONS.find(([prefix]) => type.startsWith(prefix));
  return match ? match[1] : '/notifications';
}

/**
 * The word in front of the subject line.
 *
 * Purely so a full inbox sorts: "[รออนุมัติ]" and "[สลิปเงินเดือน]" are
 * scannable in a way that eleven differently-worded Thai titles are not.
 */
const SUBJECT_TAGS: Array<[prefix: string, tag: string]> = [
  ['approval.', 'รออนุมัติ'],
  ['payslip.', 'สลิปเงินเดือน'],
  ['document.', 'เอกสาร'],
  ['leave.', 'การลา'],
  ['overtime.', 'โอที'],
  ['expense.', 'ค่าใช้จ่าย'],
];

export function subjectFor(type: string, title: string): string {
  const match = SUBJECT_TAGS.find(([prefix]) => type.startsWith(prefix));
  return match ? `[${match[1]}] ${title}` : title;
}
