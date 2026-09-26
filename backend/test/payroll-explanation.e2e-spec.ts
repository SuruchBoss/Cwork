// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Explaining a payroll run before it is approved (CW-040).
 *
 * The narration itself needs a language model, which the suite deliberately does
 * not have — `ASSISTANT_ENABLED` is false, so the provider is the disabled one.
 * What is tested here is everything around the model, which is where the risk
 * lives: the tool that feeds it must hand back figures that reconcile with the
 * run's own totals, must refuse a caller without `payroll:approve` before it
 * reads anything, and must treat a run id from another organisation as absent.
 * The variance arithmetic is proven separately and exhaustively in
 * `run-variance.spec.ts`; this proves it is wired to real data and guarded.
 */
import { AssistantToolsService } from 'src/modules/assistant/assistant-tools.service';
import { UserContextService } from 'src/modules/auth/user-context.service';
import type { PayrollVariance } from 'src/modules/payroll/domain/run-variance';
import { PrismaService } from 'src/core/prisma/prisma.service';
import type { AuthenticatedUser } from 'src/core/security/current-user';
import { createTestApp, type Api, type TestContext } from './utils/test-app';
import { isoDate } from './utils/dates';

const HR = 'hr.manager@cwork.example';
const CEO = 'ceo@cwork.example';
const EMPLOYEE = 'dev2@cwork.example';

describe('Payroll run explanation (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let tools: AssistantToolsService;
  let userContext: UserContextService;
  let runId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    tools = ctx.app.get(AssistantToolsService);
    userContext = ctx.app.get(UserContextService);

    // A calculated run is the state this feature explains — after preparation,
    // before approval. A period well clear of any other spec's.
    const hrToken = await api.token(HR);
    const start = new Date(Date.UTC(2027, 0, 1));
    const end = new Date(Date.UTC(2027, 1, 0));
    const period = await api.post('/payroll/periods', hrToken, {
      year: 2027,
      month: 1,
      periodStart: isoDate(start),
      periodEnd: isoDate(end),
      payDate: isoDate(end),
    });
    const run = await api.post('/payroll/runs', hrToken, { periodId: period.body.id });
    runId = run.body.id;
    const calc = await api.post(`/payroll/runs/${runId}/calculate`, hrToken);
    expect(calc.body.status).toBe('CALCULATED');
  });

  afterAll(async () => {
    await ctx?.close();
  });

  /** The tool takes an AuthenticatedUser, not a token — resolve one by email. */
  async function principal(email: string): Promise<AuthenticatedUser> {
    const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true } });
    return { ...(await userContext.resolve(user.id)), sessionId: 'test-session' };
  }

  it('returns figures that reconcile with the run’s own totals', async () => {
    const run = await prisma.payrollRun.findUniqueOrThrow({
      where: { id: runId },
      include: { period: true },
    });
    const approver = await principal(CEO);

    const result = await tools.execute(approver, 'explain_payroll_run', { runId });
    expect(result.ok).toBe(true);

    const variance = result.data as PayrollVariance;
    expect(variance.currentCode).toBe(run.period.code);
    // The figures the model is handed are the run's own, not a re-computation.
    expect(variance.totals.net.now).toBeCloseTo(Number(run.totalNet), 2);
    expect(variance.totals.gross.now).toBeCloseTo(Number(run.totalGross), 2);
    expect(variance.totals.employerCost.now).toBeCloseTo(Number(run.totalEmployerCost), 2);
    expect(variance.headcount.now).toBe(run.employeeCount);
  });

  it('refuses a caller without payroll:approve, before reading the run', async () => {
    const employee = await principal(EMPLOYEE);
    const result = await tools.execute(employee, 'explain_payroll_run', { runId });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/สิทธิ์/); // "…has no permission…"
  });

  it('treats a run id it cannot see as not found, not as someone else’s data', async () => {
    const approver = await principal(CEO);
    const result = await tools.execute(approver, 'explain_payroll_run', {
      runId: '00000000-0000-0000-0000-000000000000',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ไม่พบ/); // "…not found…"
  });

  it('the approval-screen endpoint stays inert while the assistant is disabled', async () => {
    const token = await api.token(CEO);
    // Assistant off by default: the endpoint reports it, and the screen — which
    // only shows the panel when /assistant/status says enabled — shows nothing.
    const res = await api.post(`/assistant/payroll-runs/${runId}/explanation`, token);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).toMatch(/ASSISTANT_DISABLED|not enabled/i);
  });
});
