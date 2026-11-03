// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Who may open or remove a stored file.
 *
 * A file id is not a key to the file. Anyone signed in to the organisation who
 * learns an id still has to have a reason to see the file: they uploaded it, or
 * it is attached to something they may see. Everyone else is told the file does
 * not exist, which is also what an id that was never issued gets, so the answer
 * does not say which ids are real.
 */
import { createTestApp, type Api, type TestContext } from './utils/test-app';
import { addDays, isoDate } from './utils/dates';

const OWNER = 'dev2@cwork.example';
const COLLEAGUE = 'dev1@cwork.example';
const MANAGER = 'eng.manager@cwork.example';

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'ascii',
);
const doc = (filename: string) => ({ filename, contentType: 'application/pdf', content: PDF });

describe('Access to stored files (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let owner: string;
  let colleague: string;
  let manager: string;

  const upload = async (token: string, filename: string): Promise<string> => {
    const res = await api.upload('/files/upload', token, doc(filename));
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  const canRead = async (token: string, id: string) => ({
    metadata: (await api.get(`/files/${id}`, token)).status,
    content: (await api.getRaw(`/files/${id}/content`, token)).status,
  });

  beforeAll(async () => {
    ctx = await createTestApp({ env: { MALWARE_SCAN_ENABLED: 'false' } });
    api = ctx.api;
    owner = await api.token(OWNER);
    colleague = await api.token(COLLEAGUE);
    manager = await api.token(MANAGER);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('a file nobody has attached to anything', () => {
    let id: string;

    beforeAll(async () => {
      id = await upload(owner, 'private-note.pdf');
    });

    it('can be opened by the person who uploaded it', async () => {
      expect(await canRead(owner, id)).toEqual({ metadata: 200, content: 200 });
    });

    it('is not found by a colleague who has its id', async () => {
      expect(await canRead(colleague, id)).toEqual({ metadata: 404, content: 404 });
    });

    it('is not found by a colleague who tries to delete it', async () => {
      expect((await api.delete(`/files/${id}`, colleague)).status).toBe(404);
      expect((await api.get(`/files/${id}`, owner)).status).toBe(200);
    });

    it('answers a colleague exactly as it answers an id that does not exist', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      const missing = await api.get(`/files/${unknown}`, colleague);
      const hidden = await api.get(`/files/${id}`, colleague);

      expect(hidden.status).toBe(missing.status);
      expect(Object.keys(hidden.body).sort()).toEqual(Object.keys(missing.body).sort());
    });

    it('can be removed by the person who uploaded it', async () => {
      const own = await upload(owner, 'to-remove.pdf');

      expect((await api.delete(`/files/${own}`, owner)).status).toBeLessThan(300);
      expect((await api.get(`/files/${own}`, owner)).status).toBe(404);
    });
  });

  describe('a document on a leave request', () => {
    let id: string;

    beforeAll(async () => {
      id = await upload(owner, 'medical-certificate.pdf');
      const types = (await api.get('/leave/types', owner)).body as Array<{
        id: string;
        code: string;
      }>;
      const sick = types.find((t) => t.code === 'SICK')!;
      const day = isoDate(addDays(new Date(), 2));
      const created = await api.post('/leave/requests', owner, {
        leaveTypeId: sick.id,
        startDate: day,
        endDate: day,
        reason: 'ไม่สบาย',
        attachmentIds: [id],
        saveAsDraft: true,
      });
      expect(created.status).toBeLessThan(300);
    });

    it('can be opened by the person who asked for the leave', async () => {
      expect(await canRead(owner, id)).toEqual({ metadata: 200, content: 200 });
    });

    it("can be opened by that person's manager", async () => {
      expect((await canRead(manager, id)).metadata).toBe(200);
    });

    it('is not found by a colleague with no part in the request', async () => {
      expect(await canRead(colleague, id)).toEqual({ metadata: 404, content: 404 });
      expect((await api.delete(`/files/${id}`, colleague)).status).toBe(404);
    });

    it('cannot be claimed by a colleague who attaches the id to a request of their own', async () => {
      const types = (await api.get('/leave/types', colleague)).body as Array<{
        id: string;
        code: string;
      }>;
      const sick = types.find((t) => t.code === 'SICK')!;
      const day = isoDate(addDays(new Date(), 9));
      const res = await api.post('/leave/requests', colleague, {
        leaveTypeId: sick.id,
        startDate: day,
        endDate: day,
        reason: 'ไม่สบาย',
        attachmentIds: [id],
        saveAsDraft: true,
      });

      expect(res.status).toBe(404);
      expect((await canRead(colleague, id)).metadata).toBe(404);
    });
  });

  describe('a receipt on an expense claim', () => {
    let id: string;

    beforeAll(async () => {
      id = await upload(owner, 'receipt.pdf');
      const created = await api.post('/expenses/claims', owner, {
        title: 'ค่าเดินทาง',
        saveAsDraft: true,
        items: [
          {
            expenseDate: isoDate(new Date()),
            category: 'TRANSPORT',
            description: 'แท็กซี่',
            amount: 120,
            receiptFileId: id,
          },
        ],
      });
      expect(created.status).toBeLessThan(300);
    });

    it('can be opened by the person who claimed', async () => {
      expect(await canRead(owner, id)).toEqual({ metadata: 200, content: 200 });
    });

    it('is not found by a colleague', async () => {
      expect(await canRead(colleague, id)).toEqual({ metadata: 404, content: 404 });
    });

    it("cannot be put on a colleague's own claim", async () => {
      const res = await api.post('/expenses/claims', colleague, {
        title: 'ค่าเดินทาง',
        saveAsDraft: true,
        items: [
          {
            expenseDate: isoDate(new Date()),
            category: 'TRANSPORT',
            description: 'แท็กซี่',
            amount: 120,
            receiptFileId: id,
          },
        ],
      });

      expect(res.status).toBe(404);
    });
  });
});
