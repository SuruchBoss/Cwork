// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * What can be wrong with an imported spreadsheet, said the same way by every
 * import (CW-059): the employees file, the leave-taken file and the file of
 * pay before Cwork.
 *
 * `code` and `params` are the contract. The console words each code in the
 * reader's language (web/src/features/imports/import-problems.ts), and
 * `message` is the English wording for anyone calling the API directly.
 */

export type ImportProblemCode =
  // The file as a whole.
  | 'UNSUPPORTED_FORMAT'
  | 'UNREADABLE'
  | 'EMPTY'
  | 'UNKNOWN_COLUMN'
  | 'DUPLICATE_COLUMN'
  | 'MISSING_COLUMN'
  | 'NO_ROWS'
  | 'TOO_MANY_ROWS'
  // One cell.
  | 'REQUIRED'
  | 'INVALID_DATE'
  | 'INVALID_CHOICE'
  | 'INVALID_NATIONAL_ID'
  | 'NUMBER_LOST'
  | 'INVALID_VALUE'
  | 'INVALID_EMAIL'
  | 'INVALID_PHONE'
  | 'TOO_LONG'
  | 'DUPLICATE_IN_FILE'
  | 'CODE_EXISTS'
  | 'SCANNER_ID_TAKEN'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'SELF_MANAGER'
  | 'MANAGER_CYCLE'
  | 'PROBATION_BEFORE_HIRE'
  | 'BANK_INCOMPLETE'
  // Leave taken before Cwork.
  | 'INVALID_DAYS'
  | 'WHOLE_DAYS_ONLY'
  | 'NOT_ELIGIBLE'
  | 'OVER_ENTITLEMENT'
  // Pay before Cwork.
  | 'NO_FIGURES'
  | 'INVALID_AMOUNT'
  | 'TAX_OVER_INCOME'
  | 'SSO_OVER_LIMIT'
  | 'PAID_IN_CWORK';

/** One thing wrong with the file, where it is, and why. */
export interface ImportProblem {
  /** The row as the spreadsheet numbers it; 0 for the file as a whole. */
  row: number;
  /** The column letter, when the problem is in one cell or column. */
  column?: string;
  /** The column's heading as the file has it. */
  header?: string;
  code: ImportProblemCode;
  params?: Record<string, string | number>;
  /** In English, for API callers; the console words it from code and params. */
  message: string;
}

const MESSAGES: Record<ImportProblemCode, string> = {
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
  NO_FIGURES: 'No row has any figures in it',
  INVALID_AMOUNT: '"{value}" is not an amount in baht: 0 or more, with at most two decimals',
  TAX_OVER_INCOME: 'Tax withheld ({value}) cannot be more than the taxable income ({income})',
  SSO_OVER_LIMIT: 'Social security for {months} months is at most {max}, not {value}',
  PAID_IN_CWORK:
    '{employee} was already paid for {period} in Cwork; these figures can only cover the months before it',
};

export function importProblem(
  code: ImportProblemCode,
  where: { row: number; column?: string; header?: string },
  params?: Record<string, string | number>,
): ImportProblem {
  const message = MESSAGES[code].replace(/\{(\w+)\}/g, (match, name: string) =>
    params && name in params ? String(params[name]) : match,
  );
  return { ...where, code, ...(params ? { params } : {}), message };
}

/** Problems reported per file. A file with more is wrong everywhere, and the first few say how. */
export const MAX_PROBLEMS = 200;

/** The most rows one import takes: a company larger than this imports in parts. */
export const MAX_IMPORT_ROWS = 2000;
