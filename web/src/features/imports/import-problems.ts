// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { translate } from '@/lib/i18n';

/**
 * One thing wrong with an uploaded spreadsheet, as the API reports it (CW-059).
 * Mirrors backend/src/core/spreadsheet/problems.ts.
 */
export interface ImportProblem {
  /** The spreadsheet's own row number; 0 for the file as a whole. */
  row: number;
  column?: string;
  header?: string;
  code: string;
  params?: Record<string, string | number>;
  /** The API's English wording, used when the console does not know the code. */
  message: string;
}

/**
 * The API's messages, keyed by code, as English templates. The template is
 * the translation key, so the Thai catalogue words each one; the API's own
 * `message` is the fallback for a code this console does not know yet.
 */
const TEMPLATES: Record<string, string> = {
  UNSUPPORTED_FORMAT:
    'This is not a file this import reads. Save it as .xlsx or CSV and upload that',
  UNREADABLE:
    'The file could not be read. Open it in Excel, save it again as .xlsx and upload that',
  EMPTY: 'The file is empty',
  UNKNOWN_COLUMN: 'Column "{header}" is not one this import knows',
  DUPLICATE_COLUMN: 'Column "{header}" appears more than once',
  MISSING_COLUMN: 'The file has no "{column}" column, which is required',
  NO_ROWS: 'The file has a header row but no employees under it',
  TOO_MANY_ROWS: 'The file has {rows} rows; one import takes at most {max}',
  REQUIRED: 'This is required',
  INVALID_DATE: '"{value}" is not a date this import can read',
  INVALID_CHOICE: '"{value}" is not one of: {allowed}',
  INVALID_NATIONAL_ID: 'A national ID is 13 digits',
  NUMBER_LOST:
    'Excel shortened this number to "{value}". Format the column as Text and type it again',
  INVALID_VALUE: '"{value}" is not valid here',
  INVALID_EMAIL: '"{value}" is not an email address',
  INVALID_PHONE: '"{value}" is not a Thai phone number',
  TOO_LONG: 'At most {max} characters',
  DUPLICATE_IN_FILE: '"{value}" is also on row {other}',
  CODE_EXISTS: 'Employee code {value} already exists',
  SCANNER_ID_TAKEN: 'Scanner ID {value} already belongs to employee {owner}',
  NOT_FOUND: 'No {what} "{value}"',
  AMBIGUOUS: 'More than one {what} is called "{value}"; use its code',
  SELF_MANAGER: 'An employee cannot be their own manager',
  MANAGER_CYCLE: 'Managers form a loop: {chain}',
  PROBATION_BEFORE_HIRE: 'Probation cannot end before the hire date',
  BANK_INCOMPLETE: 'A bank account needs the bank code, bank name and account number together',
  INVALID_DAYS: '"{value}" is not a number of days from 0 to 366',
  WHOLE_DAYS_ONLY: '{leaveType} is taken in whole days, not "{value}"',
  NOT_ELIGIBLE: '{leaveType} does not apply to {employee}',
  OVER_ENTITLEMENT:
    '{employee} is entitled to {available} days of {leaveType} this year, not {value}',
};

type Translate = (key: string, params?: Parameters<typeof translate>[2]) => string;

/** The problem in the reader's language. */
export function describeProblem(problem: ImportProblem, t: Translate): string {
  const template = TEMPLATES[problem.code];
  if (!template) return problem.message;
  const params = { ...problem.params };
  // "department", "position", … are words in a sentence, so they translate too.
  if (typeof params.what === 'string') params.what = t(params.what);
  return t(template, params);
}
