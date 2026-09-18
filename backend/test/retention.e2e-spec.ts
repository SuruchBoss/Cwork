/**
 * Employee data retention and purge (CW-015).
 *
 * Candidate records already expire under PDPA; employee records had no
 * equivalent. This proves the two acceptance criteria: a dry run lists the
 * leavers whose retention has lapsed and changes nothing, and a purge redacts
 * their personal identifiers — leaving the employee row (and the payroll history
 * that points at it) intact — while an employee still inside the window and a
 * caller without the permission are both left untouched.
 */
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.manager@cwork.example'; // HR_ADMIN holds employee:delete
const EMPLOYEE = 'dev2@cwork.example'; // no employee:delete

const stamp = Date.now().toString(36).toUpperCase().slice(-5);

describe('Employee retention and purge (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let hrToken: string;
  let employeeToken: string;
  let organizationId: string;
  let lapsedId: string; // left long ago — eligible
  let recentId: string; // left recently — inside the window

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    hrToken = await api.token(HR);
    employeeToken = await api.token(EMPLOYEE);

    const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
    organizationId = org.id;

    const lapsed = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: `RET-OLD-${stamp}`,
        firstNameTh: 'อดีต',
        lastNameTh: 'พนักงาน',
        firstNameEn: 'Former',
        lastNameEn: 'Staff',
        personalEmail: 'former@example.com',
        phone: '0812345678',
        nationalIdEnc: 'ENCRYPTED',
        nationalIdLast4: '1234',
        status: EmployeeStatus.TERMINATED,
        hireDate: new Date(Date.UTC(2010, 0, 1)),
        lastWorkingDate: new Date(Date.UTC(2015, 0, 1)), // well past any retention window
        bankAccounts: {
          create: {
            bankCode: 'KBANK',
            bankName: 'กสิกรไทย',
            accountNoEnc: 'ENC',
            accountNoLast4: '9999',
            accountName: 'อดีต พนักงาน',
          },
        },
      },
      select: { id: true },
    });
    lapsedId = lapsed.id;

    const recent = await prisma.employee.create({
      data: {
        organizationId,
        employeeCode: `RET-NEW-${stamp}`,
        firstNameTh: 'เพิ่ง',
        lastNameTh: 'ลาออก',
        nationalIdEnc: 'ENCRYPTED',
        status: EmployeeStatus.RESIGNED,
        hireDate: new Date(Date.UTC(2020, 0, 1)),
        lastWorkingDate: new Date(Date.UTC(2026, 5, 1)), // within the retention window
      },
      select: { id: true },
    });
    recentId = recent.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('lists a lapsed leaver in the dry run and changes nothing', async () => {
    const res = await api.get('/employees/retention/preview', hrToken);
    expect(res.status).toBe(200);
    const ids = res.body.map((row: { id: string }) => row.id);
    expect(ids).toContain(lapsedId);
    expect(ids).not.toContain(recentId);

    // The dry run must not touch the record it reports.
    const still = await prisma.employee.findUniqueOrThrow({
      where: { id: lapsedId },
      select: { firstNameTh: true, nationalIdEnc: true, deletedAt: true },
    });
    expect(still.firstNameTh).toBe('อดีต');
    expect(still.nationalIdEnc).toBe('ENCRYPTED');
    expect(still.deletedAt).toBeNull();
  });

  it('refuses the dry run and the purge to a caller without employee:delete', async () => {
    expect((await api.get('/employees/retention/preview', employeeToken)).status).toBe(403);
    expect((await api.post('/employees/retention/purge', employeeToken)).status).toBe(403);
  });

  it('redacts a lapsed leaver but keeps the row, and audits it', async () => {
    const res = await api.post('/employees/retention/purge', hrToken);
    expect(res.status).toBe(201);
    expect(res.body.purged).toBeGreaterThanOrEqual(1);

    // The row survives (payroll history points at it) but the identifiers are gone.
    const redacted = await prisma.employee.findUniqueOrThrow({
      where: { id: lapsedId },
      select: {
        firstNameTh: true,
        firstNameEn: true,
        personalEmail: true,
        phone: true,
        nationalIdEnc: true,
        nationalIdLast4: true,
        deletedAt: true,
      },
    });
    expect(redacted.firstNameTh).toBe('พนักงาน');
    expect(redacted.firstNameEn).toBeNull();
    expect(redacted.personalEmail).toBeNull();
    expect(redacted.phone).toBeNull();
    expect(redacted.nationalIdEnc).toBeNull();
    expect(redacted.nationalIdLast4).toBeNull();
    expect(redacted.deletedAt).not.toBeNull();

    // Bank accounts are pure personal data and are removed outright.
    const banks = await prisma.employeeBankAccount.count({ where: { employeeId: lapsedId } });
    expect(banks).toBe(0);

    // Every purge is in the audit log.
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Employee', entityId: lapsedId, action: 'DELETE' },
    });
    expect(audit).not.toBeNull();
  });

  it('leaves an employee inside the retention window untouched', async () => {
    const recent = await prisma.employee.findUniqueOrThrow({
      where: { id: recentId },
      select: { firstNameTh: true, nationalIdEnc: true, deletedAt: true },
    });
    expect(recent.firstNameTh).toBe('เพิ่ง');
    expect(recent.nationalIdEnc).toBe('ENCRYPTED');
    expect(recent.deletedAt).toBeNull();
  });
});
