// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Adding one employee from the console (CW-065).
 *
 * The form posts to the same route and the same validation the spreadsheet
 * import goes through. What this checks is what the form adds on top: the bank
 * account arrives with the person and is stored encrypted like any identifier,
 * and a probation that ends before the hire date is refused as the import
 * refuses it.
 */
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './utils/database';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR_OFFICER = 'hr.officer@cwork.example';
const EMPLOYEE = 'dev2@cwork.example';

describe('Adding one employee (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaClient;
  let hr: string;
  let employee: string;
  const made: string[] = [];

  const person = (extra: Record<string, unknown> = {}) => ({
    firstNameTh: 'เพิ่มทีละคน',
    lastNameTh: 'ทดสอบ',
    hireDate: '2026-10-01',
    ...extra,
  });

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
    hr = await api.token(HR_OFFICER);
    employee = await api.token(EMPLOYEE);
  });

  afterAll(async () => {
    if (made.length > 0) {
      await prisma.employeeBankAccount.deleteMany({ where: { employeeId: { in: made } } });
      await prisma.employmentEvent.deleteMany({ where: { employeeId: { in: made } } });
      await prisma.employee.deleteMany({ where: { id: { in: made } } });
    }
    await prisma?.$disconnect();
    await ctx?.close();
  });

  it('is for people who may create employees, and nobody else', async () => {
    const res = await api.post('/employees', employee, person());
    expect(res.status).toBe(403);
  });

  it('adds a person with a bank account, stored encrypted, with only the last four showing', async () => {
    const res = await api.post(
      '/employees',
      hr,
      person({
        nationalId: '1101700230673',
        bankAccount: {
          bankCode: '014',
          bankName: 'ธนาคารไทยพาณิชย์',
          accountNo: '123-456-7890',
          accountName: 'เพิ่มทีละคน ทดสอบ',
        },
      }),
    );
    expect(res.status).toBe(201);
    made.push(res.body.id);
    expect(JSON.stringify(res.body)).not.toContain('1234567890');

    const account = await prisma.employeeBankAccount.findFirstOrThrow({
      where: { employeeId: res.body.id },
    });
    expect(account).toMatchObject({
      bankCode: '014',
      bankName: 'ธนาคารไทยพาณิชย์',
      accountNoLast4: '7890',
      accountName: 'เพิ่มทีละคน ทดสอบ',
    });
    // Dashes are dropped before it is kept, and what is kept is not the number.
    expect(account.accountNoEnc).not.toContain('1234567890');
    expect(account.accountNoEnc).not.toContain('123-456-7890');
  });

  it('adds a person with no bank account, as before', async () => {
    const res = await api.post('/employees', hr, person({ lastNameTh: 'ไม่มีบัญชี' }));
    expect(res.status).toBe(201);
    made.push(res.body.id);
    expect(await prisma.employeeBankAccount.count({ where: { employeeId: res.body.id } })).toBe(0);
  });

  it('refuses a bank account that is not whole or not a bank account, and creates nobody', async () => {
    const before = await prisma.employee.count();
    for (const bankAccount of [
      { bankCode: '14', bankName: 'ธนาคาร', accountNo: '1234567890', accountName: 'ก' },
      { bankCode: '014', bankName: 'ธนาคาร', accountNo: '12345', accountName: 'ก' },
      { bankCode: '014', bankName: 'ธนาคาร', accountNo: '1234567890' },
    ]) {
      const res = await api.post('/employees', hr, person({ bankAccount }));
      expect(res.status).toBe(400);
    }
    expect(await prisma.employee.count()).toBe(before);
  });

  it('refuses a probation that ends before the hire date', async () => {
    const before = await prisma.employee.count();
    const res = await api.post(
      '/employees',
      hr,
      person({ hireDate: '2026-10-01', probationEndDate: '2026-09-30' }),
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PROBATION_BEFORE_HIRE');
    expect(await prisma.employee.count()).toBe(before);

    const same = await api.post(
      '/employees',
      hr,
      person({ lastNameTh: 'วันเดียวกัน', hireDate: '2026-10-01', probationEndDate: '2026-10-01' }),
    );
    expect(same.status).toBe(201);
    made.push(same.body.id);
  });

  it('refuses an employee code that is taken, and a scanner number that is', async () => {
    const first = await api.post(
      '/employees',
      hr,
      person({ lastNameTh: 'รหัสซ้ำ', employeeCode: 'NEW-065-A', scannerId: '0650' }),
    );
    expect(first.status).toBe(201);
    made.push(first.body.id);

    const code = await api.post('/employees', hr, person({ employeeCode: 'NEW-065-A' }));
    expect(code.status).toBe(409);
    expect(code.body.code).toBe('DUPLICATE_EMPLOYEE_CODE');

    const scanner = await api.post('/employees', hr, person({ scannerId: '0650' }));
    expect(scanner.status).toBe(409);
    expect(scanner.body.code).toBe('DUPLICATE_SCANNER_ID');
  });
});
