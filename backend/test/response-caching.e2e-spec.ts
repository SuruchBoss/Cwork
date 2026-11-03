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
});
