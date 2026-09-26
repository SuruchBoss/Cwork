// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * A work location's code is an identifier (CW-049 / ADR-0006).
 *
 * `WorkLocation.code` was free text anyone could edit; the moment anything
 * outside Cwork refers to a site — a payroll export, another system in the
 * ecosystem — a code that can change is not an identifier. This proves the rule
 * end to end: the format is enforced with the pattern in the message; a code is
 * correctable before the site is first used and locked after, with the error
 * naming what locked it; and a wrong code on a used site is replaced by
 * superseding — a new location, the old one deactivated and pointing at it, with
 * every punch it ever had left intact and people moved to the replacement.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.manager@cwork.example'; // holds org:manage
const EMPLOYEE = 'dev1@cwork.example'; // an employee we can base at a site

describe('Work location code as identifier (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let hrToken: string;
  let organizationId: string;
  let employeeId: string;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    hrToken = await api.token(HR);
    const employee = await prisma.employee.findFirstOrThrow({
      where: { user: { email: EMPLOYEE } },
      select: { id: true, organizationId: true },
    });
    employeeId = employee.id;
    organizationId = employee.organizationId;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  // Unique and format-valid: uppercase letters, digits and hyphens.
  const code = () => `SITE-${Date.now().toString(36).toUpperCase()}-${(seq += 1)}`;

  const createLocation = (c: string) =>
    api.post('/work-locations', hrToken, {
      code: c,
      name: 'ไซต์ทดสอบ',
      latitude: 13.75,
      longitude: 100.5,
      geofenceRadiusM: 150,
    });

  // A punch on a fixed past day: it still counts as "the location was used"
  // (first-use counts punches on any date) without touching this employee's
  // clock state today, which a shared database means another spec relies on.
  const PAST = new Date('2020-01-06T02:00:00.000Z');
  const recordPunchAt = (workLocationId: string) =>
    prisma.attendancePunch.create({
      data: {
        organizationId,
        employeeId,
        type: 'CLOCK_IN',
        method: 'MOBILE_GPS',
        punchedAt: PAST,
        workDate: PAST,
        workLocationId,
      },
    });

  it('refuses a code that does not match the format, with the pattern in the message', async () => {
    const res = await api.post('/work-locations', hrToken, { code: 'bad_code', name: 'x' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('^[A-Z0-9][A-Z0-9-]{1,31}$');
  });

  it('lets a code be corrected before the location is first used', async () => {
    const created = await createLocation(code());
    expect(created.status).toBe(201);

    const nextCode = code();
    const patched = await api.patch(`/work-locations/${created.body.id}`, hrToken, {
      code: nextCode,
    });

    expect(patched.status).toBeLessThan(300);
    expect(patched.body.code).toBe(nextCode);
  });

  it('locks the code once the location is first used, naming the event', async () => {
    const created = await createLocation(code());
    const id = created.body.id;
    await recordPunchAt(id); // event 1: a punch recorded against it

    const res = await api.patch(`/work-locations/${id}`, hrToken, { code: code() });

    expect(res.status).toBe(422);
    expect(res.body.message).toContain('ลงเวลา'); // the error names the punch

    // Only the code is frozen — the rest of the record stays editable.
    const rename = await api.patch(`/work-locations/${id}`, hrToken, { name: 'ชื่อใหม่' });
    expect(rename.status).toBeLessThan(300);
    expect(rename.body.name).toBe('ชื่อใหม่');
  });

  it('supersedes a used location, keeping its history and moving people to the replacement', async () => {
    const created = await createLocation(code());
    const oldId = created.body.id;

    const original = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { workLocationId: true },
    });
    // Use the site: base an employee there and record a punch against it.
    await prisma.employee.update({ where: { id: employeeId }, data: { workLocationId: oldId } });
    await recordPunchAt(oldId);

    const newCode = code();
    const superseded = await api.post(`/work-locations/${oldId}/supersede`, hrToken, {
      code: newCode,
      name: 'ไซต์ใหม่',
      latitude: 13.76,
      longitude: 100.51,
      geofenceRadiusM: 150,
    });
    expect(superseded.status).toBe(201);
    expect(superseded.body.code).toBe(newCode);
    const newId = superseded.body.id;

    // The old row is kept, deactivated, and points at its replacement.
    const old = await prisma.workLocation.findUniqueOrThrow({ where: { id: oldId } });
    expect(old.isActive).toBe(false);
    expect(old.supersededById).toBe(newId);

    // History intact: the punch still resolves to the old location.
    const historicPunch = await prisma.attendancePunch.findFirst({
      where: { workLocationId: oldId },
    });
    expect(historicPunch).not.toBeNull();

    // New ones go to the replacement: the employee has been moved.
    const moved = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { workLocationId: true },
    });
    expect(moved.workLocationId).toBe(newId);

    // Leave the shared employee as we found it.
    await prisma.employee.update({
      where: { id: employeeId },
      data: { workLocationId: original.workLocationId },
    });
  });
});
