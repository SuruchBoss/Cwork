/**
 * Benefits administration in the console (CW-009).
 *
 * The API and models existed but there was no screen, so enrolment was only
 * possible by calling the API directly — yet enrolments feed payroll. This
 * proves the write side and the one acceptance that matters: an enrolment a
 * `benefit:manage` holder makes is picked up by the next payroll calculation.
 * It also proves a plan can be created, edited and deactivated, that a duplicate
 * enrolment is refused, and that a `benefit:read`-only caller cannot mutate.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';
import { isoDate } from './utils/dates';

const HR = 'hr.manager@cwork.example'; // HR_ADMIN — benefit:manage + payroll:run
const ENROLLEE = 'dev1@cwork.example';
const EMPLOYEE = 'dev2@cwork.example'; // benefit:read only, no benefit:manage

const stamp = Date.now().toString(36).toUpperCase().slice(-5);

describe('Benefits administration (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let hrToken: string;
  let employeeToken: string;
  let enrolleeId: string;
  let planId: string;
  let enrollmentId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    hrToken = await api.token(HR);
    employeeToken = await api.token(EMPLOYEE);

    const employee = await prisma.employee.findFirstOrThrow({
      where: { user: { email: ENROLLEE } },
      select: { id: true },
    });
    enrolleeId = employee.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('creates a plan, lists it with no active enrolments, and edits it', async () => {
    const created = await api.post('/benefits/plans', hrToken, {
      code: `HLTH_${stamp}`,
      name: 'ประกันสุขภาพทดสอบ',
      category: 'HEALTH_INSURANCE',
      employeeCostPerPeriod: 500,
      employerCostPerPeriod: 800,
    });
    expect(created.status).toBe(201);
    planId = created.body.id;

    const list = await api.get('/benefits/plans', hrToken);
    const plan = list.body.find((p: { id: string }) => p.id === planId);
    expect(plan).toBeDefined();
    expect(plan.activeEnrollments).toBe(0);

    const edited = await api.patch(`/benefits/plans/${planId}`, hrToken, {
      name: 'ประกันสุขภาพทดสอบ (แก้ไข)',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe('ประกันสุขภาพทดสอบ (แก้ไข)');
  });

  it('enrols an employee and refuses a duplicate enrolment', async () => {
    const enrolled = await api.post('/benefits/enrollments', hrToken, {
      employeeId: enrolleeId,
      planId,
      effectiveFrom: '2027-01-01',
    });
    expect(enrolled.status).toBe(201);
    expect(enrolled.body.status).toBe('ACTIVE');
    enrollmentId = enrolled.body.id;

    const again = await api.post('/benefits/enrollments', hrToken, {
      employeeId: enrolleeId,
      planId,
      effectiveFrom: '2027-01-01',
    });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(again.body)).toMatch(/ALREADY_ENROLLED|Already/i);

    const list = await api.get('/benefits/plans', hrToken);
    const plan = list.body.find((p: { id: string }) => p.id === planId);
    expect(plan.activeEnrollments).toBe(1);
  });

  it('carries the enrolment into the next payroll calculation', async () => {
    const start = new Date(Date.UTC(2027, 1, 1));
    const end = new Date(Date.UTC(2027, 2, 0));
    const period = await api.post('/payroll/periods', hrToken, {
      year: 2027,
      month: 2,
      periodStart: isoDate(start),
      periodEnd: isoDate(end),
      payDate: isoDate(end),
    });
    const run = await api.post('/payroll/runs', hrToken, { periodId: period.body.id });
    const calc = await api.post(`/payroll/runs/${run.body.id}/calculate`, hrToken);
    expect(calc.body.status).toBe('CALCULATED');

    // The enrolment's employee cost must appear as a deduction line on the payslip.
    const payslip = await prisma.payslip.findFirstOrThrow({
      where: { runId: run.body.id, employeeId: enrolleeId },
      include: { items: true },
    });
    const benefitLine = payslip.items.find((item) => item.code === `BEN_HLTH_${stamp}`);
    expect(benefitLine).toBeDefined();
    expect(Number(benefitLine!.amount)).toBe(500);
  });

  it('ends an enrolment, dropping the plan’s active count', async () => {
    const ended = await api.patch(`/benefits/enrollments/${enrollmentId}/end`, hrToken, {
      effectiveTo: '2027-03-31',
    });
    expect(ended.status).toBe(200);
    expect(ended.body.status).toBe('ENDED');

    const list = await api.get('/benefits/plans', hrToken);
    const plan = list.body.find((p: { id: string }) => p.id === planId);
    expect(plan.activeEnrollments).toBe(0);
  });

  it('deactivates a plan so it drops out of the active list', async () => {
    expect((await api.delete(`/benefits/plans/${planId}`, hrToken)).status).toBe(204);
    const list = await api.get('/benefits/plans', hrToken);
    expect(list.body.map((p: { id: string }) => p.id)).not.toContain(planId);
  });

  it('refuses plan and enrolment writes to a benefit:read-only caller', async () => {
    const plan = await api.post('/benefits/plans', employeeToken, {
      code: `NOPE_${stamp}`,
      name: 'ไม่ได้',
      category: 'HEALTH_INSURANCE',
    });
    expect(plan.status).toBe(403);

    const enrol = await api.post('/benefits/enrollments', employeeToken, {
      employeeId: enrolleeId,
      planId,
      effectiveFrom: '2027-01-01',
    });
    expect(enrol.status).toBe(403);
  });
});
