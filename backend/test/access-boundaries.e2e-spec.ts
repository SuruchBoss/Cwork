// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Who sees what, on the endpoints that answer for one person.
 *
 * Each case is a colleague with no part in the matter, asking about someone
 * else: they get their own answer, or "not found", never the other person's.
 * The people who do have a part (the person, their manager, the one asked to
 * decide, HR) still get what they need.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { addDays, isoDate } from './utils/dates';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PERSON = 'dev2@cwork.example';
const COLLEAGUE = 'dev1@cwork.example';
const MANAGER = 'eng.manager@cwork.example';
const HR_ADMIN = 'hr.manager@cwork.example';
const PAYROLL = 'payroll@cwork.example';
const CEO = 'ceo@cwork.example';

interface CalendarRow {
  leaveType: { code: string; name: string };
  employee: { id: string; photoFileId: string | null };
}

describe('Access boundaries (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let person: string;
  let colleague: string;
  let manager: string;
  let hrAdmin: string;
  let payroll: string;
  let ceo: string;
  let personEmployeeId: string;
  let colleagueEmployeeId: string;

  const employeeIdOf = async (email: string) =>
    (
      await prisma.user.findFirstOrThrow({
        where: { email },
        include: { employee: { select: { id: true } } },
      })
    ).employee!.id;

  beforeAll(async () => {
    ctx = await createTestApp({ env: { MALWARE_SCAN_ENABLED: 'false' } });
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    person = await api.token(PERSON);
    colleague = await api.token(COLLEAGUE);
    manager = await api.token(MANAGER);
    hrAdmin = await api.token(HR_ADMIN);
    payroll = await api.token(PAYROLL);
    ceo = await api.token(CEO);
    personEmployeeId = await employeeIdOf(PERSON);
    colleagueEmployeeId = await employeeIdOf(COLLEAGUE);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('tax declaration', () => {
    const year = 2037;

    beforeAll(async () => {
      const filed = await api.post('/payroll/tax-profile', person, {
        employeeId: personEmployeeId,
        taxYear: year,
        spouseAllowance: true,
        childrenCount: 2,
      });
      expect(filed.status).toBeLessThan(300);
    });

    it('is shown to the employee who filed it', async () => {
      const res = await api.get(`/payroll/tax-profile/${personEmployeeId}?year=${year}`, person);

      expect(res.status).toBe(200);
      expect(res.body.childrenCount).toBe(2);
    });

    it("is not shown to a colleague who asks for someone else's", async () => {
      const res = await api.get(`/payroll/tax-profile/${personEmployeeId}?year=${year}`, colleague);

      // They are answered about themselves, and they filed nothing.
      expect(res.body?.employeeId ?? null).not.toBe(personEmployeeId);
      expect(res.body?.childrenCount ?? null).toBeNull();
    });

    it('is shown to payroll, who manage compensation', async () => {
      const res = await api.get(`/payroll/tax-profile/${personEmployeeId}?year=${year}`, payroll);

      expect(res.status).toBe(200);
      expect(res.body.childrenCount).toBe(2);
    });
  });

  describe('the approval trail of a leave request', () => {
    let requestId: string;

    beforeAll(async () => {
      const types = (await api.get('/leave/types', person)).body as Array<{
        id: string;
        code: string;
      }>;
      const sick = types.find((t) => t.code === 'SICK')!;
      const day = isoDate(addDays(new Date(), 3));
      const created = await api.post('/leave/requests', person, {
        leaveTypeId: sick.id,
        startDate: day,
        endDate: day,
        reason: 'ไม่สบาย',
      });
      expect(created.status).toBeLessThan(300);
      requestId = created.body.id;
    });

    const trail = (token: string, id = requestId) =>
      api.get(`/approvals/instances/LEAVE_REQUEST/${id}`, token);

    it('is shown to the person the request is about', async () => {
      expect((await trail(person)).status).toBe(200);
    });

    it('is shown to the manager who was asked to decide', async () => {
      expect((await trail(manager)).status).toBe(200);
    });

    it('is shown to those who manage approvals', async () => {
      expect((await trail(hrAdmin)).status).toBe(200);
    });

    it('is not found by a colleague with no part in it', async () => {
      expect((await trail(colleague)).status).toBe(404);
    });

    it('answers a colleague as it answers a request that does not exist', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      const missing = await trail(colleague, unknown);
      const hidden = await trail(colleague);

      expect(hidden.status).toBe(missing.status);
      expect(Object.keys(hidden.body).sort()).toEqual(Object.keys(missing.body).sort());
    });

    describe('on the leave calendar', () => {
      const window = () => {
        const from = isoDate(addDays(new Date(), 2));
        const to = isoDate(addDays(new Date(), 4));
        return `from=${from}&to=${to}`;
      };
      const entryOf = (rows: CalendarRow[]) =>
        rows.find((r) => r.employee.id === personEmployeeId)!;

      it('tells someone who may read leave what kind of leave it is', async () => {
        const res = await api.get(`/leave/calendar?${window()}`, hrAdmin);

        expect(res.status).toBe(200);
        expect(entryOf(res.body).leaveType.code).toBe('SICK');
      });

      it('says only that the person is away to someone who may not', async () => {
        const res = await api.get(`/leave/calendar?${window()}`, payroll);
        const entry = entryOf(res.body);

        expect(res.status).toBe(200);
        expect(entry).toBeDefined();
        expect(entry.leaveType.code).not.toBe('SICK');
        expect(entry.leaveType.name).toBe('ลา');
        expect(entry.employee.photoFileId).toBeNull();
      });

      it('still shows a person the kind of their own leave', async () => {
        const res = await api.get(`/leave/calendar?${window()}`, person);

        expect(entryOf(res.body).leaveType.code).toBe('SICK');
      });
    });
  });

  describe('approving a payroll run', () => {
    let runId: string;

    beforeAll(async () => {
      const period = await api.post('/payroll/periods', payroll, {
        year: 2038,
        month: 2,
        periodStart: '2038-02-01',
        periodEnd: '2038-02-28',
        payDate: '2038-02-28',
      });
      expect(period.status).toBeLessThan(300);
      const run = await api.post('/payroll/runs', payroll, { periodId: period.body.id });
      expect(run.status).toBeLessThan(300);
      runId = run.body.id;
    });

    it('is refused to the person who calculated it, though someone else created it', async () => {
      const calculated = await api.post(`/payroll/runs/${runId}/calculate`, hrAdmin);
      expect(calculated.body.status).toBe('CALCULATED');

      const approved = await api.post(`/payroll/runs/${runId}/approve`, hrAdmin);

      expect(approved.body.code).toBe('SELF_APPROVAL_NOT_ALLOWED');
    });

    it('is allowed to someone who neither created nor calculated it', async () => {
      const approved = await api.post(`/payroll/runs/${runId}/approve`, ceo);

      expect(approved.body.status).toBe('APPROVED');
    });

    it('records who calculated it', async () => {
      const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
      const hr = await prisma.user.findFirstOrThrow({ where: { email: HR_ADMIN } });

      expect(run.calculatedById).toBe(hr.id);
    });
  });

  it('keeps colleagues apart in the data the tests rely on', () => {
    expect(personEmployeeId).not.toBe(colleagueEmployeeId);
  });
});
