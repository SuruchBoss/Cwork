// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { FailedRequest } from '@/lib/failure-log';

/**
 * The text a customer copies and sends to whoever supports their Cwork (CW-087).
 *
 * Two parts, kept apart so it is plain which is which: what the person wrote,
 * exactly as they wrote it, and what Cwork attached, which holds no name, ID
 * number, salary or other personal data (see `lib/failure-log.ts` for what a
 * failed request is reduced to). Cwork builds the text and shows it; it never
 * sends it. The fixed labels are English so a line is easy to find, and the
 * heading is bilingual for whoever opens the message first.
 */

export interface ProblemReportInput {
  /** What the person wrote about what happened. */
  description: string;
  failures: FailedRequest[];
  /** The screen they were on, as a route (`/payroll/runs/:id`). */
  page: string | null;
  consoleVersion: string;
  userAgent: string;
  language: string;
  now: Date;
}

/** `UTC+07:00` for a browser running seven hours ahead of UTC. */
export function utcOffsetLabel(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

export function describeFailureLine(failure: FailedRequest, index: number): string {
  const query = failure.queryKeys.length > 0 ? ` ?${failure.queryKeys.join(',')}` : '';
  const answer = failure.status === 0 ? 'no answer' : String(failure.status);
  const request = failure.requestId ? ` (request ${failure.requestId})` : '';
  return `${index + 1}. ${failure.at} ${failure.method} ${failure.path}${query} -> ${answer} ${failure.code}${request}`;
}

/** What Cwork attaches, on its own: this is also what the form previews. */
export function diagnosticsBlock(input: Omit<ProblemReportInput, 'description'>): string {
  const lines = [
    'Attached by Cwork. It holds no names, ID numbers, salaries or other personal data.',
    `Console version: ${input.consoleVersion}`,
    `Screen: ${input.page ?? 'not known'}`,
    `Time: ${input.now.toISOString()} (${utcOffsetLabel(input.now)})`,
    `Browser: ${input.userAgent}`,
    `Language: ${input.language}`,
    'Recent failed requests (oldest first):',
  ];
  if (input.failures.length === 0) lines.push('(none since this page was opened)');
  else input.failures.forEach((failure, i) => lines.push(describeFailureLine(failure, i)));
  return lines.join('\n');
}

export function buildProblemReport(input: ProblemReportInput): string {
  return [
    'Cwork problem report / รายงานปัญหา Cwork',
    '',
    'What happened (written by the person reporting):',
    input.description.trim(),
    '',
    '----------------------------------------',
    diagnosticsBlock(input),
    '',
  ].join('\n');
}

/** `cwork-problem-report-20261016-1130.txt`, in the browser's local time. */
export function reportFilename(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `cwork-problem-report-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}.txt`
  );
}
