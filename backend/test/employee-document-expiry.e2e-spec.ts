// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Foreign workers' documents that are about to lapse (CW-073).
 *
 * HR gets a list of passports and work permits expired or expiring within 30, 60
 * or 90 days, and is told once as each window opens. The document numbers are
 * never in the list or the notice, a renewal starts its own windows, and someone
 * who has left is neither listed nor told about. Synthetic people only.
 */
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './utils/database';
import { DocumentExpiryService } from 'src/modules/employees/document-expiry.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.officer@cwork.example';
const EMPLOYEE = 'dev2@cwork.example';

const PERMIT_NO = 'WP-0012345';
const PASSPORT_NO = 'MB123456';

const day = (offset: number, from = new Date()) =>
  new Date(from.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

describe('Expiring documents (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaClient;
  let hr: string;
  let hrUserId: string;
  let organizationId: string;
  let service: DocumentExpiryService;
  const made: string[] = [];

  const add = async (lastName: string, extra: Record<string, unknown>) => {
    const res = await api.post('/employees', hr, {
      firstNameTh: 'เอกสาร',
      lastNameTh: lastName,
      hireDate: '2026-01-05',
      passportNo: PASSPORT_NO,
      workPermitNo: PERMIT_NO,
      ...extra,
    });
    expect(res.status).toBe(201);
    made.push(res.body.id);
    return res.body.id as string;
  };
  const listed = async (query = '') =>
    (await api.get(`/employees/expiring-documents${query}`, hr)).body;
  const noticesFor = (employeeId: string) =>
    prisma.notification
      .findMany({
        where: { userId: hrUserId, type: 'employee.document.expiring' },
        orderBy: { createdAt: 'asc' },
      })
      .then((all) =>
        all.filter((n) => (n.data as { employeeId?: string }).employeeId === employeeId),
      );
  const run = (now?: Date) => service.sendDueNotices(organizationId, now);

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
    service = ctx.app.get(DocumentExpiryService);
    hr = await api.token(HR);
    organizationId = (await prisma.organization.findFirstOrThrow({ select: { id: true } })).id;
    hrUserId = (await prisma.user.findFirstOrThrow({ where: { email: HR }, select: { id: true } }))
      .id;
  });

  afterAll(async () => {
    if (made.length > 0) {
      await prisma.employeeDocumentNotice.deleteMany({ where: { employeeId: { in: made } } });
      await prisma.employmentEvent.deleteMany({ where: { employeeId: { in: made } } });
      await prisma.employee.deleteMany({ where: { id: { in: made } } });
    }
    await prisma?.$disconnect();
    await ctx?.close();
  });

  it('is for people who may read employee records, and nobody else', async () => {
    const employee = await api.token(EMPLOYEE);
    expect((await api.get('/employees/expiring-documents', employee)).status).toBe(403);
  });

  it('lists a permit with 29 days left, tells HR once, and never shows the number', async () => {
    const id = await add('ใบอนุญาตใกล้หมด', { workPermitExpiresOn: day(29) });

    const report = await listed();
    const item = report.items.find((i: any) => i.employeeId === id);
    expect(item).toMatchObject({ document: 'WORK_PERMIT', window: 30, expiresOn: day(29) });
    expect(item.daysLeft).toBeGreaterThanOrEqual(28);
    expect(item.daysLeft).toBeLessThanOrEqual(29);
    // The list carries no number, and no passport (the passport has no date).
    expect(JSON.stringify(report)).not.toContain(PERMIT_NO);
    expect(JSON.stringify(report)).not.toContain(PASSPORT_NO);
    expect(report.items.filter((i: any) => i.employeeId === id)).toHaveLength(1);

    await run();
    await run();
    await run();
    const told = await noticesFor(id);
    expect(told).toHaveLength(1);
    expect(told[0]!.body).toContain('ใบอนุญาตทำงาน');
    expect(told[0]!.body).not.toContain(PERMIT_NO);
    expect(told[0]!.body).not.toContain(PASSPORT_NO);
    expect(JSON.stringify(told[0])).not.toContain(PERMIT_NO);
  });

  it('removes a renewed permit from the list, sends nothing more for the old date, and starts new windows for the new one', async () => {
    const id = await add('ต่ออายุ', { workPermitExpiresOn: day(29) });
    await run();
    expect(await noticesFor(id)).toHaveLength(1);

    const renewed = await api.patch(`/employees/${id}`, hr, { workPermitExpiresOn: day(400) });
    expect(renewed.status).toBe(200);
    expect((await listed()).items.some((i: any) => i.employeeId === id)).toBe(false);
    await run();
    expect(await noticesFor(id)).toHaveLength(1);

    // Renewed again, to a date that is itself soon: its own window opens.
    await api.patch(`/employees/${id}`, hr, { workPermitExpiresOn: day(45) });
    await run();
    await run();
    const told = await noticesFor(id);
    expect(told).toHaveLength(2);
    expect((await listed()).items.find((i: any) => i.employeeId === id)).toMatchObject({
      window: 60,
    });
  });

  it('tells HR as the same date moves from 90 to 60 to 30 days and then past, once for each', async () => {
    const expiry = day(80);
    const id = await add('ผ่านทุกช่วง', { passportExpiresOn: expiry });
    const at = (offset: number) => new Date(Date.now() + offset * 86_400_000);

    await run(at(0)); // 80 left: the 90 window
    await run(at(0));
    expect(await noticesFor(id)).toHaveLength(1);
    await run(at(15)); // 65: still the 90 window
    expect(await noticesFor(id)).toHaveLength(1);
    await run(at(25)); // 55: the 60 window
    await run(at(30)); // 50: still 60
    expect(await noticesFor(id)).toHaveLength(2);
    await run(at(55)); // 25: the 30 window
    await run(at(70));
    expect(await noticesFor(id)).toHaveLength(3);
    await run(at(85)); // 5 days past: expired
    await run(at(90));
    const told = await noticesFor(id);
    expect(told).toHaveLength(4);
    expect(told.map((n) => (n.data as { window: number }).window)).toEqual([90, 60, 30, 0]);
    expect(told[3]!.title).toBe('เอกสารของพนักงานหมดอายุแล้ว');
    expect(told[3]!.body).toContain('พาสปอร์ต');
  });

  it('says what is already expired, and a document first seen inside a window is told for that window only', async () => {
    const id = await add('หมดแล้ว', { passportExpiresOn: day(-5) });
    expect((await listed()).items.find((i: any) => i.employeeId === id)).toMatchObject({
      document: 'PASSPORT',
      window: 0,
    });
    await run();
    const told = await noticesFor(id);
    expect(told).toHaveLength(1);
    expect(told[0]!.body).toContain('หมดอายุเมื่อ');
  });

  it('looks 30, 60 or 90 days ahead as asked, and always shows what has expired', async () => {
    const id = await add('ช่วงเวลา', { workPermitExpiresOn: day(75), passportExpiresOn: day(-2) });
    const idsOf = async (query: string) =>
      (await listed(query)).items
        .filter((i: any) => i.employeeId === id)
        .map((i: any) => i.document);
    expect(await idsOf('?within=30')).toEqual(['PASSPORT']);
    expect(await idsOf('?within=60')).toEqual(['PASSPORT']);
    expect((await idsOf('?within=90')).sort()).toEqual(['PASSPORT', 'WORK_PERMIT']);
    expect((await api.get('/employees/expiring-documents?within=45', hr)).status).toBe(400);
  });

  it('leaves out someone who has left, and tells HR nothing about them', async () => {
    const id = await add('ลาออกแล้ว', { workPermitExpiresOn: day(10) });
    await prisma.employee.update({ where: { id }, data: { status: 'RESIGNED' } });
    expect((await listed()).items.some((i: any) => i.employeeId === id)).toBe(false);
    await run();
    expect(await noticesFor(id)).toHaveLength(0);
  });

  it('leaves a document with no date alone', async () => {
    const id = await add('ไม่มีวันที่', {});
    expect((await listed()).items.some((i: any) => i.employeeId === id)).toBe(false);
    await run();
    expect(await noticesFor(id)).toHaveLength(0);
  });
});
