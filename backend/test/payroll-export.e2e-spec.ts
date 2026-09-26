// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Exporting a payroll period (CW-044).
 *
 * The file is a plain CSV; the point of the ticket is the path around it —
 * period selection, reconciliation, permission, download and audit — so that
 * ภ.ง.ด.1 and the rest become formatters over a checked set of figures. This
 * proves that path end to end: an approved, reconciling period downloads; a
 * period with an unapproved run or with totals that do not add up is refused
 * with the reason named; the export is audited; and a caller without the
 * permission gets nothing. The reconciliation arithmetic itself is proven
 * exhaustively in payroll-export.spec.ts.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';
import { isoDate } from './utils/dates';

const PAYROLL = 'payroll@cwork.example'; // PAYROLL_OFFICER: prepares runs and exports, cannot approve
const CEO = 'ceo@cwork.example'; // approves (separation of duties from the preparer)
const EMPLOYEE = 'dev2@cwork.example'; // no payroll permissions

describe('Payroll period export (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let payrollToken: string;
  let ceoToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    payrollToken = await api.token(PAYROLL);
    ceoToken = await api.token(CEO);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  /**
   * A period with one calculated run, optionally approved. The preparer is the
   * payroll officer; approval is the CEO, since a run cannot be approved by
   * whoever prepared it. Each spec uses its own month to avoid collisions.
   */
  async function preparePeriod(
    year: number,
    month: number,
    options: { approve: boolean },
  ): Promise<{ periodId: string; runId: string; periodCode: string }> {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    const period = await api.post('/payroll/periods', payrollToken, {
      year,
      month,
      periodStart: isoDate(start),
      periodEnd: isoDate(end),
      payDate: isoDate(end),
    });
    const run = await api.post('/payroll/runs', payrollToken, { periodId: period.body.id });
    const calc = await api.post(`/payroll/runs/${run.body.id}/calculate`, payrollToken);
    expect(calc.body.status).toBe('CALCULATED');
    if (options.approve) {
      const approved = await api.post(`/payroll/runs/${run.body.id}/approve`, ceoToken);
      expect(approved.body.status).toBe('APPROVED');
    }
    return { periodId: period.body.id, runId: run.body.id, periodCode: period.body.code };
  }

  it('downloads a CSV of the period’s payslip totals when every run is approved', async () => {
    const { periodId } = await preparePeriod(2028, 2, { approve: true });

    const res = await api.getRaw(`/payroll/periods/${periodId}/export`, payrollToken);

    expect(res.status).toBe(200);
    const csv = res.body.toString('utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM, so Excel reads Thai names
    expect(csv).toContain('Employee code');
    expect(csv).toContain('Net pay');
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines.length).toBeGreaterThan(1); // header + at least one payslip
  });

  it('appends an audit entry naming the actor, period, format and row count', async () => {
    const { periodId, periodCode } = await preparePeriod(2028, 5, { approve: true });

    await api.getRaw(`/payroll/periods/${periodId}/export`, payrollToken);

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'EXPORT', entityType: 'PayrollPeriod', entityId: periodId },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    expect(entry?.actorUserId).toBeTruthy();
    const changes = entry?.changes as { format?: string; rowCount?: number; period?: string };
    expect(changes.format).toBe('csv');
    expect(changes.period).toBe(periodCode);
    expect(typeof changes.rowCount).toBe('number');
  });

  it('refuses a period with a run that is not approved, naming the run', async () => {
    const { periodId, runId } = await preparePeriod(2028, 3, { approve: false });
    const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });

    const res = await api.get(`/payroll/periods/${periodId}/export`, payrollToken);

    expect(res.status).toBe(422);
    expect(res.body.message).toContain(run.runNo);
    expect(res.body.message).toMatch(/not APPROVED/);
  });

  it('refuses a period whose payslip totals disagree with the run totals, naming the difference', async () => {
    const { periodId, runId } = await preparePeriod(2028, 4, { approve: true });
    // Corrupt the recorded gross so it no longer matches the sum of the payslips.
    await prisma.payrollRun.update({
      where: { id: runId },
      data: { totalGross: { increment: 999 } },
    });

    const res = await api.get(`/payroll/periods/${periodId}/export`, payrollToken);

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/gross earnings/);
    expect(res.body.message).toMatch(/difference/);
    expect(res.body.message).toContain('999');
  });

  it('gives an employee without the export permission no file', async () => {
    const { periodId } = await preparePeriod(2028, 6, { approve: true });
    const employeeToken = await api.token(EMPLOYEE);

    const res = await api.get(`/payroll/periods/${periodId}/export`, employeeToken);

    expect(res.status).toBe(403);
  });
});
