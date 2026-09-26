// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * "ขอเอกสาร" — the HR documents an employee asks for and HR issues.
 *
 * Six routes and no route-level test before this. The module looks
 * administrative, which is exactly why it went untested: a request, an
 * approval, a PDF someone prints. But it is also the one place in the system
 * where **salary walks out of the building on paper**, and whether it does is
 * decided by a single boolean assembled in two places.
 *
 * So the centre of this suite is not "can HR issue a certificate". It is that
 * an employment certificate for a visa comes back with no pay in it, and a
 * salary certificate comes back with the real figure — because the failure
 * nobody notices is the first one quietly containing the second.
 */
import { DocumentRequestStatus, DocumentRequestType } from '@prisma/client';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.officer@cwork.example';
const EMPLOYEE = 'dev2@cwork.example';
const COLLEAGUE = 'dev1@cwork.example';

describe('HR documents (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let hrToken: string;
  let employeeToken: string;
  let colleagueToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    hrToken = await api.token(HR);
    employeeToken = await api.token(EMPLOYEE);
    colleagueToken = await api.token(COLLEAGUE);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  /** Takes the request through HR's inbox, the way it actually gets approved. */
  const approve = async (requestId: string): Promise<void> => {
    const tasks = await api.get('/approvals/tasks', hrToken);
    const task = tasks.body.find(
      (t: { instance?: { entityId?: string } }) => t.instance?.entityId === requestId,
    );
    if (!task) throw new Error(`no approval task for document request ${requestId}`);

    const decided = await api.post(`/approvals/tasks/${task.id}/decide`, hrToken, {
      decision: 'APPROVE',
    });
    expect(decided.body.instanceStatus).toBe('APPROVED');
  };

  describe('an employment certificate for a visa', () => {
    let requestId: string;

    it('is raised by the employee themselves and waits for HR', async () => {
      const res = await api.post('/documents/requests', employeeToken, {
        type: DocumentRequestType.EMPLOYMENT_CERTIFICATE,
        purpose: 'ยื่นขอวีซ่าประเทศญี่ปุ่น',
        addressedTo: 'สถานทูตญี่ปุ่นประจำประเทศไทย',
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(DocumentRequestStatus.PENDING);
      expect(res.body.referenceNo).toEqual(expect.any(String));
      expect(res.body.includeSalary).toBe(false);
      requestId = res.body.id;
    });

    it('is visible to the person who asked for it', async () => {
      const mine = await api.get('/documents/requests', employeeToken);

      expect(mine.status).toBe(200);
      expect(mine.body.map((r: { id: string }) => r.id)).toContain(requestId);
    });

    it('is not visible to a colleague', async () => {
      // Why somebody wants a letter is their business — a visa application, a
      // bank loan, a new job. The list is scoped, not merely unsorted.
      const theirs = await api.get('/documents/requests', colleagueToken);

      expect(theirs.body.map((r: { id: string }) => r.id)).not.toContain(requestId);
    });

    it('does not let the employee read their own certificate data', async () => {
      // The merge data is HR's working copy and carries pay for the request
      // types that include it. Reading it takes `document:issue`, which an
      // employee does not have — not even for their own request.
      const res = await api.get(`/documents/requests/${requestId}/certificate-data`, employeeToken);

      expect(res.status).toBe(403);
    });

    it('cannot be issued before it is approved', async () => {
      const res = await api.post(`/documents/requests/${requestId}/issue`, hrToken, {});

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('DOCUMENT_NOT_APPROVED');
    });

    it('carries no salary once HR approves and reads the merge data', async () => {
      await approve(requestId);

      const res = await api.get(`/documents/requests/${requestId}/certificate-data`, hrToken);

      expect(res.status).toBe(200);
      // The whole point of the suite. A certificate for an embassy proves
      // employment; it has no business stating what the person is paid.
      expect(res.body.compensation).toBeNull();
      expect(res.body.employee.nameTh).toEqual(expect.any(String));
      expect(res.body.employee.yearsOfService).toEqual(expect.any(Number));
      expect(res.body.addressedTo).toBe('สถานทูตญี่ปุ่นประจำประเทศไทย');
    });

    it('tells the employee when it has been issued', async () => {
      const issued = await api.post(`/documents/requests/${requestId}/issue`, hrToken, {
        note: 'รับได้ที่ฝ่ายบุคคล',
      });
      expect(issued.status).toBe(201);
      expect(issued.body.status).toBe(DocumentRequestStatus.ISSUED);
      expect(issued.body.issuedAt).toEqual(expect.any(String));

      // Issuing and saying so commit together: a document marked issued that
      // the employee was never told about is a request that looks answered and
      // is not.
      const notifications = await api.get('/notifications', employeeToken);
      const told = notifications.body.items ?? notifications.body;
      expect(told.some((n: { type: string }) => n.type === 'document.issued')).toBe(true);
    });
  });

  describe('a salary certificate', () => {
    it('carries the salary even though nobody ticked the box', async () => {
      const created = await api.post('/documents/requests', employeeToken, {
        type: DocumentRequestType.SALARY_CERTIFICATE,
        purpose: 'ยื่นกู้สินเชื่อบ้าน',
      });
      expect(created.status).toBe(201);
      // Asking for a salary certificate *is* asking for the salary. Requiring a
      // second opt-in would only produce certificates with the number missing.
      expect(created.body.includeSalary).toBe(true);

      await approve(created.body.id);

      const data = await api.get(
        `/documents/requests/${created.body.id}/certificate-data`,
        hrToken,
      );
      expect(data.body.compensation).not.toBeNull();
      expect(data.body.compensation.baseSalary).toEqual(expect.any(String));
      expect(data.body.compensation.currency).toBe('THB');
    });
  });

  describe('a request HR turns down', () => {
    it('records why, and stops there', async () => {
      const created = await api.post('/documents/requests', employeeToken, {
        type: DocumentRequestType.VISA_SUPPORT_LETTER,
        purpose: 'เที่ยวส่วนตัว',
      });

      const rejected = await api.post(`/documents/requests/${created.body.id}/reject`, hrToken, {
        reason: 'ไม่เข้าเงื่อนไขการออกหนังสือรับรอง',
      });

      expect(rejected.status).toBe(201);
      expect(rejected.body.status).toBe(DocumentRequestStatus.REJECTED);
      expect(rejected.body.rejectReason).toBe('ไม่เข้าเงื่อนไขการออกหนังสือรับรอง');

      const issued = await api.post(`/documents/requests/${created.body.id}/issue`, hrToken, {});
      expect(issued.status).toBe(422);
      expect(issued.body.code).toBe('DOCUMENT_NOT_APPROVED');
    });
  });

  describe('who may issue', () => {
    it('refuses an employee trying to issue a document to themselves', async () => {
      const created = await api.post('/documents/requests', employeeToken, {
        type: DocumentRequestType.EMPLOYMENT_CERTIFICATE,
        purpose: 'สมัครงานใหม่',
      });

      const res = await api.post(`/documents/requests/${created.body.id}/issue`, employeeToken, {});

      expect(res.status).toBe(403);
    });
  });
});
