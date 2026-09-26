/**
 * Hardening offline punch capture (CW-025).
 *
 * A punch queued on a phone with no signal is credited when it was captured, not
 * when it finally syncs — so an offline worker never loses the time. But a punch
 * that arrives long after it was captured is exactly what a forged arrival time
 * looks like, so past a configurable ceiling (12h to start) it is recorded,
 * flagged LATE_CAPTURE, and sent to a manager to confirm through the existing
 * approval engine. This proves that path end to end:
 *
 *   - a punch captured 14 hours ago is accepted, flagged, and appears in the
 *     line manager's approval queue;
 *   - acknowledging or rejecting that flag writes no new punch and deletes none
 *     — `attendance_punches` is append-only and stays that way;
 *   - a device reporting root produces ROOTED_DEVICE end to end.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import type { ApiResponse } from './utils/test-app';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const EMPLOYEE = 'dev1@cwork.example'; // EMP-0006, clocks in from the app
const MANAGER = 'eng.manager@cwork.example'; // EMP-0005, dev1@'s line manager

const FOURTEEN_HOURS_AGO = () => new Date(Date.now() - 14 * 3_600_000).toISOString();

describe('Offline punch hardening (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let employeeToken: string;
  let managerToken: string;
  let employeeId: string;
  let counter = 0;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    employeeToken = await api.token(EMPLOYEE);
    managerToken = await api.token(MANAGER);

    const employee = await prisma.employee.findFirstOrThrow({
      where: { user: { email: EMPLOYEE } },
      select: { id: true },
    });
    employeeId = employee.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const lastPunch = (res: ApiResponse): { id: string; anomalyFlags: string[] } =>
    res.body.punches.at(-1);

  const countPunches = () => prisma.attendancePunch.count({ where: { employeeId } });

  /** The valid next punch type given the employee's current clock state. */
  const nextType = async (): Promise<'CLOCK_IN' | 'CLOCK_OUT'> => {
    const today = await api.get('/attendance/today', employeeToken);
    return today.body.nextAction as 'CLOCK_IN' | 'CLOCK_OUT';
  };

  const punch = (body: Record<string, unknown>) =>
    api.post('/attendance/punch', employeeToken, {
      method: 'MOBILE_GPS',
      clientPunchId: `cw025-${(counter += 1)}`,
      ...body,
    });

  /** Finds the manager's pending confirmation task for a specific punch. */
  const findLatePunchTask = async (punchId: string) => {
    const tasks = await api.get('/approvals/tasks', managerToken);
    return tasks.body.find(
      (t: { instance: { entityType: string; entityId: string } }) =>
        t.instance.entityType === 'ATTENDANCE_LATE_PUNCH' && t.instance.entityId === punchId,
    );
  };

  it('accepts and flags a punch captured 14 hours ago, routing it to the manager', async () => {
    const res = await punch({ type: await nextType(), clientTime: FOURTEEN_HOURS_AGO() });

    expect(res.status).toBeLessThan(300);
    expect(lastPunch(res).anomalyFlags).toContain('LATE_CAPTURE');

    // The punch is a queue delay, not a clock that drifted, so it is not both.
    expect(lastPunch(res).anomalyFlags).not.toContain('CLOCK_DRIFT');

    const task = await findLatePunchTask(lastPunch(res).id);
    expect(task).toBeDefined();
  });

  it('acknowledging the flag writes no punch and deletes none', async () => {
    const res = await punch({ type: await nextType(), clientTime: FOURTEEN_HOURS_AGO() });
    const punchId = lastPunch(res).id;
    const task = await findLatePunchTask(punchId);
    expect(task).toBeDefined();

    const before = await countPunches();
    const decision = await api.post(`/approvals/tasks/${task.id}/decide`, managerToken, {
      decision: 'APPROVE',
    });
    expect(decision.status).toBeLessThan(300);
    expect(await countPunches()).toBe(before);

    const instance = await api.get(
      `/approvals/instances/ATTENDANCE_LATE_PUNCH/${punchId}`,
      managerToken,
    );
    expect(instance.body.status).toBe('APPROVED');
  });

  it('rejecting the flag also writes no punch and deletes none', async () => {
    const res = await punch({ type: await nextType(), clientTime: FOURTEEN_HOURS_AGO() });
    const punchId = lastPunch(res).id;
    const task = await findLatePunchTask(punchId);
    expect(task).toBeDefined();

    const before = await countPunches();
    const decision = await api.post(`/approvals/tasks/${task.id}/decide`, managerToken, {
      decision: 'REJECT',
      comment: 'เวลาที่ส่งมาไม่ตรงกับกะที่ทำงาน',
    });
    expect(decision.status).toBeLessThan(300);
    expect(await countPunches()).toBe(before);

    const instance = await api.get(
      `/approvals/instances/ATTENDANCE_LATE_PUNCH/${punchId}`,
      managerToken,
    );
    expect(instance.body.status).toBe('REJECTED');
  });

  it('raises ROOTED_DEVICE when the device reports root, with no late-capture flag', async () => {
    const res = await punch({
      type: await nextType(),
      clientTime: new Date().toISOString(),
      isRootedDevice: true,
    });

    expect(res.status).toBeLessThan(300);
    expect(lastPunch(res).anomalyFlags).toContain('ROOTED_DEVICE');
    expect(lastPunch(res).anomalyFlags).not.toContain('LATE_CAPTURE');
  });
});
