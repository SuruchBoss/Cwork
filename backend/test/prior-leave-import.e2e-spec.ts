// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Leave taken this year before the company moved to Cwork (CW-059).
 *
 * The acceptance is one sentence: after the import, a balance is the
 * entitlement minus the days taken. What makes that true in practice is that
 * every place a balance is read agrees: HR's view, the employee's own, and the
 * check a new request is held to. And the import must be safe to run twice,
 * because HR will run it twice.
 */
import { PrismaClient } from '@prisma/client';
import { readXlsx, writeXlsx } from 'src/core/spreadsheet/xlsx';
import { resolveDatabaseUrl } from './utils/database';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR_ADMIN = 'hr.manager@cwork.example';
const HR_OFFICER = 'hr.officer@cwork.example';
const EMPLOYEE = 'dev2@cwork.example';
const EMPLOYEE_CODE = 'EMP-0007';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function workbook(rows: string[][]): Buffer {
  return Buffer.from(writeXlsx([{ name: 'วันลา', header: true, rows }]));
}

/** Thai as Thai Excel's plain CSV writes it: Windows-874. */
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

interface Balance {
  code: string;
  used: number;
  usedBeforeCwork: number;
  available: number;
}

describe('Leave taken before Cwork (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let hrToken: string;
  let officerToken: string;
  let employeeToken: string;
  let employeeId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    hrToken = await api.token(HR_ADMIN);
    officerToken = await api.token(HR_OFFICER);
    employeeToken = await api.token(EMPLOYEE);
    employeeId = (await api.get('/employees/me', employeeToken)).body.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const upload = (path: string, content: Buffer, filename = 'วันลา.xlsx', token = hrToken) =>
    api.upload(path, token, {
      filename,
      contentType: filename.endsWith('.csv') ? 'text/csv' : XLSX,
      content,
    });

  const balance = async (code: string, token = hrToken, path = `/leave/balances/${employeeId}`) => {
    const res = await api.get<Balance[]>(path, token);
    return res.body.find((b) => b.code === code)!;
  };

  it('offers a template with every current employee and every leave type already in it', async () => {
    const res = await api.getRaw('/leave/balances/import/template', hrToken);

    expect(res.status).toBe(200);
    const [header, ...rows] = readXlsx(res.body).rows;
    expect(header.slice(0, 3)).toEqual(['รหัสพนักงาน', 'ชื่อ', 'ลาพักร้อน']);
    expect(rows.map((r) => r[0])).toContain(EMPLOYEE_CODE);
    expect(rows.find((r) => r[0] === EMPLOYEE_CODE)?.[1]).toBe('อนุชา แก้วมณี');
  });

  describe('importing days taken', () => {
    let before: Balance;
    const file = () =>
      workbook([
        ['รหัสพนักงาน', 'ลาพักร้อน'],
        [EMPLOYEE_CODE, '2'],
      ]);

    beforeAll(async () => {
      before = await balance('ANNUAL');
    });

    it('previews the balance each person is left with, and writes nothing', async () => {
      const res = await upload('/leave/balances/import/preview', file());

      expect(res.status).toBe(200);
      expect(res.body.problems).toEqual([]);
      expect(res.body.rows).toEqual([
        expect.objectContaining({
          row: 2,
          employeeCode: EMPLOYEE_CODE,
          taken: [expect.objectContaining({ days: 2, availableAfter: before.available - 2 })],
        }),
      ]);
      expect((await balance('ANNUAL')).available).toBe(before.available);
    });

    it('leaves the balance at the entitlement minus the days taken', async () => {
      const res = await upload('/leave/balances/import', file());

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ employees: 1, year: expect.any(Number) });
      expect(await balance('ANNUAL')).toMatchObject({
        available: before.available - 2,
        used: before.used + 2,
        usedBeforeCwork: 2,
      });
    });

    it('shows the employee the same balance HR sees', async () => {
      const own = await balance('ANNUAL', employeeToken, '/leave/balances/me');
      expect(own.available).toBe(before.available - 2);
    });

    it('changes nothing when the same file is imported again', async () => {
      const again = await upload('/leave/balances/import', file());

      expect(again.status).toBe(201);
      expect((await balance('ANNUAL')).available).toBe(before.available - 2);
    });

    it('takes a corrected figure in place of the old one, and 0 to clear it', async () => {
      await upload(
        '/leave/balances/import',
        workbook([
          ['รหัสพนักงาน', 'ANNUAL'],
          [EMPLOYEE_CODE, '0.5'],
        ]),
      );
      expect((await balance('ANNUAL')).available).toBe(before.available - 0.5);

      await upload(
        '/leave/balances/import',
        workbook([
          ['รหัสพนักงาน', 'ANNUAL'],
          [EMPLOYEE_CODE, '0'],
        ]),
      );
      expect(await balance('ANNUAL')).toMatchObject({
        available: before.available,
        usedBeforeCwork: 0,
      });
    });

    it('refuses more than the person is entitled to, and writes nothing', async () => {
      const tooMany = String(before.available + 1);
      const res = await upload(
        '/leave/balances/import',
        workbook([
          ['รหัสพนักงาน', 'ลาพักร้อน'],
          [EMPLOYEE_CODE, tooMany],
        ]),
      );

      expect(res.status).toBe(422);
      expect(res.body.details.problems).toEqual([
        expect.objectContaining({ row: 2, column: 'B', code: 'OVER_ENTITLEMENT' }),
      ]);
      expect((await balance('ANNUAL')).available).toBe(before.available);
    });

    it("reads Thai Excel's default CSV", async () => {
      const csv = windows874(`รหัสพนักงาน,ชื่อ,ลาพักร้อน\r\n${EMPLOYEE_CODE},อนุชา แก้วมณี,1\r\n`);
      const res = await upload('/leave/balances/import', csv, 'วันลา.csv');

      expect(res.status).toBe(201);
      expect((await balance('ANNUAL')).available).toBe(before.available - 1);
    });

    it('is audited as one event naming the file', async () => {
      const prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
      try {
        const entries = await prisma.auditLog.findMany({
          where: { entityType: 'LeaveEntitlement', summary: { contains: 'วันลา.csv' } },
        });
        expect(entries).toHaveLength(1);
        expect(entries[0].summary).toMatch(
          /^Imported leave taken before Cwork in \d{4} for 1 employee\(s\) from "วันลา.csv"$/,
        );
      } finally {
        await prisma.$disconnect();
      }
    });
  });

  it('is only for someone who may adjust balances', async () => {
    const file = workbook([
      ['รหัสพนักงาน', 'ลาพักร้อน'],
      [EMPLOYEE_CODE, '1'],
    ]);
    for (const token of [officerToken, employeeToken]) {
      const res = await upload('/leave/balances/import/preview', file, 'x.xlsx', token);
      expect(res.status).toBe(403);
    }
  });
});
