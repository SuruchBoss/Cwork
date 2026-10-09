// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { EmploymentType, Gender, MaritalStatus } from '@prisma/client';
import type { Cell, Table } from '../../../core/spreadsheet/table';
import {
  EMPLOYEE_COLUMNS,
  MAX_IMPORT_ROWS,
  MAX_PROBLEMS,
  parseDate,
  readEmployees,
  readHeader,
  type ImportContext,
} from './employee-import';

const HEADER = ['รหัสพนักงาน *', 'ชื่อ *', 'นามสกุล *', 'วันเริ่มงาน *'];

function table(rows: Cell[][], header: Cell[] = HEADER, dateSystem: 1900 | 1904 = 1900): Table {
  return { rows: [header, ...rows], dateSystem };
}

function context(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    existingCodes: new Map(),
    takenScannerIds: new Map(),
    departments: [
      { id: 'dep-eng', code: 'ENG', name: 'วิศวกรรม' },
      { id: 'dep-ops1', code: 'OPS1', name: 'ปฏิบัติการ' },
      { id: 'dep-ops2', code: 'OPS2', name: 'ปฏิบัติการ' },
    ],
    positions: [{ id: 'pos-dev', code: 'DEV', name: 'Developer' }],
    workLocations: [{ id: 'loc-hq', code: 'HQ-SATHORN', name: 'สำนักงานใหญ่' }],
    today: '2026-10-01',
    ...overrides,
  };
}

describe('readHeader', () => {
  it('knows each column by its Thai label, its English label or its key', () => {
    const { columns, problems } = readHeader([
      'รหัสพนักงาน *',
      'First name (Thai)',
      'last_name_th',
      '  วันเริ่มงาน  ',
      'SCANNER ID',
    ]);
    expect(problems).toEqual([]);
    expect([...columns.index.entries()]).toEqual([
      ['employee_code', 0],
      ['first_name_th', 1],
      ['last_name_th', 2],
      ['hire_date', 3],
      ['scanner_id', 4],
    ]);
  });

  it('refuses a column it does not know rather than dropping what is in it', () => {
    const { problems } = readHeader([...HEADER, 'นามสกุ']);
    expect(problems).toEqual([
      expect.objectContaining({ row: 1, column: 'E', code: 'UNKNOWN_COLUMN', header: 'นามสกุ' }),
    ]);
  });

  it('refuses a column twice, and names a required one that is missing', () => {
    const { problems } = readHeader(['รหัสพนักงาน', 'Employee code', 'ชื่อ', 'นามสกุล']);
    expect(problems.map((p) => p.code)).toEqual(['DUPLICATE_COLUMN', 'MISSING_COLUMN']);
    expect(problems[1].message).toContain('วันเริ่มงาน / Hire date');
  });

  it('offers every column in the template with a hint', () => {
    for (const column of EMPLOYEE_COLUMNS) {
      expect(column.hint.th).not.toBe('');
      expect(column.hint.en).not.toBe('');
    }
  });
});

describe('parseDate', () => {
  it('reads Excel day numbers in both of its calendars', () => {
    expect(parseDate(45306, 1900)).toBe('2024-01-15');
    expect(parseDate(33005, 1900)).toBe('1990-05-12');
    expect(parseDate(43844, 1904)).toBe('2024-01-15');
  });

  it('reads dates as Thai HR writes them, day first, in either era', () => {
    expect(parseDate('2024-01-15', 1900)).toBe('2024-01-15');
    expect(parseDate('2024-01-15 00:00:00', 1900)).toBe('2024-01-15');
    expect(parseDate('15/1/2567', 1900)).toBe('2024-01-15');
    expect(parseDate('15/01/2024', 1900)).toBe('2024-01-15');
    expect(parseDate('15-01-2024', 1900)).toBe('2024-01-15');
    expect(parseDate('15.1.2567', 1900)).toBe('2024-01-15');
    expect(parseDate('2567-01-15', 1900)).toBe('2024-01-15');
    expect(parseDate('15 มกราคม 2567', 1900)).toBe('2024-01-15');
    expect(parseDate('15 ม.ค. 2567', 1900)).toBe('2024-01-15');
  });

  it('refuses what is not a real day, and two-digit years it would have to guess', () => {
    expect(parseDate('31/02/2567', 1900)).toBeNull();
    expect(parseDate('15/1/67', 1900)).toBeNull();
    expect(parseDate('next Monday', 1900)).toBeNull();
    expect(parseDate('15 Jan 2024', 1900)).toBeNull();
    expect(parseDate(0, 1900)).toBeNull();
  });
});

describe('readEmployees', () => {
  it('reads a clean file into employees, Thai intact', () => {
    const header = [
      'รหัสพนักงาน',
      'คำนำหน้า',
      'ชื่อ',
      'นามสกุล',
      'วันเกิด',
      'เพศ',
      'สถานภาพ',
      'เลขบัตรประชาชน',
      'อีเมลงาน',
      'เบอร์โทร',
      'แผนก',
      'ตำแหน่ง',
      'สถานที่ทำงาน',
      'ประเภทการจ้าง',
      'วันเริ่มงาน',
      'วันครบทดลองงาน',
      'รหัสเครื่องสแกนนิ้ว',
    ];
    const { employees, problems } = readEmployees(
      table(
        [
          [
            'E001',
            'นาย',
            'สมชาย',
            'ใจดี',
            '12/5/2533',
            'ชาย',
            'สมรส',
            '1-2345-67890-12-3',
            'Somchai@Example.co.th',
            812345678,
            'ENG',
            'developer',
            'สำนักงานใหญ่',
            'ประจำ',
            45306,
            '2024-05-14',
            '007',
          ],
          [
            'E002',
            null,
            'สมศรี',
            'มีสุข',
            null,
            'FEMALE',
            null,
            1234567890124,
            null,
            '081-234-5679',
            null,
            null,
            null,
            'part-time',
            '1/9/2026',
            '28/11/2026',
            12,
          ],
        ],
        header,
      ),
      context(),
    );

    expect(problems).toEqual([]);
    expect(employees).toEqual([
      expect.objectContaining({
        row: 2,
        employeeCode: 'E001',
        titleTh: 'นาย',
        firstNameTh: 'สมชาย',
        lastNameTh: 'ใจดี',
        dateOfBirth: '1990-05-12',
        gender: Gender.MALE,
        maritalStatus: MaritalStatus.MARRIED,
        nationalId: '1234567890123',
        workEmail: 'somchai@example.co.th',
        phone: '0812345678',
        departmentId: 'dep-eng',
        positionId: 'pos-dev',
        workLocationId: 'loc-hq',
        employmentType: EmploymentType.FULL_TIME,
        hireDate: '2024-01-15',
        probationEndDate: '2024-05-14',
        onProbation: false,
        scannerId: '007',
      }),
      expect.objectContaining({
        row: 3,
        employeeCode: 'E002',
        gender: Gender.FEMALE,
        nationalId: '1234567890124',
        phone: '081-234-5679',
        employmentType: EmploymentType.PART_TIME,
        hireDate: '2026-09-01',
        probationEndDate: '2026-11-28',
        onProbation: true,
        scannerId: '12',
      }),
    ]);
  });

  it('says which row, column and why, and keeps the clean rows for the next checks', () => {
    const { employees, problems } = readEmployees(
      table([
        ['E001', 'สมชาย', 'ใจดี', '2024-01-15'],
        ['E002', 'สมศรี', null, '31/02/2567'],
        ['E003', 'มานี', 'มีนา', '2024-01-15'],
      ]),
      context(),
    );

    // Nothing is written while there are problems; the service sees to that.
    expect(employees.map((e) => e.row)).toEqual([2, 4]);
    expect(problems).toEqual([
      expect.objectContaining({
        row: 3,
        column: 'C',
        header: 'นามสกุล *',
        code: 'NAME_REQUIRED',
      }),
      expect.objectContaining({
        row: 3,
        column: 'D',
        code: 'INVALID_DATE',
        message: '"31/02/2567" is not a date this import can read',
      }),
    ]);
  });

  it('refuses, row by row, codes that are already in Cwork, so a second import adds no one', () => {
    const { problems } = readEmployees(
      table([
        ['E001', 'สมชาย', 'ใจดี', '2024-01-15'],
        ['E002', 'สมศรี', 'มีสุข', '2024-01-15'],
      ]),
      context({
        existingCodes: new Map([
          ['E001', { id: 'emp-1' }],
          ['E002', { id: null }],
        ]),
      }),
    );
    expect(problems.map((p) => [p.row, p.code, p.message])).toEqual([
      [2, 'CODE_EXISTS', 'Employee code E001 already exists'],
      [3, 'CODE_EXISTS', 'Employee code E002 already exists'],
    ]);
  });

  it('refuses a code, national ID or scanner ID that appears twice in the file', () => {
    const header = [...HEADER, 'เลขบัตรประชาชน', 'รหัสเครื่องสแกนนิ้ว'];
    const { problems } = readEmployees(
      table(
        [
          ['E001', 'สมชาย', 'ใจดี', '2024-01-15', '1234567890123', '7'],
          ['E001', 'สมศรี', 'มีสุข', '2024-01-15', '1-2345-67890-12-3', '7'],
        ],
        header,
      ),
      context(),
    );
    expect(problems.map((p) => [p.row, p.column, p.code, p.message])).toEqual([
      [3, 'A', 'DUPLICATE_IN_FILE', '"E001" is also on row 2'],
      // The ID is not repeated back in full: it is secret.
      [3, 'E', 'DUPLICATE_IN_FILE', '"…0123" is also on row 2'],
      [3, 'F', 'DUPLICATE_IN_FILE', '"7" is also on row 2'],
    ]);
  });

  it('refuses a scanner ID another employee already has', () => {
    const { problems } = readEmployees(
      table([['E009', 'มานี', 'มีนา', '2024-01-15', '7']], [...HEADER, 'scanner_id']),
      context({ takenScannerIds: new Map([['7', 'E001']]) }),
    );
    expect(problems[0]).toMatchObject({
      code: 'SCANNER_ID_TAKEN',
      message: 'Scanner ID 7 already belongs to employee E001',
    });
  });

  it('says a repeated row is a repeat once, not once per field it repeats', () => {
    const { problems } = readEmployees(
      table([['E001', 'สมชาย', 'ใจดี', '2024-01-15', '7']], [...HEADER, 'scanner_id']),
      context({
        existingCodes: new Map([['E001', { id: 'emp-1' }]]),
        takenScannerIds: new Map([['7', 'E001']]),
      }),
    );
    expect(problems.map((p) => p.code)).toEqual(['CODE_EXISTS']);
  });

  it('says so when Excel has already shortened a long number', () => {
    const { problems } = readEmployees(
      table([['E001', 'สมชาย', 'ใจดี', '2024-01-15', '1.23457E+12']], [...HEADER, 'national_id']),
      context(),
    );
    expect(problems[0]).toMatchObject({ code: 'NUMBER_LOST', params: { value: '1.23457E+12' } });
  });

  it('refuses a national ID that is not 13 digits, and a choice it does not know', () => {
    const { problems } = readEmployees(
      table(
        [['E001', 'สมชาย', 'ใจดี', '2024-01-15', '12345', 'ชายหญิง']],
        [...HEADER, 'national_id', 'gender'],
      ),
      context(),
    );
    expect(problems.map((p) => p.code)).toEqual(['INVALID_NATIONAL_ID', 'INVALID_CHOICE']);
  });

  describe("a foreign worker's documents (CW-068)", () => {
    const FOREIGN = [
      'รหัสพนักงาน',
      'first_name_en',
      'last_name_en',
      'วันเริ่มงาน',
      'เลขพาสปอร์ต',
      'วันหมดอายุพาสปอร์ต',
      'เลขใบอนุญาตทำงาน',
      'วันหมดอายุใบอนุญาตทำงาน',
    ];

    it('takes someone with an English name only, no national ID, and both documents', () => {
      const { employees, problems } = readEmployees(
        table(
          [
            [
              'F001',
              'Aung',
              'Kyaw',
              '2024-01-15',
              'mb 123-456',
              '30/6/2573',
              'WP-0012345',
              '2027-03-31',
            ],
          ],
          FOREIGN,
        ),
        context(),
      );

      expect(problems).toEqual([]);
      expect(employees[0]).toMatchObject({
        firstNameTh: 'Aung',
        lastNameTh: 'Kyaw',
        firstNameEn: 'Aung',
        lastNameEn: 'Kyaw',
        passportNo: 'MB123456',
        passportExpiresOn: '2030-06-30',
        workPermitNo: 'WP-0012345',
        workPermitExpiresOn: '2027-03-31',
      });
      expect(employees[0].nationalId).toBeUndefined();
    });

    it('keeps the Thai name where there is one, and fills only the half that is missing', () => {
      const { employees } = readEmployees(
        table(
          [['F002', 'อ่อง', null, '2024-01-15', 'Aung', 'Kyaw']],
          [...HEADER, 'first_name_en', 'last_name_en'],
        ),
        context(),
      );
      expect(employees[0]).toMatchObject({ firstNameTh: 'อ่อง', lastNameTh: 'Kyaw' });
    });

    it('asks for a name in either language when a row has neither', () => {
      const { problems } = readEmployees(
        table(
          [['F003', null, 'Kyaw', '2024-01-15']],
          ['รหัสพนักงาน', 'first_name_en', 'last_name_en', 'วันเริ่มงาน'],
        ),
        context(),
      );
      expect(problems).toEqual([
        expect.objectContaining({ row: 2, column: 'B', code: 'NAME_REQUIRED' }),
      ]);
    });

    it('needs a Thai or an English name column, and says so naming both', () => {
      const { problems } = readHeader(['รหัสพนักงาน', 'นามสกุล', 'วันเริ่มงาน']);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({ code: 'MISSING_COLUMN' });
      expect(problems[0].message).toContain('ชื่อ / First name (Thai)');
      expect(problems[0].message).toContain('ชื่อ (อังกฤษ) / First name (English)');
    });

    it('refuses a passport number that is not letters and digits, or appears twice, without repeating it', () => {
      const { problems } = readEmployees(
        table(
          [
            ['F004', 'A', 'B', '2024-01-15', 'MB/123456'],
            ['F005', 'C', 'D', '2024-01-15', 'MB777777'],
            ['F006', 'E', 'F', '2024-01-15', 'mb777777'],
          ],
          ['รหัสพนักงาน', 'first_name_en', 'last_name_en', 'วันเริ่มงาน', 'passport_no'],
        ),
        context(),
      );
      expect(problems).toEqual([
        expect.objectContaining({ row: 2, code: 'INVALID_VALUE', params: { value: '…3456' } }),
        expect.objectContaining({
          row: 4,
          code: 'DUPLICATE_IN_FILE',
          params: { value: '…7777', other: 3 },
        }),
      ]);
    });

    it('refuses an expiry it cannot read as a date', () => {
      const { problems } = readEmployees(
        table(
          [['F007', 'A', 'B', '2024-01-15', 'next year']],
          ['รหัสพนักงาน', 'first_name_en', 'last_name_en', 'วันเริ่มงาน', 'work_permit_expires_on'],
        ),
        context(),
      );
      expect(problems).toEqual([expect.objectContaining({ code: 'INVALID_DATE' })]);
    });
  });

  describe('references', () => {
    const header = [...HEADER, 'แผนก'];

    it('finds a department by name when only one has it, and asks for the code when two do', () => {
      const { problems } = readEmployees(
        table(
          [
            ['E001', 'สมชาย', 'ใจดี', '2024-01-15', 'ปฏิบัติการ'],
            ['E002', 'สมศรี', 'มีสุข', '2024-01-15', 'การตลาด'],
          ],
          header,
        ),
        context(),
      );
      expect(problems.map((p) => [p.row, p.code, p.message])).toEqual([
        [2, 'AMBIGUOUS', 'More than one department is called "ปฏิบัติการ"; use its code'],
        [3, 'NOT_FOUND', 'No department "การตลาด"'],
      ]);
    });
  });

  describe('managers', () => {
    const header = [...HEADER, 'รหัสหัวหน้า'];
    const rows = (...pairs: [string, string | null][]) =>
      pairs.map(([code, manager]) => [code, 'ชื่อ', 'สกุล', '2024-01-15', manager]);

    it('takes a manager already in Cwork, or one further down the file', () => {
      const { employees, problems } = readEmployees(
        table(rows(['E002', 'E003'], ['E003', 'M001']), header),
        context({ existingCodes: new Map([['M001', { id: 'emp-m1' }]]) }),
      );
      expect(problems).toEqual([]);
      expect(employees.map((e) => e.manager)).toEqual([{ code: 'E003' }, { id: 'emp-m1' }]);
    });

    it('refuses a manager who is nowhere, who was removed, or who is the employee', () => {
      const { problems } = readEmployees(
        table(rows(['E001', 'X999'], ['E002', 'OLD1'], ['E003', 'E003']), header),
        context({ existingCodes: new Map([['OLD1', { id: null }]]) }),
      );
      expect(problems.map((p) => [p.row, p.code])).toEqual([
        [2, 'NOT_FOUND'],
        [3, 'NOT_FOUND'],
        [4, 'SELF_MANAGER'],
      ]);
    });

    it('refuses managers that go round in a loop, once per loop', () => {
      const { problems } = readEmployees(
        table(rows(['E004', 'E001'], ['E001', 'E002'], ['E002', 'E003'], ['E003', 'E001']), header),
        context(),
      );
      expect(problems).toEqual([
        expect.objectContaining({
          row: 3,
          column: 'E',
          code: 'MANAGER_CYCLE',
          message: 'Managers form a loop: E001 → E002 → E003 → E001',
        }),
      ]);
    });
  });

  describe('probation and bank accounts', () => {
    it('refuses a probation that ends before the person started', () => {
      const { problems } = readEmployees(
        table(
          [['E001', 'สมชาย', 'ใจดี', '2024-01-15', '2023-12-31']],
          [...HEADER, 'probation_end_date'],
        ),
        context(),
      );
      expect(problems[0].code).toBe('PROBATION_BEFORE_HIRE');
    });

    it('takes a whole bank account, restoring a bank code Excel made a number', () => {
      const header = [...HEADER, 'รหัสธนาคาร', 'ชื่อธนาคาร', 'เลขที่บัญชี'];
      const { employees, problems } = readEmployees(
        table([['E001', 'สมชาย', 'ใจดี', '2024-01-15', 2, 'กรุงเทพ', '123-4-56789-0']], header),
        context(),
      );
      expect(problems).toEqual([]);
      expect(employees[0].bankAccount).toEqual({
        bankCode: '002',
        bankName: 'กรุงเทพ',
        accountNo: '1234567890',
        accountName: 'สมชาย ใจดี',
      });
    });

    it('refuses half a bank account', () => {
      const header = [...HEADER, 'bank_name', 'bank_account_no'];
      const { problems } = readEmployees(
        table([['E001', 'สมชาย', 'ใจดี', '2024-01-15', 'กรุงเทพ', '1234567890']], header),
        context(),
      );
      expect(problems[0]).toMatchObject({ code: 'BANK_INCOMPLETE' });
    });
  });

  describe('the file as a whole', () => {
    it('skips blank rows but keeps the row numbers Excel shows', () => {
      const { employees } = readEmployees(
        table([[], ['E001', 'สมชาย', 'ใจดี', '2024-01-15'], [null, null]]),
        context(),
      );
      expect(employees.map((e) => e.row)).toEqual([3]);
    });

    it('refuses a file with no one in it', () => {
      expect(readEmployees(table([]), context()).problems[0].code).toBe('NO_ROWS');
    });

    it('refuses more rows than one import takes', () => {
      const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [
        `E${i}`,
        'ก',
        'ข',
        '2024-01-15',
      ]);
      expect(readEmployees(table(many), context()).problems[0]).toMatchObject({
        code: 'TOO_MANY_ROWS',
        params: { rows: MAX_IMPORT_ROWS + 1, max: MAX_IMPORT_ROWS },
      });
    });

    it('stops listing problems once there are enough to see the pattern', () => {
      const bad = Array.from({ length: MAX_PROBLEMS + 50 }, (_, i) => [`E${i}`, null, 'ข', null]);
      expect(readEmployees(table(bad), context()).problems).toHaveLength(MAX_PROBLEMS);
    });
  });
});
