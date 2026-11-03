// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The payroll register the pilot's HR sends the accountant (CW-099).
 *
 * The register is the month's payslips split into salary, daily wage, overtime
 * and the rest, on one sheet in the order of HR's own form. This proves it
 * against a real, approved period with the cases the form has to carry: a
 * monthly employee with a standing allowance and a standing deduction, and a
 * daily-wage worker with overtime. Every row is checked against its payslip in
 * the database, the total row against the period, and nothing identifying or
 * employer-side is on the register sheet. The other two formats are asked for
 * too, because they must come out as they did. Synthetic data only.
 */
import { strFromU8, unzipSync } from 'fflate';
import { AttendanceStatus, EmployeeStatus, OvertimeStatus, OvertimeType } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { readXlsx } from 'src/core/spreadsheet/xlsx';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example';
const CEO = 'ceo@cwork.example';
const EMPLOYEE = 'dev2@cwork.example'; // no payroll permissions

const YEAR = 2037;
const MONTH = 3;
const NATIONAL_ID = '4444444444444';
const utc = (day: string) => new Date(`${day}T00:00:00Z`);
const date = (day: number) => `${YEAR}-03-${String(day).padStart(2, '0')}`;

describe('Payroll register (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let payrollToken: string;
  let ceoToken: string;
  let periodId: string;
  let periodCode: string;
  let organizationId: string;
  let daily: string;
  let salaried: string;
  let sheet: Array<Array<string | number | null>>;
  let file: Buffer;

  let secondHalfPeriodId: string;

  /** A period of the month: the whole month, or a half of it. */
  async function period(options: {
    half?: 1 | 2;
    month?: number;
  }): Promise<{ id: string; code: string }> {
    const month = options.month ?? MONTH;
    const half = options.half ?? 0;
    const pad = (n: number) => String(n).padStart(2, '0');
    const last = new Date(Date.UTC(YEAR, month, 0)).getUTCDate();
    const start = half === 2 ? 16 : 1;
    const end = half === 1 ? 15 : last;
    const res = await api.post('/payroll/periods', payrollToken, {
      year: YEAR,
      month,
      ...(half ? { payFrequency: 'SEMI_MONTHLY', half } : {}),
      periodStart: `${YEAR}-${pad(month)}-${pad(start)}`,
      periodEnd: `${YEAR}-${pad(month)}-${pad(end)}`,
      payDate: `${YEAR}-${pad(month)}-${pad(end)}`,
    });
    expect(res.status).toBe(201);
    return res.body;
  }

  /** Calculates and approves a period's run; the first half is paid too, as the second half needs. */
  async function settle(id: string, pay: boolean) {
    const run = await api.post('/payroll/runs', payrollToken, { periodId: id });
    expect((await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken)).status).toBe(
      201,
    );
    expect((await api.post(`/payroll/runs/${run.body.id}/approve`, ceoToken)).status).toBe(201);
    if (pay) {
      expect((await api.post(`/payroll/runs/${run.body.id}/pay`, ceoToken)).status).toBe(201);
    }
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    payrollToken = await api.token(PAYROLL);
    ceoToken = await api.token(CEO);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));

    // A national ID the register must never print.
    await prisma.employee.updateMany({
      where: { workEmail: 'dev1@cwork.example' },
      data: { nationalIdEnc: ctx.app.get(CryptoService).encrypt(NATIONAL_ID) },
    });

    // A daily-wage worker: 400 a day for twenty days, and four hours of overtime.
    ({ id: daily } = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: 'REG-2037-1',
        firstNameTh: 'รายวัน',
        lastNameTh: 'ทดสอบ',
        nationalIdEnc: 'ENCRYPTED',
        status: EmployeeStatus.ACTIVE,
        hireDate: utc(`${YEAR}-01-01`),
      },
      select: { id: true },
    }));
    const days = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27];
    await prisma.attendanceRecord.createMany({
      data: days.map((day) => ({
        organizationId,
        employeeId: daily,
        workDate: utc(date(day)),
        status: AttendanceStatus.PRESENT,
      })),
    });
    const pay = await api.post('/payroll/compensation', payrollToken, {
      employeeId: daily,
      effectiveFrom: `${YEAR}-01-01`,
      baseSalary: 0,
      payFrequency: 'SEMI_MONTHLY',
      dailyRate: 400,
    });
    expect(pay.status).toBe(201);
    await prisma.overtimeRequest.create({
      data: {
        organizationId,
        requestNo: 'OT-CW099-1',
        employeeId: daily,
        workDate: utc(date(7)),
        startAt: new Date(`${date(7)}T02:00:00Z`),
        endAt: new Date(`${date(7)}T06:00:00Z`),
        requestedHours: 4,
        approvedHours: 4,
        type: OvertimeType.DAY_OFF,
        rateMultiplier: 1,
        reason: 'ทดสอบ CW-099',
        status: OvertimeStatus.APPROVED,
      },
    });

    // A monthly employee with a standing allowance and a standing deduction.
    ({ id: salaried } = await prisma.employee.findFirstOrThrow({
      where: { workEmail: 'sales1@cwork.example' },
      select: { id: true },
    }));
    const components = (await api.get('/payroll/components', payrollToken)).body as Array<{
      id: string;
      code: string;
      type: string;
    }>;
    const custom = (type: string) =>
      components.find((c) => c.type === type && !['BASE', 'OT', 'SSO', 'WHT'].includes(c.code))!;
    for (const [component, amount] of [
      [custom('EARNING'), 1_000],
      [custom('DEDUCTION'), 500],
    ] as const) {
      const added = await api.post('/payroll/recurring-items', payrollToken, {
        employeeId: salaried,
        componentId: component.id,
        amount,
        effectiveFrom: `${YEAR}-01-01`,
      });
      expect(added.status).toBe(201);
    }

    // The month's three periods: the monthly one, and the two halves.
    const monthly = await period({});
    periodId = monthly.id;
    periodCode = monthly.code;
    const firstHalf = await period({ half: 1 });
    secondHalfPeriodId = (await period({ half: 2 })).id;
    await settle(monthly.id, false);
    await settle(firstHalf.id, true);
    await settle(secondHalfPeriodId, false);

    const res = await api.getRaw(
      `/payroll/periods/${periodId}/export?format=register`,
      payrollToken,
    );
    expect(res.status).toBe(200);
    file = res.body;
    sheet = readXlsx(file).rows;
  });

  afterAll(async () => {
    if (daily) {
      await prisma?.overtimeRequest.deleteMany({ where: { employeeId: daily } });
      await prisma?.employee.update({ where: { id: daily }, data: { deletedAt: new Date() } });
    }
    await ctx?.close();
  });

  const HEADINGS = 4;
  const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));
  const cents = (value: unknown) => Math.round(num(value) * 100);

  const slips = () =>
    prisma.payslip.findMany({
      where: { run: { period: { year: YEAR, month: MONTH } } },
      include: { items: true, employee: true },
    });

  /** The register has one row for a person, however many payslips they had in the month. */
  async function people() {
    const byCode = new Map<string, Awaited<ReturnType<typeof slips>>>();
    for (const slip of await slips()) {
      const code = slip.employee.employeeCode;
      byCode.set(code, [...(byCode.get(code) ?? []), slip]);
    }
    return [...byCode.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))
      .map(([code, own]) => ({ code, employeeId: own[0]!.employeeId, slips: own }));
  }

  const total = (
    slipsOf: Awaited<ReturnType<typeof slips>>,
    pick: (s: (typeof slipsOf)[0]) => unknown,
  ) => slipsOf.reduce((acc, s) => acc + cents(pick(s)), 0);

  it('is an Excel workbook with the title and the columns of the form', async () => {
    expect(file.subarray(0, 2).toString()).toBe('PK');
    expect(sheet[0]![0]).toBe(`ทะเบียนเงินเดือนประจำเดือน มีนาคม ปี ${YEAR + 543}`);
    expect(sheet[3]!.slice(0, 14)).toEqual([
      'ลำดับที่',
      'ชื่อ-สกุล',
      'เงินเดือน',
      'วันละ',
      'จำนวนวันทำงาน',
      'จำนวนเงิน',
      'โอที',
      'อื่นๆ (ระบุ)',
      'รวมเงินได้',
      'ภาษี',
      'ประกันสังคม',
      'อื่นๆ (ระบุ)',
      'รวมหัก',
      'รวมเงินได้สุทธิ',
    ]);
  });

  it('is the same sheet whichever period of the month it is asked from', async () => {
    const res = await api.getRaw(
      `/payroll/periods/${secondHalfPeriodId}/export?format=register`,
      payrollToken,
    );
    expect(res.status).toBe(200);
    expect(readXlsx(res.body).rows).toEqual(sheet);
  });

  it('puts the daily-wage worker on the same sheet: both halves’ days, the rate, the amount and the overtime', async () => {
    const all = await people();
    const person = all.find((p) => p.code === 'REG-2037-1')!;
    const row = sheet[HEADINGS + all.indexOf(person)]!;
    const lines = person.slips.flatMap((s) => s.items);
    const base = lines.filter((i) => i.code === 'BASE');
    const overtime = lines.filter((i) => i.code.startsWith('OT_'));

    expect(person.slips).toHaveLength(2); // one payslip a half
    expect(row[2]).toBeNull(); // no monthly salary
    expect([row[3], row[4], row[5]]).toEqual([400, 20, 8_000]);
    expect(num(row[3]) * num(row[4])).toBe(num(row[5]));
    expect(cents(row[5])).toBe(base.reduce((acc, i) => acc + cents(i.amount), 0));
    expect(overtime).toHaveLength(1);
    expect(cents(row[6])).toBe(cents(overtime[0]!.amount));
  });

  it('shows the monthly employee’s allowance and deduction by name, with totals that still add up', async () => {
    const all = await people();
    const person = all.find((p) => p.employeeId === salaried)!;
    const row = sheet[HEADINGS + all.indexOf(person)]!;
    const lines = person.slips[0]!.items;
    const allowance = lines.find((i) => i.type === 'EARNING' && i.code !== 'BASE')!;
    const deduction = lines.find((i) => i.type === 'DEDUCTION' && cents(i.amount) === 50_000)!;

    expect(person.slips).toHaveLength(1);
    expect(cents(row[2])).toBe(cents(lines.find((i) => i.code === 'BASE')!.amount));
    expect(num(row[7])).toBe(1_000);
    // Every deduction that is not tax or social security, such as the provident fund.
    const others = lines.filter((i) => i.type === 'DEDUCTION' && !['SSO', 'WHT'].includes(i.code));
    expect(cents(row[11])).toBe(others.reduce((acc, i) => acc + cents(i.amount), 0));
    expect(others.length).toBeGreaterThanOrEqual(1);
    expect(String(row[14])).toContain(`${allowance.name} 1,000.00`);
    expect(String(row[14])).toContain(`${deduction.name} 500.00`);
  });

  it('gives each person a row whose gross, deductions and net are their payslips’ own, parts adding up', async () => {
    const all = await people();
    expect(sheet).toHaveLength(HEADINGS + all.length + 1);
    all.forEach((person, index) => {
      const row = sheet[HEADINGS + index]!;
      expect(row[0]).toBe(index + 1);
      expect(cents(row[8])).toBe(total(person.slips, (s) => s.grossEarnings));
      expect(cents(row[9])).toBe(total(person.slips, (s) => s.withholdingTax));
      expect(cents(row[10])).toBe(total(person.slips, (s) => s.ssoEmployee));
      expect(cents(row[12])).toBe(total(person.slips, (s) => s.totalDeductions));
      expect(cents(row[13])).toBe(total(person.slips, (s) => s.netPay));
      const income = [2, 5, 6, 7].reduce((acc, c) => acc + cents(row[c]), 0);
      const taken = [9, 10, 11].reduce((acc, c) => acc + cents(row[c]), 0);
      expect(income).toBe(cents(row[8]));
      expect(taken).toBe(cents(row[12]));
    });
  });

  it('totals the month on the last row, to what its runs recorded', async () => {
    const runs = await prisma.payrollRun.findMany({
      where: { period: { year: YEAR, month: MONTH } },
    });
    const totals = sheet[sheet.length - 1]!;
    const sumRuns = (pick: (r: (typeof runs)[0]) => unknown) =>
      runs.reduce((acc, r) => acc + cents(pick(r)), 0);

    expect(runs).toHaveLength(3);
    expect(totals[1]).toBe('รวม');
    expect(cents(totals[8])).toBe(sumRuns((r) => r.totalGross));
    expect(cents(totals[12])).toBe(sumRuns((r) => r.totalDeduction));
    expect(cents(totals[13])).toBe(sumRuns((r) => r.totalNet));
    expect(cents(totals[10])).toBe(total(await slips(), (s) => s.ssoEmployee));
  });

  it('prints no ID number and no employer share on the register, which is on the summary sheet', async () => {
    const parts = unzipSync(new Uint8Array(file));
    const first = strFromU8(parts['xl/worksheets/sheet1.xml']!);
    const second = strFromU8(parts['xl/worksheets/sheet2.xml']!);
    const employer = total(await slips(), (s) => s.ssoEmployer);

    expect(first).not.toContain(NATIONAL_ID);
    expect(first).not.toMatch(/นายจ้าง/);
    expect(second).toContain('ประกันสังคม (ส่วนนายจ้าง)');
    expect(second).toContain(`<v>${employer / 100}</v>`);
  });

  it('is audited as an export, naming the format and the periods read, with no figures', async () => {
    const entry = await prisma.auditLog.findFirst({
      where: { action: 'EXPORT', entityType: 'PayrollPeriod', entityId: periodId },
      orderBy: { createdAt: 'desc' },
    });
    const changes = entry?.changes as Record<string, unknown>;
    expect(changes.format).toBe('register');
    expect(changes.period).toBe(periodCode);
    expect(changes.periods).toHaveLength(3);
    expect(changes.rowCount).toBe((await slips()).length);
    expect(JSON.stringify(changes)).not.toMatch(/\d{4,}\.\d\d/);
    expect(changes).not.toHaveProperty('missingTaxId');
  });

  it('gives someone without payroll:export no file', async () => {
    const token = await api.token(EMPLOYEE);
    const res = await api.get(`/payroll/periods/${periodId}/export?format=register`, token);
    expect(res.status).toBe(403);
  });

  describe('a month that is not all there', () => {
    it('is refused while a period of the month has no run', async () => {
      const monthly = await period({ month: 4 });
      await settle(monthly.id, false);
      await period({ month: 4, half: 1 }); // made, not yet run

      const res = await api.get(
        `/payroll/periods/${monthly.id}/export?format=register`,
        payrollToken,
      );
      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/has no payroll runs/);
    });

    it('is refused while the second half of the daily wages is missing', async () => {
      const monthly = await period({ month: 5 });
      await settle(monthly.id, false);
      await settle((await period({ month: 5, half: 1 })).id, true);

      const res = await api.get(
        `/payroll/periods/${monthly.id}/export?format=register`,
        payrollToken,
      );
      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/second half of 2037-05 has no period yet/);
    });

    it('is refused while a run is not approved, naming the run, as the other formats are', async () => {
      const monthly = await period({ month: 6 });
      const run = await api.post('/payroll/runs', payrollToken, { periodId: monthly.id });
      await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken);

      const res = await api.get(
        `/payroll/periods/${monthly.id}/export?format=register`,
        payrollToken,
      );
      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/not APPROVED/);
    });
  });

  it('leaves the CSV and the accountant’s file as they were: one period, the same columns', async () => {
    const csv = await api.getRaw(`/payroll/periods/${periodId}/export`, payrollToken);
    const accountant = await api.getRaw(
      `/payroll/periods/${periodId}/export?format=accountant`,
      payrollToken,
    );
    const lines = (body: Buffer) =>
      body
        .toString('utf8')
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');

    expect(lines(csv.body)[0]).toBe(
      'Run,Employee code,Name (TH),Department,Currency,Gross earnings,Deductions,Taxable income,Withholding tax,SSO (employee),SSO (employer),Net pay',
    );
    expect(lines(accountant.body)[0]).toBe(`${lines(csv.body)[0]},Tax ID,Income type`);
    // Only the monthly period's payslips: the daily-wage worker is in the halves.
    expect(lines(csv.body).join('\n')).not.toContain('REG-2037-1');
    expect(csv.body.toString('utf8')).not.toContain(NATIONAL_ID);
  });
});
