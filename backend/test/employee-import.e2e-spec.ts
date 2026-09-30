// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Importing employees from a spreadsheet (CW-059).
 *
 * The pilot company's people come out of Odoo into Excel, and into Cwork
 * through this. What matters is what the ticket says HR would otherwise find
 * out the hard way: Thai survives Thai Excel's CSV, a bad row stops the whole
 * file, a second run adds nobody, and a national ID read from a cell is
 * encrypted exactly as one typed into the API.
 */
import { PrismaClient } from '@prisma/client';
import { readXlsx, writeXlsx } from 'src/core/spreadsheet/xlsx';
import { resolveDatabaseUrl } from './utils/database';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR_OFFICER = 'hr.officer@cwork.example';
const HR_MANAGER = 'hr.manager@cwork.example';
const EMPLOYEE = 'dev2@cwork.example';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Thai as Excel's "CSV (Comma delimited)" writes it on a Thai machine: Windows-874. */
function windows874(text: string): Buffer {
  return Buffer.from(
    [...text].map((char) => {
      const code = char.codePointAt(0)!;
      if (code >= 0x0e01 && code <= 0x0e5b) return code - 0x0e01 + 0xa1;
      if (code < 0x80) return code;
      throw new Error(`not in Windows-874: ${char}`);
    }),
  );
}

function workbook(rows: string[][]): Buffer {
  return Buffer.from(writeXlsx([{ name: 'พนักงาน', header: true, rows }]));
}

async function withDb<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

describe('Employee import (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let hrToken: string;
  let managerToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    hrToken = await api.token(HR_OFFICER);
    managerToken = await api.token(HR_MANAGER);
    employeeToken = await api.token(EMPLOYEE);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const upload = (path: string, content: Buffer, filename: string, token = hrToken) =>
    api.upload(path, token, {
      filename,
      contentType: filename.endsWith('.csv') ? 'text/csv' : XLSX,
      content,
    });

  const codesLike = (prefix: string) =>
    withDb((prisma) =>
      prisma.employee.findMany({
        where: { employeeCode: { startsWith: prefix } },
        orderBy: { employeeCode: 'asc' },
      }),
    );

  describe('the template', () => {
    it('is an .xlsx with the columns HR fills in, in Thai by default', async () => {
      const res = await api.getRaw('/employees/import/template', hrToken);

      expect(res.status).toBe(200);
      const sheet = readXlsx(res.body).rows;
      expect(sheet[0].slice(0, 4)).toEqual(['รหัสพนักงาน *', 'คำนำหน้า', 'ชื่อ *', 'นามสกุล *']);
      expect(sheet[0]).toContain('รหัสเครื่องสแกนนิ้ว');
    });

    it('comes in English on request', async () => {
      const res = await api.getRaw('/employees/import/template?lang=en', hrToken);
      expect(readXlsx(res.body).rows[0][0]).toBe('Employee code *');
    });

    it('is only for someone who may create employees', async () => {
      const res = await api.getRaw('/employees/import/template', employeeToken);
      expect(res.status).toBe(403);
    });
  });

  describe("Thai Excel's default CSV", () => {
    const csv = windows874(
      [
        'รหัสพนักงาน,ชื่อ,นามสกุล,วันเริ่มงาน,แผนก',
        'IMPCSV-1,สมชาย,ใจดี,15/1/2567,ฝ่ายวิศวกรรม',
        'IMPCSV-2,สมศรี,มีสุข,2024-02-01,SALES',
      ].join('\r\n'),
    );

    it('previews with the Thai intact, and writes nothing', async () => {
      const res = await upload('/employees/import/preview', csv, 'พนักงาน.csv');

      expect(res.status).toBe(200);
      expect(res.body.problems).toEqual([]);
      expect(res.body.employees).toEqual([
        expect.objectContaining({ row: 2, employeeCode: 'IMPCSV-1', name: 'สมชาย ใจดี' }),
        expect.objectContaining({ row: 3, employeeCode: 'IMPCSV-2', name: 'สมศรี มีสุข' }),
      ]);
      expect(await codesLike('IMPCSV-')).toEqual([]);
    });

    it('imports with the Thai intact', async () => {
      const res = await upload('/employees/import', csv, 'พนักงาน.csv');

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ created: 2 });
      const [first, second] = await codesLike('IMPCSV-');
      expect([first.firstNameTh, first.lastNameTh]).toEqual(['สมชาย', 'ใจดี']);
      expect(first.hireDate.toISOString().slice(0, 10)).toBe('2024-01-15');
      expect(second.firstNameTh).toBe('สมศรี');
    });
  });

  describe('a file with one bad row', () => {
    const file = workbook([
      ['รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'วันเริ่มงาน', 'อีเมลงาน'],
      ['IMPBAD-1', 'มานี', 'มีนา', '2024-01-15', 'manee@example.co.th'],
      ['IMPBAD-2', 'ปิติ', 'ยินดี', '2024-01-15', 'not-an-email'],
    ]);

    it('names the row, the column and the problem', async () => {
      const res = await upload('/employees/import/preview', file, 'bad.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.employees).toEqual([]);
      expect(res.body.problems).toEqual([
        {
          row: 3,
          column: 'E',
          header: 'อีเมลงาน',
          code: 'INVALID_EMAIL',
          params: { value: 'not-an-email' },
          message: '"not-an-email" is not an email address',
        },
      ]);
    });

    it('lists every problem at once, whichever check finds it', async () => {
      const res = await upload(
        '/employees/import/preview',
        workbook([
          ['รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'วันเริ่มงาน', 'อีเมลงาน'],
          ['IMPBAD-3', 'มานี', 'มีนา', '31/02/2567', 'manee@example.co.th'],
          ['IMPBAD-4', 'ปิติ', 'ยินดี', '2024-01-15', 'not-an-email'],
        ]),
        'two-problems.xlsx',
      );
      expect(res.body.problems.map((p: { row: number; code: string }) => [p.row, p.code])).toEqual([
        [2, 'INVALID_DATE'],
        [3, 'INVALID_EMAIL'],
      ]);
    });

    it('writes nothing, not even the good row', async () => {
      const res = await upload('/employees/import', file, 'bad.xlsx');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('IMPORT_HAS_PROBLEMS');
      expect(res.body.details.problems).toHaveLength(1);
      expect(await codesLike('IMPBAD-')).toEqual([]);
    });
  });

  describe('a full import', () => {
    const rows = [
      [
        'รหัสพนักงาน',
        'ชื่อ',
        'นามสกุล',
        'วันเริ่มงาน',
        'วันครบทดลองงาน',
        'เลขบัตรประชาชน',
        'รหัสหัวหน้า',
        'รหัสเครื่องสแกนนิ้ว',
        'รหัสธนาคาร',
        'ชื่อธนาคาร',
        'เลขที่บัญชี',
      ],
      // A manager further down the file, and one already in Cwork.
      ['IMPX-1', 'สมหญิง', 'รักงาน', '2024-01-15', '', '3-1006-00123-45-6', 'IMPX-2', '007'],
      [
        'IMPX-2',
        'สมหมาย',
        'ตั้งใจ',
        '2020-06-01',
        '',
        '',
        'EMP-0002',
        '008',
        '002',
        'กรุงเทพ',
        '123-4-56789-0',
      ],
      ['IMPX-3', 'สมใจ', 'ใหม่มาก', '2026-09-01', '2099-12-31', '', '', ''],
    ];

    it('creates everyone, in one step, and says how many', async () => {
      const res = await upload('/employees/import', workbook(rows), 'จาก Odoo.xlsx');

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ created: 3 });
    });

    it('encrypts the national ID exactly as one typed into the API', async () => {
      const [first] = await codesLike('IMPX-');
      expect(first.nationalIdEnc).not.toContain('3100600123456');
      expect(first.nationalIdLast4).toBe('3456');

      const read = await api.get(`/employees/${first.id}`, managerToken);
      expect(read.body.nationalId).toBe('3100600123456');
    });

    it('links managers, scanner IDs, probation and the bank account', async () => {
      const [first, second, third] = await codesLike('IMPX-');
      const hrManager = await withDb((prisma) =>
        prisma.employee.findFirstOrThrow({ where: { employeeCode: 'EMP-0002' } }),
      );

      expect(first.managerId).toBe(second.id);
      expect(second.managerId).toBe(hrManager.id);
      expect([first.scannerId, second.scannerId, third.scannerId]).toEqual(['007', '008', null]);
      expect([first.status, third.status]).toEqual(['ACTIVE', 'PROBATION']);

      const accounts = await withDb((prisma) =>
        prisma.employeeBankAccount.findMany({ where: { employeeId: second.id } }),
      );
      expect(accounts).toEqual([
        expect.objectContaining({
          bankCode: '002',
          bankName: 'กรุงเทพ',
          accountNoLast4: '7890',
          accountName: 'สมหมาย ตั้งใจ',
        }),
      ]);
      expect(accounts[0].accountNoEnc).not.toContain('1234567890');
    });

    it('records each hire, as the API does', async () => {
      const [first] = await codesLike('IMPX-');
      const events = await api.get(`/employees/${first.id}/employment-events`, managerToken);
      expect(events.body.map((e: { type: string }) => e.type)).toEqual(['HIRE']);
    });

    it('is audited as one event naming the file and the count', async () => {
      const entries = await withDb((prisma) =>
        prisma.auditLog.findMany({
          where: { entityType: 'Employee', summary: { contains: 'จาก Odoo.xlsx' } },
        }),
      );
      expect(entries).toHaveLength(1);
      expect(entries[0].summary).toBe('Imported 3 employee(s) from "จาก Odoo.xlsx"');
      expect(entries[0].changes).toMatchObject({ rows: 3, fileName: 'จาก Odoo.xlsx' });
    });

    it('refuses the same file again, row by row, naming the codes already present', async () => {
      const preview = await upload('/employees/import/preview', workbook(rows), 'again.xlsx');
      expect(
        preview.body.problems.map((p: { row: number; message: string }) => [p.row, p.message]),
      ).toEqual([
        [2, 'Employee code IMPX-1 already exists'],
        [3, 'Employee code IMPX-2 already exists'],
        [4, 'Employee code IMPX-3 already exists'],
      ]);

      const commit = await upload('/employees/import', workbook(rows), 'again.xlsx');
      expect(commit.status).toBe(422);
      expect(await codesLike('IMPX-')).toHaveLength(3);
    });
  });

  describe('scanner IDs', () => {
    it('can be set by hand, and one number never belongs to two people', async () => {
      const [first, second] = await codesLike('IMPCSV-');

      const set = await api.patch(`/employees/${first.id}`, hrToken, { scannerId: '901' });
      expect(set.status).toBe(200);

      const clash = await api.patch(`/employees/${second.id}`, hrToken, { scannerId: '901' });
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe('DUPLICATE_SCANNER_ID');

      const imported = await upload(
        '/employees/import/preview',
        workbook([
          ['employee_code', 'first_name_th', 'last_name_th', 'hire_date', 'scanner_id'],
          ['IMPS-1', 'ก', 'ข', '2024-01-15', '901'],
        ]),
        'scanner.xlsx',
      );
      expect(imported.body.problems[0]).toMatchObject({
        code: 'SCANNER_ID_TAKEN',
        message: 'Scanner ID 901 already belongs to employee IMPCSV-1',
      });
    });
  });

  describe('what is not a table', () => {
    it('asks for .xlsx or CSV instead of an Excel 97 workbook', async () => {
      const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
      const res = await upload('/employees/import/preview', xls, 'old.xls');

      expect(res.status).toBe(200);
      expect(res.body.problems).toEqual([
        expect.objectContaining({ row: 0, code: 'UNSUPPORTED_FORMAT' }),
      ]);
    });

    it('needs a file', async () => {
      const res = await api.post('/employees/import/preview', hrToken, {});
      expect(res.status).toBe(400);
    });

    it('is refused to someone who may not create employees', async () => {
      const res = await upload('/employees/import', workbook([['a']]), 'x.xlsx', employeeToken);
      expect(res.status).toBe(403);
    });
  });
});
