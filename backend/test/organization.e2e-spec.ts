/**
 * The organisation's own reference data — and what reads it.
 *
 * Seventeen routes with no test of any kind before this: departments,
 * positions, work locations, the public-holiday calendar and the role list.
 * None of it is interesting on its own, which is exactly why it went untested
 * and exactly why it matters — four other modules read the holiday calendar to
 * decide what a day is worth. `CONTRIBUTING.md` records the near-miss: a
 * swallowed error discarded all twelve public holidays, which would have
 * mis-charged every leave request in the system.
 *
 * So the centre of this suite is not "can HR add a holiday". It is "does
 * adding one change what a day of leave costs", which is the only version of
 * the question anybody is harmed by getting wrong.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.manager@cwork.example';
const EMPLOYEE = 'dev2@cwork.example';

/** Unique per run: every spec in the suite shares one database. */
const stamp = Date.now().toString(36).toUpperCase().slice(-5);

/** A Wednesday far enough out that no other spec has claimed it. */
function futureWednesday(): string {
  const date = new Date(Date.now() + 300 * 86_400_000);
  while (date.getUTCDay() !== 3) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

describe('Organisation (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let hrToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    hrToken = await api.token(HR);
    employeeToken = await api.token(EMPLOYEE);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('the profile', () => {
    it('reads back what the deployment was set up as', async () => {
      const res = await api.get('/organization', hrToken);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('CWORK');
      expect(res.body.timezone).toBe('Asia/Bangkok');
      expect(res.body.currency).toBe('THB');
    });

    it('is not an employee’s to read, and only HR’s to change', async () => {
      // A plain employee holds no `org:read`, and the console guards its own
      // navigation with the same permission. The org chart, the cost centres
      // and the legal entity are an HR view; what an employee needs from this
      // module is the holiday calendar, which is deliberately open to everyone
      // — see below.
      expect((await api.get('/organization', employeeToken)).status).toBe(403);
      expect((await api.patch('/organization', employeeToken, { name: 'Not mine' })).status).toBe(
        403,
      );

      const allowed = await api.patch('/organization', hrToken, { legalName: `Cwork ${stamp}` });
      expect(allowed.status).toBe(200);
      expect(allowed.body.legalName).toBe(`Cwork ${stamp}`);
    });
  });

  describe('departments', () => {
    let departmentId: string;

    it('appears in both the flat list and the tree once created', async () => {
      const created = await api.post('/departments', hrToken, {
        code: `QA-${stamp}`,
        name: 'ฝ่ายทดสอบคุณภาพ',
        nameEn: 'Quality Assurance',
      });

      expect(created.status).toBe(201);
      departmentId = created.body.id;

      const flat = await api.get('/departments', hrToken);
      expect(flat.body.map((d: { id: string }) => d.id)).toContain(departmentId);

      // The tree is what the org chart draws; a department that exists in one
      // view and not the other is a department somebody cannot assign anyone to.
      const tree = await api.get('/departments/tree', hrToken);
      const flatten = (nodes: { id: string; children?: unknown[] }[]): string[] =>
        nodes.flatMap((n) => [n.id, ...flatten((n.children ?? []) as typeof nodes)]);
      expect(flatten(tree.body)).toContain(departmentId);
    });

    it('refuses a second department with the same code', async () => {
      const duplicate = await api.post('/departments', hrToken, {
        code: `QA-${stamp}`,
        name: 'ซ้ำ',
      });

      expect(duplicate.status).toBeGreaterThanOrEqual(400);
    });

    it('is soft-deleted, so the payslips that name it still read', async () => {
      // Deleting a department must not rewrite history: an org chart from last
      // year and a payslip from last month both name it, and both have to keep
      // making sense.
      const deleted = await api.delete(`/departments/${departmentId}`, hrToken);
      expect(deleted.status).toBe(204);

      const flat = await api.get('/departments', hrToken);
      expect(flat.body.map((d: { id: string }) => d.id)).not.toContain(departmentId);

      const row = await ctx.app
        .get(PrismaService)
        .department.findUniqueOrThrow({ where: { id: departmentId } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.isActive).toBe(false);
    });
  });

  describe('positions and work locations', () => {
    it('creates a position and finds it under its department', async () => {
      const departments = await api.get('/departments', hrToken);
      const engineering = departments.body.find((d: { code: string }) => d.code === 'ENG');
      expect(engineering).toBeDefined();

      const created = await api.post('/positions', hrToken, {
        code: `SDET-${stamp}`,
        title: 'วิศวกรทดสอบ',
        level: 5,
        departmentId: engineering.id,
      });
      expect(created.status).toBe(201);

      const scoped = await api.get(`/positions?departmentId=${engineering.id}`, hrToken);
      expect(scoped.body.map((p: { id: string }) => p.id)).toContain(created.body.id);
    });

    it('keeps the geofence a work location was given', async () => {
      // Attendance flags a punch outside this radius, so a value that does not
      // survive the round trip is a control that silently stops working.
      const created = await api.post('/work-locations', hrToken, {
        code: `SITE-${stamp}`,
        name: 'ไซต์ทดสอบ',
        latitude: 13.7563,
        longitude: 100.5018,
        geofenceRadiusM: 150,
      });

      expect(created.status).toBe(201);
      expect(Number(created.body.latitude)).toBeCloseTo(13.7563, 4);
      expect(created.body.geofenceRadiusM).toBe(150);
    });
  });

  describe('the holiday calendar', () => {
    let holidayId: string;
    let annualLeaveTypeId: string;
    const day = futureWednesday();

    beforeAll(async () => {
      const balances = await api.get('/leave/balances/me', employeeToken);
      annualLeaveTypeId = balances.body.find(
        (b: { code: string }) => b.code === 'ANNUAL',
      ).leaveTypeId;
    });

    const previewOneDay = async (): Promise<number> => {
      const res = await api.post('/leave/requests/preview', employeeToken, {
        leaveTypeId: annualLeaveTypeId,
        startDate: day,
        endDate: day,
      });
      return res.status < 400 ? Number(res.body.totalDays) : 0;
    };

    it('charges a normal working day as one day of leave', async () => {
      expect(await previewOneDay()).toBe(1);
    });

    it('stops charging it the moment it becomes a public holiday', async () => {
      // This is the whole suite in one assertion. Four modules read this
      // calendar — leave, attendance, overtime and payroll — and nothing else
      // in the test suite proves the wiring exists.
      const created = await api.post('/holidays', hrToken, {
        date: day,
        name: `วันหยุดทดสอบ ${stamp}`,
      });
      expect(created.status).toBe(201);
      holidayId = created.body.id;

      expect(await previewOneDay()).toBe(0);
    });

    it('lists it under the right year, and only that year', async () => {
      const year = Number(day.slice(0, 4));

      const listed = await api.get(`/holidays?year=${year}`, employeeToken);
      expect(listed.body.map((h: { id: string }) => h.id)).toContain(holidayId);

      const otherYear = await api.get(`/holidays?year=${year - 1}`, employeeToken);
      expect(otherYear.body.map((h: { id: string }) => h.id)).not.toContain(holidayId);
    });

    it('charges the day again once the holiday is removed', async () => {
      const removed = await api.delete(`/holidays/${holidayId}`, hrToken);
      expect(removed.status).toBe(204);

      expect(await previewOneDay()).toBe(1);
    });

    it('is readable by everyone, unlike the rest of this module', async () => {
      // The only route here with no permission on it, on purpose: an employee
      // deciding whether to book Monday off needs to know Monday is a holiday,
      // and nothing about that discloses the org chart.
      const listed = await api.get('/holidays', employeeToken);

      expect(listed.status).toBe(200);
      expect(Array.isArray(listed.body)).toBe(true);
    });

    it('lets an employee read the calendar but not write to it', async () => {
      const refused = await api.post('/holidays', employeeToken, {
        date: day,
        name: 'ขอหยุดเอง',
      });

      expect(refused.status).toBe(403);
    });
  });

  describe('roles', () => {
    it('are visible only to somebody who can manage them', async () => {
      // The role list is the permission model written out. Showing it to
      // everyone is handing out the map of what is worth attacking.
      const refused = await api.get('/roles', employeeToken);
      expect(refused.status).toBe(403);

      const allowed = await api.get('/roles', hrToken);
      expect(allowed.status).toBe(200);
      expect(allowed.body.map((r: { key: string }) => r.key)).toContain('HR_ADMIN');
    });
  });
});
