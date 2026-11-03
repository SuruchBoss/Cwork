// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Who decides a record that is about themselves.
 *
 * Someone who may decide a scanner day does not decide their own while another
 * holder of the permission can. Where nobody else could, they may, and it is
 * marked on the decision, in the audit log and on the payslip of the run that
 * pays the day. Every account is made or changed here and put back after.
 */
import { PrismaClient, UserStatus } from '@prisma/client';
import { Permission } from 'src/core/security/permissions';
import { resolveDatabaseUrl } from './utils/database';
import { createTestApp, type Api, type TestContext } from './utils/test-app';
import { giveNumber, takeNumbers } from './utils/scanner-numbers';

const OFFICER = 'hr.officer@cwork.example';
const MANAGER = 'hr.manager@cwork.example';
const PAYROLL = 'payroll@cwork.example';
const SCANNER = '7701';
const FROM = '2025-08-01';
const TO = '2025-08-31';

describe('A record that is about the one deciding it (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaClient;
  let officer: string;
  let manager: string;
  let payroll: string;
  let officerEmployeeId: string;
  let officerUserId: string;
  let runId: string;
  const suspended: Array<{ id: string; status: UserStatus }> = [];

  const exportOf = (days: Array<[number, string]>) => {
    const line = ([d, times]: [number, string]) =>
      [`ทดสอบ ,`, `${SCANNER} ,`, `${String(d).padStart(2, '0')}/08/2025 ,`, `${times} ,`, ''].join(
        '\t',
      );
    const text = days.map(line).join('\r\n') + '\r\n';
    return {
      filename: 'Export.xls',
      contentType: 'application/vnd.ms-excel',
      content: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
    };
  };

  const dayOf = async (token: string, date: string) => {
    const res = await api.get(`/attendance/scanner/days?from=${FROM}&to=${TO}&status=ALL`, token);
    expect(res.status).toBe(200);
    return (res.body.items as Array<Record<string, any>>).find(
      (d) => d.scannerNumber === SCANNER && d.workDate === date,
    )!;
  };

  const decide = (token: string, id: string) =>
    api.post(`/attendance/scanner/days/${id}/decision`, token, { action: 'IGNORE' });

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
    officer = await api.token(OFFICER);
    manager = await api.token(MANAGER);
    payroll = await api.token(PAYROLL);
    const user = await prisma.user.findFirstOrThrow({
      where: { email: OFFICER },
      include: { employee: { select: { id: true } } },
    });
    officerUserId = user.id;
    officerEmployeeId = user.employee!.id;
    await giveNumber(prisma, officerEmployeeId, SCANNER);

    const imported = await api.upload(
      '/attendance/scanner/import',
      officer,
      exportOf([
        [4, '08:10'],
        [5, '08:12'],
      ]),
    );
    expect(imported.status).toBe(201);
  });

  afterAll(async () => {
    for (const { id, status } of suspended) {
      await prisma?.user.update({ where: { id }, data: { status } });
    }
    if (prisma) await takeNumbers(prisma, [officerEmployeeId]);
    await prisma?.$disconnect();
    await ctx?.close();
  });

  describe('while someone else may decide the day', () => {
    it('tells the owner the day is theirs and cannot be decided by them', async () => {
      const mine = await dayOf(officer, '2025-08-04');

      expect(mine.ownDay).toEqual({ canDecide: false });
    });

    it('tells everyone else nothing about it', async () => {
      const seenByManager = await dayOf(manager, '2025-08-04');

      expect(seenByManager.ownDay).toBeNull();
    });

    it('refuses the owner, in Thai, and decides nothing', async () => {
      const mine = await dayOf(officer, '2025-08-04');

      const res = await decide(officer, mine.id);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('OWN_SCANNER_DAY_NEEDS_ANOTHER');
      expect(res.body.message).toContain('ต้องให้ผู้มีสิทธิ์จัดการเวลาทำงานคนอื่นเป็นผู้ตัดสิน');
      expect(await prisma.scannerDayDecision.count({ where: { scannerDayId: mine.id } })).toBe(0);
    });

    it('lets another holder of the permission decide it, unmarked', async () => {
      const mine = await dayOf(manager, '2025-08-04');

      const res = await decide(manager, mine.id);

      expect(res.status).toBe(200);
      const stored = await prisma.scannerDayDecision.findFirstOrThrow({
        where: { scannerDayId: mine.id },
      });
      expect(stored.ownDay).toBe(false);
    });
  });

  describe('where nobody else may decide it', () => {
    afterAll(async () => {
      while (suspended.length > 0) {
        const { id, status } = suspended.pop()!;
        await prisma.user.update({ where: { id }, data: { status } });
      }
    });

    beforeAll(async () => {
      const others = await prisma.user.findMany({
        where: {
          id: { not: officerUserId },
          status: UserStatus.ACTIVE,
          roles: { some: { role: { permissions: { has: Permission.ATTENDANCE_MANAGE } } } },
        },
        select: { id: true, status: true },
      });
      expect(others.length).toBeGreaterThan(0);
      for (const other of others) {
        suspended.push(other);
        await prisma.user.update({
          where: { id: other.id },
          data: { status: UserStatus.SUSPENDED },
        });
      }
    });

    it('lets the owner decide it, and says so on the page', async () => {
      const mine = await dayOf(officer, '2025-08-05');
      expect(mine.ownDay).toEqual({ canDecide: true });

      const res = await decide(officer, mine.id);

      expect(res.status).toBe(200);
      expect(res.body.ownDay).toEqual({ canDecide: true });
    });

    it('marks the decision and the audit entry', async () => {
      const mine = await dayOf(officer, '2025-08-05');
      const stored = await prisma.scannerDayDecision.findFirstOrThrow({
        where: { scannerDayId: mine.id },
        orderBy: { createdAt: 'desc' },
      });
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { entityType: 'ScannerDay', entityId: mine.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(stored.ownDay).toBe(true);
      expect(entry.summary).toContain('own day');
      expect((entry.changes as { ownDay: boolean }).ownDay).toBe(true);
    });

    it('is named on the payslip of the run that pays the day, for the one who approves it', async () => {
      const period = await api.post('/payroll/periods', payroll, {
        year: 2025,
        month: 8,
        periodStart: FROM,
        periodEnd: TO,
        payDate: TO,
      });
      expect(period.status).toBe(201);
      const run = await api.post('/payroll/runs', payroll, { periodId: period.body.id });
      runId = run.body.id;
      expect((await api.post(`/payroll/runs/${run.body.id}/calculate`, payroll)).status).toBe(201);

      const slip = await prisma.payslip.findFirstOrThrow({
        where: { runId: run.body.id, employeeId: officerEmployeeId },
      });
      const warnings = slip.warnings as Array<{ code: string; params: Record<string, unknown> }>;
      const own = warnings.find((w) => w.code === 'OWN_SCANNER_DAY_DECIDED');

      expect(own?.params).toEqual({ days: 1, dates: '2025-08-05' });
    });
  });

  describe('approving a run that pays the approver', () => {
    const auditOf = (id: string) =>
      prisma.auditLog.findMany({
        where: { entityType: 'PayrollRun', entityId: id, action: 'APPROVE' },
        orderBy: { createdAt: 'desc' },
        select: { summary: true, changes: true, actorUserId: true },
      });

    it('is allowed, and written down as approving a run that includes one’s own payslip', async () => {
      const approved = await api.post(`/payroll/runs/${runId}/approve`, manager);

      expect(approved.status).toBe(201);
      const entries = (await auditOf(runId)).filter(
        (e) => (e.changes as { ownPayslip?: boolean } | null)?.ownPayslip === true,
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]!.summary).toContain('own payslip');
    });

    it('writes nothing of the kind when the approver is not among the people the run pays', async () => {
      const ceoToken = await api.token('ceo@cwork.example');
      const ceo = await prisma.user.findFirstOrThrow({
        where: { email: 'ceo@cwork.example' },
        include: { employee: { select: { id: true } } },
      });
      const period = await api.post('/payroll/periods', payroll, {
        year: 2025,
        month: 9,
        periodStart: '2025-09-01',
        periodEnd: '2025-09-30',
        payDate: '2025-09-30',
      });
      const run = await api.post('/payroll/runs', payroll, { periodId: period.body.id });
      expect((await api.post(`/payroll/runs/${run.body.id}/calculate`, payroll)).status).toBe(201);
      await prisma.payslip.deleteMany({
        where: { runId: run.body.id, employeeId: ceo.employee!.id },
      });

      const approved = await api.post(`/payroll/runs/${run.body.id}/approve`, ceoToken);

      expect(approved.status).toBe(201);
      const ownEntries = (await auditOf(run.body.id)).filter(
        (e) => (e.changes as { ownPayslip?: boolean } | null)?.ownPayslip === true,
      );
      expect(ownEntries).toHaveLength(0);
    });
  });
});
