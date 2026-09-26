// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Explaining a team's flagged attendance punches to a manager (CW-039).
 *
 * As with the payroll explanation, the narration needs a language model the
 * suite deliberately does not have — `ASSISTANT_ENABLED` is false. What is
 * tested here is the tool that feeds the model, which is where the risk lives:
 * it must group the caller's *own team's* flagged punches and no one else's, it
 * must refuse a caller who can only see their own attendance before it reads
 * anything, and the endpoint must stay inert while the assistant is disabled.
 * The grouping arithmetic is proven separately in `flag-summary.spec.ts`; this
 * proves it is wired to real punches and correctly scoped.
 */
import { PunchMethod, PunchType } from '@prisma/client';
import { AssistantToolsService } from 'src/modules/assistant/assistant-tools.service';
import type { AttendanceFlagSummary } from 'src/modules/attendance/domain/flag-summary';
import { UserContextService } from 'src/modules/auth/user-context.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import type { AuthenticatedUser } from 'src/core/security/current-user';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const MANAGER = 'eng.manager@cwork.example'; // EMP-0005, sees their own team
const IN_TEAM = 'dev1@cwork.example'; // EMP-0006, reports to the manager
const OUT_OF_TEAM = 'sales1@cwork.example'; // EMP-0008, reports to the CEO
const EMPLOYEE = 'dev2@cwork.example'; // EMP-0007, attendance:read:self only

// A window well clear of any other spec's, so only this spec's punches fall in it.
const FROM = '2027-03-01';
const TO = '2027-03-31';
const WORK_DATE = new Date(Date.UTC(2027, 2, 10));

describe('Attendance flag explanation (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let tools: AssistantToolsService;
  let userContext: UserContextService;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    tools = ctx.app.get(AssistantToolsService);
    userContext = ctx.app.get(UserContextService);

    const inTeam = await employee(IN_TEAM);
    const outOfTeam = await employee(OUT_OF_TEAM);

    // The manager's own report: three punches a median 45 m outside a fence and
    // one weak-GPS punch — the shape of a geofence drawn too tight, not a cheat.
    await punch(inTeam, ['OUTSIDE_GEOFENCE'], { distanceM: 40, isOutsideGeofence: true });
    await punch(inTeam, ['OUTSIDE_GEOFENCE'], { distanceM: 50, isOutsideGeofence: true });
    await punch(inTeam, ['OUTSIDE_GEOFENCE'], { distanceM: 45, isOutsideGeofence: true });
    await punch(inTeam, ['LOW_GPS_ACCURACY'], { accuracyM: 90 });
    // Another team's employee, 8 km out on the same days — must never leak in.
    await punch(outOfTeam, ['OUTSIDE_GEOFENCE'], { distanceM: 8000, isOutsideGeofence: true });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  /** The employee id + organisation for a seeded account, by email. */
  async function employee(email: string): Promise<{ id: string; organizationId: string }> {
    return prisma.employee.findFirstOrThrow({
      where: { user: { email } },
      select: { id: true, organizationId: true },
    });
  }

  async function punch(
    who: { id: string; organizationId: string },
    anomalyFlags: string[],
    geo: { distanceM?: number; accuracyM?: number; isOutsideGeofence?: boolean } = {},
  ): Promise<void> {
    await prisma.attendancePunch.create({
      data: {
        organizationId: who.organizationId,
        employeeId: who.id,
        type: PunchType.CLOCK_IN,
        method: PunchMethod.MOBILE_GPS,
        punchedAt: new Date(Date.UTC(2027, 2, 10, 1, 0, 0)),
        workDate: WORK_DATE,
        anomalyFlags,
        distanceM: geo.distanceM ?? null,
        accuracyM: geo.accuracyM ?? null,
        isOutsideGeofence: geo.isOutsideGeofence ?? false,
      },
    });
  }

  /** The tool takes an AuthenticatedUser, not a token — resolve one by email. */
  async function principal(email: string): Promise<AuthenticatedUser> {
    const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true } });
    return { ...(await userContext.resolve(user.id)), sessionId: 'test-session' };
  }

  it('groups the manager’s own team’s flagged punches, and only theirs', async () => {
    const manager = await principal(MANAGER);
    const result = await tools.execute(manager, 'explain_attendance_flags', { from: FROM, to: TO });
    expect(result.ok).toBe(true);

    const summary = result.data as AttendanceFlagSummary;
    // Four punches from one employee (dev1); the out-of-team 8 km punch excluded.
    expect(summary.totalFlaggedPunches).toBe(4);
    expect(summary.totalEmployees).toBe(1);

    const outside = summary.groups.find((g) => g.flag === 'OUTSIDE_GEOFENCE')!;
    expect(outside.punchCount).toBe(3);
    expect(outside.employeeCount).toBe(1);
    expect(outside.distanceM).toEqual({ min: 40, median: 45, max: 50 });

    // The other team's distance never reaches this manager, in any group.
    expect(JSON.stringify(summary)).not.toContain('8000');
  });

  it('refuses a caller who can only see their own attendance', async () => {
    const employeePrincipal = await principal(EMPLOYEE);
    const result = await tools.execute(employeePrincipal, 'explain_attendance_flags', {
      from: FROM,
      to: TO,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/สิทธิ์/); // "…has no permission…"
  });

  it('the manager-screen endpoint stays inert while the assistant is disabled', async () => {
    const token = await api.token(MANAGER);
    const res = await api.post('/assistant/attendance/flag-explanation', token, {
      from: FROM,
      to: TO,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).toMatch(/ASSISTANT_DISABLED|not enabled/i);
  });
});
