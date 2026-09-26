// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Rendering issued documents as PDFs (CW-008).
 *
 * A `DocumentRequest` used to resolve to merge data — the fields, not a
 * document — and HR produced the certificate by hand, so the approval trail
 * ended in a manual step. This proves the missing half: issuing an approved
 * request renders a real PDF, stores it and links it; the PDF is reachable only
 * by the requester and a `document:issue` holder; re-issuing supersedes rather
 * than overwrites; and the printed verification code confirms the document to a
 * third party with no account. The rendering itself is unit-tested in
 * `certificate-renderer.spec.ts`.
 */
import { createHmac } from 'node:crypto';
import { DocumentRequestStatus, DocumentRequestType } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.manager@cwork.example'; // holds document:issue
const REQUESTER = 'dev1@cwork.example';
const OTHER = 'dev2@cwork.example'; // an employee who is not the requester
const ACCESS_SECRET = 'ci-access-secret-that-is-at-least-32-characters';

const stamp = Date.now().toString(36).toUpperCase().slice(-5);
const codeFor = (id: string) =>
  createHmac('sha256', ACCESS_SECRET).update(id).digest('hex').slice(0, 12).toUpperCase();

describe('Document PDF issuance (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let hrToken: string;
  let requesterToken: string;
  let otherToken: string;
  let requestId: string;
  let referenceNo: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    hrToken = await api.token(HR);
    requesterToken = await api.token(REQUESTER);
    otherToken = await api.token(OTHER);

    const employee = await prisma.employee.findFirstOrThrow({
      where: { user: { email: REQUESTER } },
      select: { id: true, organizationId: true },
    });
    referenceNo = `DOC-${stamp}`;
    // Created already approved, so this spec exercises issuance, not the approval
    // flow (which is covered elsewhere). Salary is requested, so the certificate
    // carries pay — the case that most needs the access control below.
    const request = await prisma.documentRequest.create({
      data: {
        organizationId: employee.organizationId,
        referenceNo,
        employeeId: employee.id,
        type: DocumentRequestType.SALARY_CERTIFICATE,
        includeSalary: true,
        status: DocumentRequestStatus.APPROVED,
      },
      select: { id: true },
    });
    requestId = request.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('renders and links a PDF when an approved request is issued', async () => {
    const issued = await api.post(`/documents/requests/${requestId}/issue`, hrToken, {});
    expect(issued.status).toBe(201);
    expect(issued.body.status).toBe('ISSUED');
    expect(issued.body.fileId).toBeTruthy();
  });

  it('serves the PDF to the requester', async () => {
    const res = await api.getRaw(`/documents/requests/${requestId}/pdf`, requesterToken);
    expect(res.status).toBe(200);
    // A real PDF came back, not an error page.
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(res.body.length).toBeGreaterThan(2000);
  });

  it('serves the PDF to a document:issue holder', async () => {
    const res = await api.getRaw(`/documents/requests/${requestId}/pdf`, hrToken);
    expect(res.status).toBe(200);
  });

  it('hides the PDF from another employee who is not the requester', async () => {
    const res = await api.get(`/documents/requests/${requestId}/pdf`, otherToken);
    expect(res.status).toBe(404);
  });

  it('supersedes on re-issue: a new file, the old one retained', async () => {
    const before = await prisma.documentRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { fileId: true },
    });
    const firstFileId = before.fileId!;

    const reissued = await api.post(`/documents/requests/${requestId}/issue`, hrToken, {});
    expect(reissued.status).toBe(201);
    expect(reissued.body.fileId).not.toBe(firstFileId);

    // The superseded file is left in place, not overwritten.
    const oldFile = await prisma.fileObject.findUnique({ where: { id: firstFileId } });
    expect(oldFile).not.toBeNull();
  });

  it('verifies a genuine document from its reference number and printed code', async () => {
    const good = await api.get(`/documents/verify?ref=${referenceNo}&code=${codeFor(requestId)}`);
    expect(good.status).toBe(200);
    expect(good.body.valid).toBe(true);
    expect(good.body.referenceNo).toBe(referenceNo);
    expect(good.body.employeeName).toBeTruthy();

    const bad = await api.get(`/documents/verify?ref=${referenceNo}&code=WRONGCODE0000`);
    expect(bad.body.valid).toBe(false);
  });
});
