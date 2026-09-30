// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { decodeText, parseCsv } from './csv';
import { readXlsx, XlsxError, type Cell } from './xlsx';

export type { Cell } from './xlsx';
export { columnLetter } from './xlsx';

/**
 * A table uploaded as a spreadsheet: .xlsx, or CSV/text in whatever encoding
 * Excel chose (CW-059). The first row is the header.
 */
export interface Table {
  rows: Cell[][];
  /** For turning Excel's day numbers into dates; 1900 for anything not .xlsx. */
  dateSystem: 1900 | 1904;
}

export type TableProblem = 'UNSUPPORTED_FORMAT' | 'UNREADABLE' | 'EMPTY';

export class TableError extends Error {
  constructor(
    readonly problem: TableProblem,
    message: string,
  ) {
    super(message);
  }
}

/** Reads an upload into rows, deciding the format from its bytes, not its name. */
export function readTable(bytes: Uint8Array): Table {
  if (bytes.length === 0) throw new TableError('EMPTY', 'The file is empty');

  let table: Table;
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    try {
      table = readXlsx(bytes);
    } catch (error) {
      if (error instanceof XlsxError) throw new TableError('UNREADABLE', error.message);
      throw error;
    }
  } else if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    // The Excel 97–2003 format, a binary one nobody should have to parse.
    throw new TableError(
      'UNSUPPORTED_FORMAT',
      'This is an old .xls workbook. Save it as .xlsx or CSV and upload that.',
    );
  } else {
    const text = decodeText(bytes);
    if (text.includes('\u0000')) {
      throw new TableError('UNSUPPORTED_FORMAT', 'This is not a spreadsheet or a CSV file.');
    }
    table = { rows: parseCsv(text), dateSystem: 1900 };
  }

  const rows = table.rows.map((row) => row.map(clean));
  while (rows.length > 0 && isBlank(rows[rows.length - 1])) rows.pop();
  if (rows.length === 0) throw new TableError('EMPTY', 'The file has no rows');
  return { rows, dateSystem: table.dateSystem };
}

/** Headings match however they are written: case, spacing and a required-mark do not matter. */
export function normaliseHeading(heading: string): string {
  return heading.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Text a person would have typed, from a cell Excel may have turned into a number. */
export function asText(cell: Cell): string | null {
  if (cell === null) return null;
  if (typeof cell === 'number') return Number.isInteger(cell) ? cell.toFixed(0) : String(cell);
  return cell;
}

/** A row with nothing in it: spreadsheets are full of them, below the data. */
export function isBlank(row: Cell[] | undefined): boolean {
  return !row || row.every((cell) => cell === null || cell === '');
}

/** Trimmed text, and nothing where there is only whitespace. */
function clean(cell: Cell): Cell {
  if (typeof cell !== 'string') return cell;
  // Non-breaking spaces arrive from web pages and from Odoo exports.
  const trimmed = cell.replace(/\u00a0/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}
