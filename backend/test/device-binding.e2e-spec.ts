/**
 * Binding an account to a device (CW-024).
 *
 * The app records a device id on every punch, but nothing authorised it: any
 * device with a valid token could clock in for an absent colleague. This proves
 * the control — the first device an employee punches from binds automatically, a
 * punch from any other device is accepted and flagged NEW_DEVICE (never refused,
 * so an employee can always prove they turned up), and the binding changes only
 * through an audited HR re-bind, never self-service.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import type { ApiResponse } from './utils/test-app';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.manager@cwork.example'; // holds attendance:manage
const EMPLOYEE = 'dev1@cwork.example'; // clocks in from a device

describe('Device binding (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let hrToken: string;
  let employeeToken: string;
  let employeeId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    hrToken = await api.token(HR);
    employeeToken = await api.token(EMPLOYEE);

    const employee = await prisma.employee.findFirstOrThrow({
      where: { user: { email: EMPLOYEE } },
      select: { id: true },
    });
    employeeId = employee.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const punch = (type: 'CLOCK_IN' | 'CLOCK_OUT', deviceId: string) =>
    api.post('/attendance/punch', employeeToken, { type, method: 'MOBILE_GPS', deviceId });
  const lastFlags = (res: ApiResponse): string[] => res.body.punches.at(-1).anomalyFlags;

  it('binds the first device automatically, without flagging it', async () => {
    const res = await punch('CLOCK_IN', 'device-A');
    expect(res.status).toBeLessThan(300);
    expect(lastFlags(res)).not.toContain('NEW_DEVICE');

    const active = await prisma.employeeDevice.findFirst({
      where: { employeeId, status: 'ACTIVE' },
    });
    expect(active?.deviceId).toBe('device-A');
    // Null means the employee self-bound it — not an HR re-bind.
    expect(active?.boundByUserId).toBeNull();
  });

  it('accepts but flags a punch from another device, leaving the binding in place', async () => {
    await punch('CLOCK_OUT', 'device-A');
    const res = await punch('CLOCK_IN', 'device-B');
    expect(res.status).toBeLessThan(300);
    expect(lastFlags(res)).toContain('NEW_DEVICE');

    // A punch never re-binds: device-A is still the bound device.
    const active = await prisma.employeeDevice.findFirst({
      where: { employeeId, status: 'ACTIVE' },
    });
    expect(active?.deviceId).toBe('device-A');
  });

  it('shows an employee’s devices to HR', async () => {
    const res = await api.get(`/attendance/devices/${employeeId}`, hrToken);
    expect(res.status).toBe(200);
    expect(res.body.map((device: { deviceId: string }) => device.deviceId)).toContain('device-A');
  });

  it('refuses a re-bind from a caller without attendance:manage', async () => {
    const res = await api.post('/attendance/devices/rebind', employeeToken, {
      employeeId,
      deviceId: 'device-B',
    });
    expect(res.status).toBe(403);
  });

  it('re-binds through HR, revoking the old device, and records it in the audit log', async () => {
    const res = await api.post('/attendance/devices/rebind', hrToken, {
      employeeId,
      deviceId: 'device-B',
      deviceModel: 'Pixel 9',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.boundByUserId).toBeTruthy(); // set to the HR user, not null

    const devices = await prisma.employeeDevice.findMany({ where: { employeeId } });
    const active = devices.filter((d) => d.status === 'ACTIVE');
    expect(active).toHaveLength(1);
    expect(active[0].deviceId).toBe('device-B');
    expect(devices.some((d) => d.deviceId === 'device-A' && d.status === 'REVOKED')).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'EmployeeDevice', action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('no longer flags a punch from the newly bound device', async () => {
    await punch('CLOCK_OUT', 'device-B');
    const res = await punch('CLOCK_IN', 'device-B');
    expect(lastFlags(res)).not.toContain('NEW_DEVICE');
  });
});
