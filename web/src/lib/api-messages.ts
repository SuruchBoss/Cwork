// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiError } from '@/lib/api-error';
import type { translate } from '@/lib/i18n';

type Translate = (key: string, params?: Parameters<typeof translate>[2]) => string;

/**
 * The business-rule errors a screen can expect, by the code the server sends
 * (CW-096). The server's sentence is English; the person reading the Thai console
 * should get Thai, so each code maps to a message key (the English text, like
 * every other key) and `{name}` placeholders come from the error's `details`.
 * English reads as it always did: the key is the server's own sentence.
 */
const MESSAGES: Record<string, string> = {
  // Matching a scanner number to an employee
  SCANNER_NUMBER_NOT_REGISTERED:
    'This scanner number belongs to no employee yet; register it first',
  EMPLOYEE_HAS_SCANNER_NUMBER: 'Employee {employeeCode} already has scanner number {scannerNumber}',
  DUPLICATE_SCANNER_ID: 'Scanner number {scannerNumber} already belongs to employee {employeeCode}',
  // Reviewing the days the scanner recorded
  RANGE_NOT_SUPPORTED: 'Choose a range of 1 to {max} days',
  SCANNER_DAY_HAS_NO_TIMES: 'The scanner recorded no time this day',
  DAY_LOCKED: 'A payroll run has already used this day, so it can no longer change',
  DECISION_NOTHING_TO_USE: 'Pick at least one of the times to use, or ignore the day',
  DECISION_TIME_NOT_ON_DAY: 'Pick among the times the scanner recorded that day',
  DECISION_OUT_NOT_AFTER_IN: 'The clock-out must be later than the clock-in',
  DECISION_IGNORE_TAKES_NO_TIMES: 'Ignoring a day takes no times',
};

/**
 * What to tell the person about a failed request, in their language. A code this
 * does not know, or one whose details lack a value the sentence needs, shows the
 * server's own message instead, and anything that is not an API error shows `fallback`.
 */
export function describeApiError(caught: unknown, t: Translate, fallback: string): string {
  if (!(caught instanceof ApiError)) return fallback;
  const template = MESSAGES[caught.code];
  if (!template) return caught.message;

  const details =
    caught.details && typeof caught.details === 'object'
      ? (caught.details as Record<string, unknown>)
      : {};
  const params: Record<string, string | number> = {};
  for (const [, name] of template.matchAll(/\{(\w+)\}/g)) {
    const value = details[name];
    if (typeof value !== 'string' && typeof value !== 'number') return caught.message;
    params[name] = value;
  }
  return t(template, params);
}
