// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * What the API tells a browser, or a cache in front of it, about keeping an
 * answer. Pay and personal data are not kept.
 */
import request from 'supertest';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PAYROLL = 'payroll@cwork.example';

describe('Responses are not kept (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    token = await api.token(PAYROLL);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const cacheControlOf = async (path: string) => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`);
    return { status: res.status, cacheControl: res.headers['cache-control'] as string | undefined };
  };

  it.each([
    ['the signed-in user', '/auth/me'],
    ['the list of employees', '/employees'],
    ['the payroll periods', '/payroll/periods'],
    ['the payroll runs', '/payroll/runs'],
  ])('says not to keep %s', async (_what, path) => {
    const { status, cacheControl } = await cacheControlOf(path);

    expect(status).toBe(200);
    expect(cacheControl).toContain('no-store');
  });

  it('says it of an answer that is a refusal as well: no sign-in, and not allowed', async () => {
    const anonymous = await request(ctx.app.getHttpServer()).get('/api/v1/employees');
    const employee = await request(ctx.app.getHttpServer())
      .get('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${await api.token('dev2@cwork.example')}`);

    expect(anonymous.status).toBe(401);
    expect(anonymous.headers['cache-control']).toContain('no-store');
    expect(employee.status).toBe(403);
    expect(employee.headers['cache-control']).toContain('no-store');
  });

  it('says it of a route that does not exist', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/v1/nothing-here')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('leaves a download with the caching it sets for itself', async () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    );
    const uploaded = await api.upload('/files/upload', token, {
      filename: 'note.pdf',
      contentType: 'application/pdf',
      content: pdf,
    });
    expect(uploaded.status).toBe(201);

    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1/files/${uploaded.body.id}/content`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=0, no-store');
  });

  it('does not touch an address outside the API, such as the console’s own files', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/assets/app.js');

    expect(res.headers['cache-control']).toBeUndefined();
  });
});
