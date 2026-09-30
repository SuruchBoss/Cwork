// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { EmploymentType, Gender, MaritalStatus } from '@prisma/client';
import {
  importProblem,
  MAX_IMPORT_ROWS,
  MAX_PROBLEMS,
  type ImportProblem,
  type ImportProblemCode,
} from '../../../core/spreadsheet/problems';
import {
  asText,
  columnLetter,
  isBlank,
  normaliseHeading,
  type Cell,
  type Table,
} from '../../../core/spreadsheet/table';

export { importProblem, MAX_IMPORT_ROWS, MAX_PROBLEMS };
export type { ImportProblem, ImportProblemCode };

/**
 * Reading a company's people out of a spreadsheet (CW-059).
 *
 * Everything here is pure: it takes the table and what the organisation
 * already holds, and returns either the employees to create or every problem
 * in the file, by row and column. Nothing is written unless the second list is
 * empty, so a file is taken whole or not at all. The same rules the API applies
 * to a typed-in employee are applied afterwards, in the service, to what this
 * returns.
 */

// ------------------------------------------------------------------ columns

export type EmployeeColumn =
  | 'employee_code'
  | 'title_th'
  | 'first_name_th'
  | 'last_name_th'
  | 'first_name_en'
  | 'last_name_en'
  | 'nickname'
  | 'date_of_birth'
  | 'gender'
  | 'marital_status'
  | 'national_id'
  | 'tax_id'
  | 'social_security_no'
  | 'work_email'
  | 'personal_email'
  | 'phone'
  | 'address_line'
  | 'province'
  | 'postal_code'
  | 'department'
  | 'position'
  | 'work_location'
  | 'manager_code'
  | 'employment_type'
  | 'hire_date'
  | 'probation_end_date'
  | 'scanner_id'
  | 'bank_code'
  | 'bank_name'
  | 'bank_account_no'
  | 'bank_account_name';

export interface ColumnSpec {
  key: EmployeeColumn;
  th: string;
  en: string;
  required?: boolean;
  /** What goes in it, for the template's second sheet. */
  hint: { th: string; en: string };
  width: number;
}

const DATE_HINT = {
  th: 'วันที่ เช่น 2024-01-15 หรือ 15/1/2567 (ปี พ.ศ. หรือ ค.ศ. ก็ได้)',
  en: 'A date, e.g. 2024-01-15 or 15/1/2024 (day first; a Buddhist-era year is fine)',
};

export const EMPLOYEE_COLUMNS: ColumnSpec[] = [
  {
    key: 'employee_code',
    th: 'รหัสพนักงาน',
    en: 'Employee code',
    required: true,
    width: 14,
    hint: {
      th: 'ไม่ซ้ำกับคนอื่น ใช้ระบุตัวพนักงานเวลานำเข้าซ้ำ',
      en: 'Unique; it is how a second import recognises someone already here',
    },
  },
  {
    key: 'title_th',
    th: 'คำนำหน้า',
    en: 'Title',
    width: 10,
    hint: { th: 'เช่น นาย นาง นางสาว', en: 'e.g. นาย, นาง, นางสาว' },
  },
  {
    key: 'first_name_th',
    th: 'ชื่อ',
    en: 'First name (Thai)',
    required: true,
    width: 16,
    hint: { th: 'ชื่อภาษาไทย', en: 'In Thai' },
  },
  {
    key: 'last_name_th',
    th: 'นามสกุล',
    en: 'Last name (Thai)',
    required: true,
    width: 18,
    hint: { th: 'นามสกุลภาษาไทย', en: 'In Thai' },
  },
  {
    key: 'first_name_en',
    th: 'ชื่อ (อังกฤษ)',
    en: 'First name (English)',
    width: 16,
    hint: { th: 'ไม่บังคับ', en: 'Optional' },
  },
  {
    key: 'last_name_en',
    th: 'นามสกุล (อังกฤษ)',
    en: 'Last name (English)',
    width: 18,
    hint: { th: 'ไม่บังคับ', en: 'Optional' },
  },
  {
    key: 'nickname',
    th: 'ชื่อเล่น',
    en: 'Nickname',
    width: 10,
    hint: { th: 'ไม่บังคับ', en: 'Optional' },
  },
  { key: 'date_of_birth', th: 'วันเกิด', en: 'Date of birth', width: 12, hint: DATE_HINT },
  {
    key: 'gender',
    th: 'เพศ',
    en: 'Gender',
    width: 8,
    hint: { th: 'ชาย หญิง อื่น ๆ หรือ ไม่ระบุ', en: 'MALE, FEMALE, OTHER or UNDISCLOSED' },
  },
  {
    key: 'marital_status',
    th: 'สถานภาพ',
    en: 'Marital status',
    width: 10,
    hint: {
      th: 'โสด สมรส หย่า หม้าย หรือ ไม่ระบุ',
      en: 'SINGLE, MARRIED, DIVORCED, WIDOWED or UNDISCLOSED',
    },
  },
  {
    key: 'national_id',
    th: 'เลขบัตรประชาชน',
    en: 'National ID',
    width: 17,
    hint: {
      th: '13 หลัก มีขีดหรือเว้นวรรคได้ ระบบเก็บแบบเข้ารหัส',
      en: '13 digits, dashes and spaces allowed; stored encrypted',
    },
  },
  {
    key: 'tax_id',
    th: 'เลขผู้เสียภาษี',
    en: 'Tax ID',
    width: 15,
    hint: { th: 'ระบบเก็บแบบเข้ารหัส', en: 'Stored encrypted' },
  },
  {
    key: 'social_security_no',
    th: 'เลขประกันสังคม',
    en: 'Social security no.',
    width: 15,
    hint: { th: 'ระบบเก็บแบบเข้ารหัส', en: 'Stored encrypted' },
  },
  {
    key: 'work_email',
    th: 'อีเมลงาน',
    en: 'Work email',
    width: 24,
    hint: { th: 'ไม่บังคับ', en: 'Optional' },
  },
  {
    key: 'personal_email',
    th: 'อีเมลส่วนตัว',
    en: 'Personal email',
    width: 24,
    hint: { th: 'ไม่บังคับ', en: 'Optional' },
  },
  {
    key: 'phone',
    th: 'เบอร์โทร',
    en: 'Phone',
    width: 13,
    hint: { th: 'เช่น 0812345678', en: 'e.g. 0812345678' },
  },
  {
    key: 'address_line',
    th: 'ที่อยู่',
    en: 'Address',
    width: 30,
    hint: { th: 'ไม่บังคับ', en: 'Optional' },
  },
  {
    key: 'province',
    th: 'จังหวัด',
    en: 'Province',
    width: 14,
    hint: { th: 'ไม่บังคับ', en: 'Optional' },
  },
  {
    key: 'postal_code',
    th: 'รหัสไปรษณีย์',
    en: 'Postal code',
    width: 11,
    hint: { th: 'ไม่บังคับ', en: 'Optional' },
  },
  {
    key: 'department',
    th: 'แผนก',
    en: 'Department',
    width: 16,
    hint: {
      th: 'รหัสหรือชื่อแผนกที่มีอยู่ในระบบแล้ว',
      en: 'The code or name of a department already set up',
    },
  },
  {
    key: 'position',
    th: 'ตำแหน่ง',
    en: 'Position',
    width: 16,
    hint: {
      th: 'รหัสหรือชื่อตำแหน่งที่มีอยู่ในระบบแล้ว',
      en: 'The code or title of a position already set up',
    },
  },
  {
    key: 'work_location',
    th: 'สถานที่ทำงาน',
    en: 'Work location',
    width: 16,
    hint: {
      th: 'รหัสหรือชื่อสถานที่ทำงานที่มีอยู่ในระบบแล้ว',
      en: 'The code or name of a work location already set up',
    },
  },
  {
    key: 'manager_code',
    th: 'รหัสหัวหน้า',
    en: "Manager's code",
    width: 13,
    hint: {
      th: 'รหัสพนักงานของหัวหน้า อยู่ในไฟล์นี้หรือในระบบแล้วก็ได้',
      en: "The manager's employee code, in this file or already in Cwork",
    },
  },
  {
    key: 'employment_type',
    th: 'ประเภทการจ้าง',
    en: 'Employment type',
    width: 14,
    hint: {
      th: 'ประจำ พาร์ทไทม์ สัญญาจ้าง ฝึกงาน เอาท์ซอร์ส หรือ รายวัน (ว่างไว้ = ประจำ)',
      en: 'FULL_TIME, PART_TIME, CONTRACT, INTERN, OUTSOURCE or DAILY (blank = FULL_TIME)',
    },
  },
  {
    key: 'hire_date',
    th: 'วันเริ่มงาน',
    en: 'Hire date',
    required: true,
    width: 12,
    hint: DATE_HINT,
  },
  {
    key: 'probation_end_date',
    th: 'วันครบทดลองงาน',
    en: 'Probation end date',
    width: 14,
    hint: {
      th: `${DATE_HINT.th} ถ้ายังไม่ถึงวันนี้ สถานะจะเป็นทดลองงาน`,
      en: `${DATE_HINT.en}. Still ahead means the person is on probation`,
    },
  },
  {
    key: 'scanner_id',
    th: 'รหัสเครื่องสแกนนิ้ว',
    en: 'Scanner ID',
    width: 14,
    hint: {
      th: 'หมายเลขผู้ใช้ของพนักงานในเครื่องสแกนนิ้ว ตามที่เครื่องเขียน (เช่น 007 ไม่ใช่ 7)',
      en: "The person's user number on the fingerprint scanner, exactly as it writes it",
    },
  },
  {
    key: 'bank_code',
    th: 'รหัสธนาคาร',
    en: 'Bank code',
    width: 10,
    hint: {
      th: 'รหัสธนาคาร 3 หลักของ ธปท. เช่น 002 กรุงเทพ ใส่เมื่อมีเลขบัญชี',
      en: "The Bank of Thailand's 3-digit code, e.g. 002 for Bangkok Bank; needed with an account",
    },
  },
  {
    key: 'bank_name',
    th: 'ชื่อธนาคาร',
    en: 'Bank name',
    width: 16,
    hint: { th: 'ใส่เมื่อมีเลขบัญชี', en: 'Needed with an account number' },
  },
  {
    key: 'bank_account_no',
    th: 'เลขที่บัญชี',
    en: 'Bank account no.',
    width: 15,
    hint: { th: 'ระบบเก็บแบบเข้ารหัส', en: 'Stored encrypted' },
  },
  {
    key: 'bank_account_name',
    th: 'ชื่อบัญชี',
    en: 'Account name',
    width: 22,
    hint: {
      th: 'ว่างไว้ = ชื่อและนามสกุลภาษาไทยของพนักงาน',
      en: "Blank means the employee's Thai name",
    },
  },
];

// ------------------------------------------------------------------- values

const HEADINGS = new Map<string, EmployeeColumn>();
for (const column of EMPLOYEE_COLUMNS) {
  for (const name of [column.key, column.th, column.en])
    HEADINGS.set(normaliseHeading(name), column.key);
}

const THAI_MONTHS = [
  ['มกราคม', 'ม.ค.'],
  ['กุมภาพันธ์', 'ก.พ.'],
  ['มีนาคม', 'มี.ค.'],
  ['เมษายน', 'เม.ย.'],
  ['พฤษภาคม', 'พ.ค.'],
  ['มิถุนายน', 'มิ.ย.'],
  ['กรกฎาคม', 'ก.ค.'],
  ['สิงหาคม', 'ส.ค.'],
  ['กันยายน', 'ก.ย.'],
  ['ตุลาคม', 'ต.ค.'],
  ['พฤศจิกายน', 'พ.ย.'],
  ['ธันวาคม', 'ธ.ค.'],
];

/** A Buddhist-era year is 543 ahead; no one in an HR file was born in 2400 CE. */
function toGregorianYear(year: number): number {
  return year >= 2400 ? year - 543 : year;
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 2200 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A date as HR writes one, or as Excel stores it. Day first: that is how a
 * Thai spreadsheet shows dates, and a US-ordered file is the rarer mistake.
 * Two-digit years are refused rather than guessed at.
 */
export function parseDate(cell: Cell, dateSystem: 1900 | 1904): string | null {
  if (cell === null) return null;
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell) || cell < 1) return null;
    // Excel counts 1900-02-29, which never happened, so day 60 onwards is one
    // day ahead; Dec 30 1899 as day 0 absorbs that for every modern date.
    const epoch = dateSystem === 1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const date = new Date(epoch + Math.floor(cell) * 86_400_000);
    return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const text = cell.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  if (match) return isoDate(toGregorianYear(+match[1]), +match[2], +match[3]);

  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (match) return isoDate(toGregorianYear(+match[3]), +match[2], +match[1]);

  match = /^(\d{1,2})\s+(\S+)\s+(\d{4})$/.exec(text);
  if (match) {
    const month = THAI_MONTHS.findIndex(
      ([full, short]) => match![2] === full || match![2] === short,
    );
    if (month >= 0) return isoDate(toGregorianYear(+match[3]), month + 1, +match[1]);
  }
  return null;
}

/** Excel's short form of a long number, as it writes one into a CSV: 1.23457E+12. */
function isScientific(text: string): boolean {
  return /^\d(\.\d+)?E\+\d+$/i.test(text);
}

const CHOICES: {
  gender: Record<string, Gender>;
  marital_status: Record<string, MaritalStatus>;
  employment_type: Record<string, EmploymentType>;
} = {
  gender: {
    male: Gender.MALE,
    m: Gender.MALE,
    ชาย: Gender.MALE,
    female: Gender.FEMALE,
    f: Gender.FEMALE,
    หญิง: Gender.FEMALE,
    other: Gender.OTHER,
    อื่นๆ: Gender.OTHER,
    'อื่น ๆ': Gender.OTHER,
    undisclosed: Gender.UNDISCLOSED,
    ไม่ระบุ: Gender.UNDISCLOSED,
  },
  marital_status: {
    single: MaritalStatus.SINGLE,
    โสด: MaritalStatus.SINGLE,
    married: MaritalStatus.MARRIED,
    สมรส: MaritalStatus.MARRIED,
    divorced: MaritalStatus.DIVORCED,
    หย่า: MaritalStatus.DIVORCED,
    หย่าร้าง: MaritalStatus.DIVORCED,
    widowed: MaritalStatus.WIDOWED,
    หม้าย: MaritalStatus.WIDOWED,
    undisclosed: MaritalStatus.UNDISCLOSED,
    ไม่ระบุ: MaritalStatus.UNDISCLOSED,
  },
  employment_type: {
    full_time: EmploymentType.FULL_TIME,
    'full time': EmploymentType.FULL_TIME,
    ประจำ: EmploymentType.FULL_TIME,
    พนักงานประจำ: EmploymentType.FULL_TIME,
    part_time: EmploymentType.PART_TIME,
    'part time': EmploymentType.PART_TIME,
    พาร์ทไทม์: EmploymentType.PART_TIME,
    contract: EmploymentType.CONTRACT,
    สัญญาจ้าง: EmploymentType.CONTRACT,
    intern: EmploymentType.INTERN,
    ฝึกงาน: EmploymentType.INTERN,
    outsource: EmploymentType.OUTSOURCE,
    เอาท์ซอร์ส: EmploymentType.OUTSOURCE,
    daily: EmploymentType.DAILY,
    รายวัน: EmploymentType.DAILY,
  },
};

const ALLOWED: Record<keyof typeof CHOICES, string> = {
  gender: 'ชาย, หญิง, อื่น ๆ, ไม่ระบุ, MALE, FEMALE, OTHER, UNDISCLOSED',
  marital_status:
    'โสด, สมรส, หย่า, หม้าย, ไม่ระบุ, SINGLE, MARRIED, DIVORCED, WIDOWED, UNDISCLOSED',
  employment_type:
    'ประจำ, พาร์ทไทม์, สัญญาจ้าง, ฝึกงาน, เอาท์ซอร์ส, รายวัน, FULL_TIME, PART_TIME, CONTRACT, INTERN, OUTSOURCE, DAILY',
};

// -------------------------------------------------------------------- input

/** Something the organisation already has, found by code or by name. */
export interface NamedRecord {
  id: string;
  code: string;
  name: string;
}

export interface ImportContext {
  /**
   * Employee codes already in the organisation, including removed employees:
   * a code stays taken after its employee is deleted. `id` is null for those,
   * since a removed employee cannot be anyone's manager.
   */
  existingCodes: Map<string, { id: string | null }>;
  /** Scanner IDs already taken, to the employee code holding each. */
  takenScannerIds: Map<string, string>;
  departments: NamedRecord[];
  positions: NamedRecord[];
  workLocations: NamedRecord[];
  /** Today in the organisation's time zone, as YYYY-MM-DD. */
  today: string;
}

/** One employee as the file describes them, ready for the same checks as the API's. */
export interface ImportedEmployee {
  row: number;
  employeeCode: string;
  titleTh?: string;
  firstNameTh: string;
  lastNameTh: string;
  firstNameEn?: string;
  lastNameEn?: string;
  nickname?: string;
  dateOfBirth?: string;
  gender?: Gender;
  maritalStatus?: MaritalStatus;
  nationalId?: string;
  taxId?: string;
  socialSecurityNo?: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  addressLine?: string;
  province?: string;
  postalCode?: string;
  departmentId?: string;
  positionId?: string;
  workLocationId?: string;
  /** An existing employee's id, or a code from this same file. */
  manager?: { id: string } | { code: string };
  employmentType?: EmploymentType;
  hireDate: string;
  probationEndDate?: string;
  onProbation: boolean;
  scannerId?: string;
  bankAccount?: { bankCode: string; bankName: string; accountNo: string; accountName: string };
}

/** Which column of the file each import field sits in, and what the file calls it. */
export interface ColumnMap {
  index: Map<EmployeeColumn, number>;
  headers: Cell[];
}

// ------------------------------------------------------------------ reading

export function readHeader(header: Cell[]): { columns: ColumnMap; problems: ImportProblem[] } {
  const index = new Map<EmployeeColumn, number>();
  const problems: ImportProblem[] = [];

  header.forEach((cell, i) => {
    const heading = asText(cell);
    if (heading === null) return;
    const where = { row: 1, column: columnLetter(i), header: heading };
    const key = HEADINGS.get(normaliseHeading(heading));
    if (!key) {
      problems.push(importProblem('UNKNOWN_COLUMN', where, { header: heading }));
    } else if (index.has(key)) {
      problems.push(importProblem('DUPLICATE_COLUMN', where, { header: heading }));
    } else {
      index.set(key, i);
    }
  });

  for (const column of EMPLOYEE_COLUMNS) {
    if (column.required && !index.has(column.key)) {
      problems.push(
        importProblem('MISSING_COLUMN', { row: 1 }, { column: `${column.th} / ${column.en}` }),
      );
    }
  }
  return { columns: { index, headers: header }, problems };
}

/**
 * Every problem in the table, and the rows that had none. Rows are numbered as
 * the spreadsheet numbers them, so "row 7" is the row HR sees as 7.
 *
 * The clean rows come back even when other rows have problems, so the caller
 * can put them through the API's own checks too and report everything at once.
 * Nothing may be written unless `problems` is empty.
 */
export function readEmployees(
  table: Table,
  context: ImportContext,
): { employees: ImportedEmployee[]; problems: ImportProblem[] } {
  const [header = [], ...body] = table.rows;
  const { columns, problems } = readHeader(header);
  if (problems.length > 0) return { employees: [], problems };

  const rows = body
    .map((cells, i) => ({ cells, row: i + 2 }))
    .filter(({ cells }) => !isBlank(cells));
  if (rows.length === 0) return { employees: [], problems: [importProblem('NO_ROWS', { row: 0 })] };
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      employees: [],
      problems: [
        importProblem('TOO_MANY_ROWS', { row: 0 }, { rows: rows.length, max: MAX_IMPORT_ROWS }),
      ],
    };
  }

  const departments = lookup(context.departments);
  const positions = lookup(context.positions);
  const locations = lookup(context.workLocations);
  const employees: ImportedEmployee[] = [];
  const firstSeen = {
    code: new Map<string, number>(),
    nationalId: new Map<string, number>(),
    scannerId: new Map<string, number>(),
  };

  for (const { cells, row } of rows) {
    const rowProblems: ImportProblem[] = [];
    const where = (key: EmployeeColumn) => {
      const i = columns.index.get(key)!;
      return { row, column: columnLetter(i), header: asText(columns.headers[i]) ?? undefined };
    };
    const raw = (key: EmployeeColumn): Cell => {
      const i = columns.index.get(key);
      return i === undefined ? null : (cells[i] ?? null);
    };
    const report = (
      key: EmployeeColumn,
      code: ImportProblemCode,
      params?: Record<string, string | number>,
    ) => rowProblems.push(importProblem(code, where(key), params));

    const text = (key: EmployeeColumn, max: number): string | undefined => {
      const value = asText(raw(key));
      if (value === null) return undefined;
      if (value.length > max) {
        report(key, 'TOO_LONG', { max });
        return undefined;
      }
      return value;
    };
    const required = (key: EmployeeColumn, max: number): string => {
      const value = text(key, max);
      if (value === undefined && raw(key) === null) report(key, 'REQUIRED');
      return value ?? '';
    };
    /** Digits that must survive exactly: IDs and account numbers. */
    const digits = (key: EmployeeColumn, max: number): string | undefined => {
      const value = text(key, max);
      if (value === undefined) return undefined;
      if (isScientific(value)) {
        report(key, 'NUMBER_LOST', { value });
        return undefined;
      }
      return value;
    };
    const date = (key: EmployeeColumn): string | undefined => {
      const cell = raw(key);
      if (cell === null) return undefined;
      const value = parseDate(cell, table.dateSystem);
      if (value === null) report(key, 'INVALID_DATE', { value: asText(cell) ?? '' });
      return value ?? undefined;
    };
    const choice = <K extends keyof typeof CHOICES>(
      key: K,
    ): (typeof CHOICES)[K][string] | undefined => {
      const value = asText(raw(key));
      if (value === null) return undefined;
      const found =
        CHOICES[key][value.toLowerCase().replace(/\s+/g, ' ').trim()] ??
        CHOICES[key][value.toLowerCase().replace(/[\s-]+/g, '_')];
      if (!found) report(key, 'INVALID_CHOICE', { value, allowed: ALLOWED[key] });
      return found as (typeof CHOICES)[K][string] | undefined;
    };
    const reference = (key: EmployeeColumn, records: Lookup, what: string): string | undefined => {
      const value = asText(raw(key));
      if (value === null) return undefined;
      const found = records.find(value);
      if (found === 'ambiguous') report(key, 'AMBIGUOUS', { what, value });
      else if (!found) report(key, 'NOT_FOUND', { what, value });
      return typeof found === 'string' ? found : undefined;
    };

    // Identity.
    const employeeCode = required('employee_code', 32);
    if (employeeCode) {
      const existing = context.existingCodes.get(employeeCode);
      const earlier = firstSeen.code.get(employeeCode);
      if (existing) report('employee_code', 'CODE_EXISTS', { value: employeeCode });
      else if (earlier)
        report('employee_code', 'DUPLICATE_IN_FILE', { value: employeeCode, other: earlier });
      else firstSeen.code.set(employeeCode, row);
    }
    const firstNameTh = required('first_name_th', 80);
    const lastNameTh = required('last_name_th', 80);

    // National ID: digits only once the dashes and spaces are gone.
    let nationalId = digits('national_id', 20);
    if (nationalId !== undefined) {
      nationalId = nationalId.replace(/[\s-]/g, '');
      if (!/^\d{13}$/.test(nationalId)) {
        report('national_id', 'INVALID_NATIONAL_ID');
        nationalId = undefined;
      } else {
        const earlier = firstSeen.nationalId.get(nationalId);
        // The ID itself is not repeated back: it is the one field here that is secret.
        if (earlier)
          report('national_id', 'DUPLICATE_IN_FILE', {
            value: `…${nationalId.slice(-4)}`,
            other: earlier,
          });
        else firstSeen.nationalId.set(nationalId, row);
      }
    }

    // Scanner ID, exactly as the scanner writes it.
    const scannerId = digits('scanner_id', 32);
    if (scannerId !== undefined) {
      const owner = context.takenScannerIds.get(scannerId);
      const earlier = firstSeen.scannerId.get(scannerId);
      if (/\s/.test(scannerId)) report('scanner_id', 'INVALID_VALUE', { value: scannerId });
      // Held by this same code means the row is a repeat, which the code says already.
      else if (owner && owner !== employeeCode) {
        report('scanner_id', 'SCANNER_ID_TAKEN', { value: scannerId, owner });
      } else if (earlier)
        report('scanner_id', 'DUPLICATE_IN_FILE', { value: scannerId, other: earlier });
      else firstSeen.scannerId.set(scannerId, row);
    }

    // A phone typed into a number cell loses its leading zero; a Thai number
    // always has one, so it goes back.
    let phone = text('phone', 20);
    if (phone !== undefined && typeof raw('phone') === 'number' && /^[1-9]\d{7,8}$/.test(phone)) {
      phone = `0${phone}`;
    }

    // Employment.
    const hireCell = raw('hire_date');
    const hireDate = date('hire_date');
    if (hireCell === null) report('hire_date', 'REQUIRED');
    const probationEndDate = date('probation_end_date');
    if (hireDate && probationEndDate && probationEndDate < hireDate) {
      report('probation_end_date', 'PROBATION_BEFORE_HIRE');
    }

    // Manager: someone already here, or someone further up or down this file.
    let manager: ImportedEmployee['manager'];
    const managerCode = asText(raw('manager_code'));
    if (managerCode !== null) {
      const existing = context.existingCodes.get(managerCode);
      if (managerCode === employeeCode) report('manager_code', 'SELF_MANAGER');
      else if (existing?.id) manager = { id: existing.id };
      else if (existing)
        report('manager_code', 'NOT_FOUND', { what: 'employee', value: managerCode });
      else manager = { code: managerCode };
    }

    // Bank account: all or nothing. A bank code is always three digits, so one
    // Excel stored as a number gets its leading zeros back.
    let bankCode = digits('bank_code', 10);
    if (bankCode !== undefined && typeof raw('bank_code') === 'number') {
      bankCode = bankCode.padStart(3, '0');
    }
    const bankName = text('bank_name', 80);
    const accountNo = digits('bank_account_no', 20)?.replace(/[\s-]/g, '');
    let bankAccount: ImportedEmployee['bankAccount'];
    if (bankCode || bankName || accountNo) {
      if (!bankCode || !bankName || !accountNo) {
        report(
          bankCode ? (bankName ? 'bank_account_no' : 'bank_name') : 'bank_code',
          'BANK_INCOMPLETE',
        );
      } else if (!/^\d{3}$/.test(bankCode)) {
        report('bank_code', 'INVALID_VALUE', { value: bankCode });
      } else if (!/^\d{6,20}$/.test(accountNo)) {
        report('bank_account_no', 'INVALID_VALUE', { value: `…${accountNo.slice(-4)}` });
      } else {
        bankAccount = {
          bankCode,
          bankName,
          accountNo,
          accountName: text('bank_account_name', 120) ?? `${firstNameTh} ${lastNameTh}`.trim(),
        };
      }
    }

    const employee: ImportedEmployee = {
      row,
      employeeCode,
      titleTh: text('title_th', 20),
      firstNameTh,
      lastNameTh,
      firstNameEn: text('first_name_en', 80),
      lastNameEn: text('last_name_en', 80),
      nickname: text('nickname', 40),
      dateOfBirth: date('date_of_birth'),
      gender: choice('gender'),
      maritalStatus: choice('marital_status'),
      nationalId,
      taxId: digits('tax_id', 32),
      socialSecurityNo: digits('social_security_no', 32),
      workEmail: text('work_email', 254)?.toLowerCase(),
      personalEmail: text('personal_email', 254)?.toLowerCase(),
      phone,
      addressLine: text('address_line', 255),
      province: text('province', 80),
      postalCode: text('postal_code', 10),
      departmentId: reference('department', departments, 'department'),
      positionId: reference('position', positions, 'position'),
      workLocationId: reference('work_location', locations, 'work location'),
      manager,
      employmentType: choice('employment_type'),
      hireDate: hireDate ?? '',
      probationEndDate,
      onProbation: probationEndDate !== undefined && probationEndDate >= context.today,
      scannerId,
      bankAccount,
    };

    problems.push(...rowProblems);
    if (rowProblems.length === 0) employees.push(employee);
  }

  problems.push(...managerProblems(employees, columns, firstSeen.code));
  return { employees, problems: inReadingOrder(problems).slice(0, MAX_PROBLEMS) };
}

/** By row, then column, as someone working down the spreadsheet meets them. */
export function inReadingOrder(problems: ImportProblem[]): ImportProblem[] {
  const column = (p: ImportProblem) => p.column ?? '';
  return [...problems].sort(
    (a, b) =>
      a.row - b.row || column(a).length - column(b).length || column(a).localeCompare(column(b)),
  );
}

/** Managers named by code must be in the file, and must not lead back round. */
function managerProblems(
  employees: ImportedEmployee[],
  columns: ColumnMap,
  inFile: Map<string, number>,
): ImportProblem[] {
  const i = columns.index.get('manager_code');
  if (i === undefined) return [];
  const where = (row: number) => ({
    row,
    column: columnLetter(i),
    header: asText(columns.headers[i]) ?? undefined,
  });
  const problems: ImportProblem[] = [];
  const managerOf = new Map<string, string>();

  for (const employee of employees) {
    if (!employee.manager || !('code' in employee.manager)) continue;
    if (!inFile.has(employee.manager.code)) {
      problems.push(
        importProblem('NOT_FOUND', where(employee.row), {
          what: 'employee',
          value: employee.manager.code,
        }),
      );
    } else {
      managerOf.set(employee.employeeCode, employee.manager.code);
    }
  }

  // A loop can only form inside the file: an employee already in Cwork has no
  // manager here that points back into it.
  // Each loop is reported once, on the row of whichever member is met first,
  // whether the walk started inside it or on a chain leading into it.
  const reported = new Set<string>();
  for (const start of managerOf.keys()) {
    const chain = [start];
    let current = managerOf.get(start);
    while (current !== undefined && !chain.includes(current)) {
      chain.push(current);
      current = managerOf.get(current);
    }
    if (current === undefined) continue;
    const loop = chain.slice(chain.indexOf(current));
    if (loop.some((code) => reported.has(code))) continue;
    loop.forEach((code) => reported.add(code));
    problems.push(
      importProblem('MANAGER_CYCLE', where(inFile.get(loop[0])!), {
        chain: [...loop, loop[0]].join(' → '),
      }),
    );
  }
  return problems;
}

interface Lookup {
  find(value: string): string | 'ambiguous' | undefined;
}

/** Finds a record by its code, or else by a name only one record has. */
function lookup(records: NamedRecord[]): Lookup {
  const byCode = new Map(records.map((r) => [r.code.toLowerCase(), r.id]));
  const byName = new Map<string, string[]>();
  for (const record of records) {
    const name = record.name.trim().toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), record.id]);
  }
  return {
    find(value) {
      const key = value.trim().toLowerCase();
      const code = byCode.get(key);
      if (code) return code;
      const named = byName.get(key) ?? [];
      if (named.length > 1) return 'ambiguous';
      return named[0];
    },
  };
}
