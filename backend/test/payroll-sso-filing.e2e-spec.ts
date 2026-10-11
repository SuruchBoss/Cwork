// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The monthly social security filing, สปส.1-10 (CW-048).
 *
 * Four daily-wage employees are paid November 2037 in two halves, with nothing
 * mocked. The figures are worked by hand in the comments from the rules the
 * form states (clamp to the floor and the ceiling, round each person's
 * contribution to a whole baht, the employer's share the same), none from the
 * pilot's own file, which has not arrived. No other spec touches 2037.
 */
import { AttendanceStatus, EmployeeStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { taxRulesFor } from 'src/modules/payroll/domain/thai-tax';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example'; // prepares runs, may export
const CEO = 'ceo@cwork.example'; // approves and pays
const NO_PAY_ACCESS = 'dev2@cwork.example'; // an ordinary employee
const YEAR = 2037;
const MONTH = 11;

const date = (day: number) => `${YEAR}-11-${String(day).padStart(2, '0')}`;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

// November 2037 starts on a Sunday: ten working days in the first half and
// eleven in the second.
const FIRST_HALF = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13];
const SECOND_HALF = [16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 30];

describe('Monthly social security filing (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let payrollToken: string;
  let ceoToken: string;
  let organizationId: string;
  const ids: Record<string, string> = {};
  let h1Period: string;
  let h2Period: string;
  let h1Run: string;
  let h2Run: string;

  async function newWorker(
    code: string,
    dailyRate: number,
    identity: {
      absent?: boolean;
      nationalId?: string | null;
      socialSecurityNo?: string;
      passportNo?: string;
      name?: [string, string];
    },
  ) {
    const [first, last] = identity.name ?? ['สมชาย', code];
    const { id } = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: code,
        firstNameTh: first,
        lastNameTh: last,
        nationalIdEnc: crypto.encrypt(identity.nationalId ?? null),
        socialSecurityNoEnc: crypto.encrypt(identity.socialSecurityNo ?? null),
        passportNoEnc: crypto.encrypt(identity.passportNo ?? null),
        status: EmployeeStatus.ACTIVE,
        hireDate: utc(`${YEAR}-01-01`),
      },
      select: { id: true },
    });
    await prisma.attendanceRecord.createMany({
      data: (identity.absent ? [] : [...FIRST_HALF, ...SECOND_HALF]).map((day) => ({
        organizationId,
        employeeId: id,
        workDate: utc(date(day)),
        status: AttendanceStatus.PRESENT,
      })),
    });
    const pay = await api.post('/payroll/compensation', payrollToken, {
      employeeId: id,
      effectiveFrom: `${YEAR}-01-01`,
      baseSalary: 0,
      payFrequency: 'SEMI_MONTHLY',
      dailyRate,
    });
    expect(pay.status).toBe(201);
    ids[code] = id;
  }

  async function newPeriod(half: 1 | 2) {
    const res = await api.post('/payroll/periods', payrollToken, {
      year: YEAR,
      month: MONTH,
      payFrequency: 'SEMI_MONTHLY',
      half,
      periodStart: half === 1 ? date(1) : date(16),
      periodEnd: half === 1 ? date(15) : date(30),
      payDate: half === 1 ? date(16) : date(30),
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; code: string };
  }

  async function calculate(periodId: string) {
    const run = await api.post('/payroll/runs', payrollToken, { periodId });
    expect(run.status).toBe(201);
    const calc = await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken);
    expect(calc.status).toBe(201);
    return run.body.id as string;
  }

  const filing = (token: string, format = 'json') =>
    api.get(`/payroll/reports/sso-filing?year=${YEAR}&month=${MONTH}&format=${format}`, token);

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    crypto = ctx.app.get(CryptoService, { strict: false });
    payrollToken = await api.token(PAYROLL);
    ceoToken = await api.token(CEO);
    ({ id: organizationId } = await prisma.organization.findFirstOrThrow({ select: { id: true } }));

    // 21 days a month. 800 → 16,800: 5% is 840. 450 → 9,450: 472.50, up to 473.
    // 1,200 → 25,200: over the ceiling for 2037 (23,000). 70 → 1,470: under the floor,
    // worked on it.
    await newWorker('SSO-2037-A', 800, { nationalId: '1101700230673' });
    await newWorker('SSO-2037-B', 450, {
      socialSecurityNo: '12-3456-789-0',
      passportNo: 'MB123456',
      name: ['Nguyen', 'Van An'],
    });
    await newWorker('SSO-2037-C', 1_200, { nationalId: null }); // no national ID yet
    await newWorker('SSO-2037-D', 70, { nationalId: '3100600123456' });
    // E was insured but never came in, so was paid nothing: still on the form (note 6).
    await newWorker('SSO-2037-E', 500, { nationalId: '3100800123456', absent: true });

    h1Period = (await newPeriod(1)).id;
    const second = await newPeriod(2);
    h2Period = second.id;
  });

  afterAll(async () => {
    // Out of the employee lists other specs count; the payslips keep them.
    await prisma?.employee.updateMany({
      where: { id: { in: Object.values(ids) } },
      data: { deletedAt: new Date() },
    });
    await ctx?.close();
  });

  it('refuses a month with no payroll period at all', async () => {
    const res = await api.get('/payroll/reports/sso-filing?year=2038&month=3', payrollToken);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_PAYROLL_FOR_MONTH');
  });

  it('refuses a month that is not finished, naming what is missing', async () => {
    h1Run = await calculate(h1Period);
    // Calculated, not approved: neither half has a settled run.
    let res = await filing(payrollToken);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SSO_MONTH_NOT_FINISHED');
    expect(res.body.message).toContain(`${YEAR}-11-H1`);
    expect(res.body.message).toContain(`${YEAR}-11-H2`);

    expect((await api.post(`/payroll/runs/${h1Run}/approve`, ceoToken)).status).toBe(201);
    expect((await api.post(`/payroll/runs/${h1Run}/pay`, ceoToken)).status).toBe(201);
    h2Run = await calculate(h2Period);
    res = await filing(payrollToken);
    expect(res.status).toBe(422);
    expect(res.body.message).toContain(`${YEAR}-11-H2`);
    expect(res.body.message).not.toContain(`${YEAR}-11-H1`);
    expect((await api.post(`/payroll/runs/${h2Run}/approve`, ceoToken)).status).toBe(201);

    // A settled run is not worked out again, whatever the rules now say (CW-084).
    const again = await api.post(`/payroll/runs/${h1Run}/calculate`, payrollToken);
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('PAYROLL_RUN_LOCKED');
  });

  it('works each person out from the month, as the form says, and names whoever has no number', async () => {
    const res = await filing(payrollToken);
    expect(res.status).toBe(200);
    const rules = taxRulesFor(YEAR);
    expect(rules.socialSecurity.maxMonthlyWage).toBeGreaterThanOrEqual(17_500);
    const byCode = Object.fromEntries(
      (res.body.rows as Array<Record<string, string>>).map((row) => [row.employeeCode, row]),
    );

    // A: Thai, under the national ID. D: under the floor, worked on 1,650.
    expect(byCode['SSO-2037-A']).toMatchObject({
      identifierKind: 'NATIONAL_ID',
      identifier: '1101700230673',
      wage: '16800.00',
      employee: '840.00',
      employer: '840.00',
    });
    expect(byCode['SSO-2037-D']).toMatchObject({
      wage: '1470.00',
      contributoryWage: '1650.00',
      employee: '83.00', // 82.50 up
    });
    // B: a foreign worker, under the card number, not the passport.
    expect(byCode['SSO-2037-B']).toMatchObject({
      identifierKind: 'SOCIAL_SECURITY_CARD',
      identifier: '1234567890',
      name: 'Nguyen Van An',
      employee: '473.00', // 472.50 up
    });
    // C has no national ID: named, not listed blank, and not in the totals.
    expect(byCode['SSO-2037-C']).toBeUndefined();
    expect(res.body.problems).toEqual([
      expect.objectContaining({ employeeCode: 'SSO-2037-C', code: 'NO_NATIONAL_ID' }),
    ]);
    expect(res.body.totals).toMatchObject({
      insured: 4,
      wage: '27720.00',
      employee: '1396.00',
      employer: '1396.00',
      total: '2792.00',
    });
    // The payslips withheld the same, half by half (CW-084), so nothing differs.
    expect(
      res.body.rows.map((row: { differsFromPayslips: boolean }) => row.differsFromPayslips),
    ).toEqual([false, false, false, false]);
    expect(res.body.totals).toMatchObject({
      deductedEmployee: '1396.00',
      deductedEmployer: '1396.00',
    });
    // E was paid nothing: on the form with nil, not left off (note 6).
    expect(byCode['SSO-2037-E']).toMatchObject({
      wage: '0.00',
      contributoryWage: '0.00',
      employee: '0.00',
    });
  });

  it('will not export a file while anyone cannot be put on the form', async () => {
    for (const format of ['csv', 'xlsx', 'pdf']) {
      const res = await filing(payrollToken, format);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('SSO_FILING_HAS_PROBLEMS');
      expect(res.body.message).toContain('SSO-2037-C');
    }
  });

  describe('once everyone has a number', () => {
    beforeAll(async () => {
      await prisma.employee.update({
        where: { id: ids['SSO-2037-C'] },
        data: { nationalIdEnc: crypto.encrypt('3100700123456') },
      });
    });

    it('exports the month as a CSV with the form’s columns, the rows and the totals', async () => {
      const res = await api.getRaw(
        `/payroll/reports/sso-filing?year=${YEAR}&month=${MONTH}&format=csv`,
        payrollToken,
      );
      expect(res.status).toBe(200);
      const text = res.body.toString('utf8');
      expect(text.charCodeAt(0)).toBe(0xfeff); // so Excel reads Thai names
      const lines = text
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(lines[0]).toContain('เลขประจำตัวประชาชน');
      expect(lines[0]).toContain('เงินสมทบผู้ประกันตน');
      // 5 people, a header and the two totals rows.
      expect(lines).toHaveLength(1 + 5 + 2);
      expect(lines.some((l) => l.startsWith('1,1101700230673,'))).toBe(true);
      expect(lines.some((l) => l.includes('1234567890') && l.includes('Nguyen Van An'))).toBe(true);
      // 840 + 473 + 1,150 + 83, each side, and the two sides together.
      const totals = lines[lines.length - 2]!.split(',');
      expect(totals[4]).toBe('2546.00');
      expect(totals[5]).toBe('2546.00');
      expect(lines[lines.length - 1]).toContain('5092.00');
    });

    it('exports the same month as a workbook', async () => {
      const res = await api.getRaw(
        `/payroll/reports/sso-filing?year=${YEAR}&month=${MONTH}&format=xlsx`,
        payrollToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 2).toString()).toBe('PK'); // a zip, as a workbook is
    });

    it('exports the form as a PDF, part 1 and part 2', async () => {
      const res = await api.getRaw(
        `/payroll/reports/sso-filing?year=${YEAR}&month=${MONTH}&format=pdf`,
        payrollToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(res.body.toString('latin1')).toContain('Sarabun');
    });

    it('caps a wage over the ceiling at the ceiling for the year', async () => {
      const res = await filing(payrollToken);
      const c = (res.body.rows as Array<Record<string, string>>).find(
        (row) => row.employeeCode === 'SSO-2037-C',
      )!;
      const { maxMonthlyWage, rate } = taxRulesFor(YEAR).socialSecurity;
      expect(c).toMatchObject({ wage: '25200.00' });
      expect(25_200).toBeGreaterThan(maxMonthlyWage);
      expect(Number(c.contributoryWage)).toBe(maxMonthlyWage);
      expect(Number(c.employee)).toBe(Math.round(maxMonthlyWage * rate));
    });

    it('is for people who can export payroll: an ordinary employee gets nothing', async () => {
      const employee = await api.token(NO_PAY_ACCESS);
      expect((await filing(employee)).status).toBe(403);
      expect((await filing(employee, 'csv')).status).toBe(403);
    });

    it('audits every read and every file, without the ID numbers', async () => {
      const entries = await prisma.auditLog.findMany({
        where: { action: 'EXPORT', entityType: 'SsoFiling' },
        orderBy: { createdAt: 'asc' },
      });
      const hows = entries.map((e) => (e.changes as { how: string }).how);
      expect(hows).toEqual(expect.arrayContaining(['read', 'csv', 'xlsx', 'pdf']));
      expect(entries.every((e) => e.actorUserId)).toBe(true);
      expect(JSON.stringify(entries.map((e) => e.changes))).not.toContain('1101700230673');
    });
  });
});
