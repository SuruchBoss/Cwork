/**
 * What the upload endpoint refuses to parse (CW-020).
 *
 * The multer upgrade clears four advisories. Three are denial of service
 * through the *multipart parser* rather than through the file — and two of
 * those, GHSA-wc9g-mqfw-jrwm and GHSA-535w-7cp7-47q4, need only a crafted field
 * name, with no file involved at all. The upgrade fixes the parser; these tests
 * pin the second half of the answer, which is that the endpoint declines to
 * parse anything outside its own contract, so a future advisory of the same
 * shape has nothing to reach.
 *
 * The happy-path case is not filler. `parts: 1` is exactly the limit that looks
 * safe and is not: busboy fires `partsLimit` when the count *reaches* the
 * limit, so on an older multer the single legitimate part is itself the
 * violation and every upload 400s. Multer 2.4 compensates; this test is what
 * would notice if a downgrade or a rewrite stopped compensating.
 */
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const UPLOADER = 'dev2@cwork.example';

/** Structurally real enough to survive the magic-byte check. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'ascii',
);

const file = { filename: 'note.pdf', contentType: 'application/pdf', content: PDF };

describe('Upload limits (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp({ env: { MALWARE_SCAN_ENABLED: 'false' } });
    api = ctx.api;
    token = await api.token(UPLOADER);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('accepts the one thing it is for: a single file part named `file`', async () => {
    const res = await api.upload('/files/upload', token, file);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('refuses a text field riding along with the file', async () => {
    // `fields: 0` is the limit that matters: both field-name advisories need a
    // text part, and this endpoint has never accepted one.
    const res = await api.upload('/files/upload', token, file, {
      fields: { description: 'harmless enough' },
    });

    expect(res.status).toBe(400);
  });

  it('refuses a field name nested thousands of levels deep', async () => {
    // GHSA-wc9g-mqfw-jrwm in its original form: `a[b][c]…` deep enough to
    // exhaust the stack inside append-field. Rejected as a field, so the name
    // is never parsed — and the request returns rather than hanging, which is
    // what the test would otherwise show as a timeout.
    const nested = `a${'[b]'.repeat(5000)}`;

    const res = await api.upload('/files/upload', token, file, {
      fields: { [nested]: 'x' },
    });

    expect(res.status).toBe(400);
  });

  it('refuses a field name carrying an enormous array index', async () => {
    // GHSA-535w-7cp7-47q4: `a[2147483647]` asks append-field to allocate an
    // array of that length.
    const res = await api.upload('/files/upload', token, file, {
      fields: { 'a[2147483647]': 'x' },
    });

    expect(res.status).toBe(400);
  });

  it('refuses a second file in the same request', async () => {
    const res = await api.uploadMany('/files/upload', token, [file, file]);

    expect(res.status).toBe(400);
  });

  it('refuses a file sent under any other part name', async () => {
    // A 400 rather than a 500, which is not free: Nest translates multer errors
    // by matching their message text, and multer 2.4 renamed this one from
    // "Unexpected field" to "Unexpected file field". Every such request became
    // an unhandled 500 with a stack trace until the filter started reading
    // `err.code` instead.
    const res = await api.upload('/files/upload', token, file, { name: 'attachment' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.message).toBe('Unexpected file field');
  });

  it('still refuses a file over the size limit with 413, not 400', async () => {
    // The size limit predates this ticket and answers with a different status
    // on purpose: too big is a different conversation from malformed.
    const oversized = Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024, 0x20)]);

    const res = await api.upload('/files/upload', token, {
      filename: 'huge.pdf',
      contentType: 'application/pdf',
      content: oversized,
    });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
