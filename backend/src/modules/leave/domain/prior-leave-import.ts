// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { Gender } from '@prisma/client';
import {
  importProblem,
  MAX_IMPORT_ROWS,
  MAX_PROBLEMS,
  type ImportProblem,
} from '../../../core/spreadsheet/problems';
import {
  asText,
  columnLetter,
  isBlank,
  normaliseHeading,
  type Cell,
  type Table,
} from '../../../core/spreadsheet/table';

/**
 * Leave already taken this year, before the company moved to Cwork (CW-059).
 *
 * A company that starts in October has employees who took leave in March. Their
 * balances in Cwork must already count it, or the first request after go-live
 * is approved against days that were spent months ago. This reads one row per
 * employee and one column per leave type, the days taken in each cell, and says
 * what every balance becomes before anything is written.
 *
 * The figure is a fact about the year so far, so it is **set**, not added:
 * importing the same file twice leaves the same balances. A blank cell changes
 * nothing, and 0 clears a figure imported by mistake.
 */

export const EMPLOYEE_CODE_HEADINGS = ['employee_code', 'รหัสพนักงาน', 'Employee code'];
/** Printed in the template beside each code so HR can see who a row is; never read. */
export const NAME_HEADINGS = ['name', 'ชื่อ', 'Name'];

export interface PriorLeaveEmployee {
  id: string;
  code: string;
  name: string;
  gender: Gender;
}

export interface PriorLeaveType {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  allowHalfDay: boolean;
  allowNegativeBalance: boolean;
  genderRestriction: Gender | null;
}

export interface PriorLeaveContext {
  /** Employees who can hold leave, by code. */
  employees: Map<string, PriorLeaveEmployee>;
  leaveTypes: PriorLeaveType[];
  /**
   * What the employee has of a leave type this year before any leave taken
   * elsewhere is counted: entitlement plus carry-over and adjustments, minus
   * what has been used or requested in Cwork.
   */
  availableBefore: (employeeId: string, leaveTypeId: string) => number;
}

export interface PriorLeaveRow {
  row: number;
  employeeId: string;
  employeeCode: string;
  name: string;
  taken: { leaveTypeId: string; days: number; availableAfter: number }[];
}

/** Every employee's leave taken, or every problem with the file. */
export function readPriorLeave(
  table: Table,
  context: PriorLeaveContext,
): { rows: PriorLeaveRow[]; problems: ImportProblem[] } {
  const [header = [], ...body] = table.rows;
  const problems: ImportProblem[] = [];

  // Headings: the code, the name beside it, and one column per leave type.
  const codeHeadings = new Set(EMPLOYEE_CODE_HEADINGS.map(normaliseHeading));
  const nameHeadings = new Set(NAME_HEADINGS.map(normaliseHeading));
  const typeByHeading = new Map<string, PriorLeaveType>();
  for (const type of context.leaveTypes) {
    for (const heading of [type.code, type.name, type.nameEn]) {
      if (heading) typeByHeading.set(normaliseHeading(heading), type);
    }
  }

  let codeColumn: number | undefined;
  const typeColumns: { index: number; type: PriorLeaveType; header: string }[] = [];
  header.forEach((cell, index) => {
    const heading = asText(cell);
    if (heading === null) return;
    const key = normaliseHeading(heading);
    const where = { row: 1, column: columnLetter(index), header: heading };
    const type = typeByHeading.get(key);
    if (codeHeadings.has(key)) {
      if (codeColumn === undefined) codeColumn = index;
      else problems.push(importProblem('DUPLICATE_COLUMN', where, { header: heading }));
    } else if (nameHeadings.has(key)) {
      // Informational only.
    } else if (!type) {
      problems.push(importProblem('UNKNOWN_COLUMN', where, { header: heading }));
    } else if (typeColumns.some((c) => c.type.id === type.id)) {
      problems.push(importProblem('DUPLICATE_COLUMN', where, { header: heading }));
    } else {
      typeColumns.push({ index, type, header: heading });
    }
  });
  if (codeColumn === undefined) {
    problems.push(
      importProblem('MISSING_COLUMN', { row: 1 }, { column: 'รหัสพนักงาน / Employee code' }),
    );
  }
  if (typeColumns.length === 0) {
    problems.push(
      importProblem('MISSING_COLUMN', { row: 1 }, { column: 'ประเภทการลา / leave type' }),
    );
  }
  if (problems.length > 0) return { rows: [], problems };

  const lines = body
    .map((cells, i) => ({ cells, row: i + 2 }))
    .filter(({ cells }) => !isBlank(cells));
  if (lines.length === 0) return { rows: [], problems: [importProblem('NO_ROWS', { row: 0 })] };
  if (lines.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      problems: [
        importProblem('TOO_MANY_ROWS', { row: 0 }, { rows: lines.length, max: MAX_IMPORT_ROWS }),
      ],
    };
  }

  const rows: PriorLeaveRow[] = [];
  const firstSeen = new Map<string, number>();
  const codeHeader = asText(header[codeColumn!]) ?? undefined;

  for (const { cells, row } of lines) {
    const before = problems.length;
    const codeWhere = { row, column: columnLetter(codeColumn!), header: codeHeader };
    const code = asText(cells[codeColumn!] ?? null);
    const employee = code === null ? undefined : context.employees.get(code);

    if (code === null) {
      problems.push(importProblem('REQUIRED', codeWhere));
      continue;
    }
    if (!employee) {
      problems.push(importProblem('NOT_FOUND', codeWhere, { what: 'employee', value: code }));
      continue;
    }
    const earlier = firstSeen.get(code);
    if (earlier) {
      problems.push(importProblem('DUPLICATE_IN_FILE', codeWhere, { value: code, other: earlier }));
      continue;
    }
    firstSeen.set(code, row);

    const taken: PriorLeaveRow['taken'] = [];
    for (const { index, type, header: typeHeader } of typeColumns) {
      const cell = cells[index] ?? null;
      if (cell === null) continue;
      const where = { row, column: columnLetter(index), header: typeHeader };
      const value = asText(cell)!;
      const days = parseDays(cell);
      if (days === null) {
        problems.push(importProblem('INVALID_DAYS', where, { value }));
        continue;
      }
      if (!type.allowHalfDay && !Number.isInteger(days)) {
        problems.push(importProblem('WHOLE_DAYS_ONLY', where, { leaveType: type.name, value }));
        continue;
      }
      if (days > 0 && type.genderRestriction && type.genderRestriction !== employee.gender) {
        problems.push(
          importProblem('NOT_ELIGIBLE', where, { leaveType: type.name, employee: employee.name }),
        );
        continue;
      }
      const available = context.availableBefore(employee.id, type.id);
      const availableAfter = round2(available - days);
      if (availableAfter < 0 && !type.allowNegativeBalance) {
        problems.push(
          importProblem('OVER_ENTITLEMENT', where, {
            employee: employee.name,
            leaveType: type.name,
            available: round2(available),
            value: days,
          }),
        );
        continue;
      }
      taken.push({ leaveTypeId: type.id, days, availableAfter });
    }

    if (problems.length === before && taken.length > 0) {
      rows.push({ row, employeeId: employee.id, employeeCode: code, name: employee.name, taken });
    }
  }

  if (problems.length > 0) return { rows: [], problems: problems.slice(0, MAX_PROBLEMS) };
  return { rows, problems };
}

/** Days as a number of up to two decimals, from 0 to a year's worth. */
export function parseDays(cell: Cell): number | null {
  if (cell === null) return null;
  const value = typeof cell === 'number' ? cell : Number(cell.trim());
  if (typeof cell === 'string' && !/^\d+(\.\d+)?$/.test(cell.trim())) return null;
  if (!Number.isFinite(value) || value < 0 || value > 366) return null;
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-9) return null;
  return round2(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
