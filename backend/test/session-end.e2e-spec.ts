// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Signing out ends the session at once.
 *
 * An access token lives for minutes. Signing out, ending a session from another
 * device or changing the password has to stop it working straight away, not when
 * it runs out, while a session that only moved on to a fresh refresh token keeps
 * working. Each test signs in as an account made here for it alone.
 */
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PASSWORD = `Ends-${randomUUID()}`;

interface Signed {
  accessToken: string;
  refreshToken: string;
}

describe('Ending a session (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let organizationId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    crypto = ctx.app.get(CryptoService, { strict: false });
    ({ organizationId } = await prisma.user.findFirstOrThrow({
      where: { email: 'hr.manager@cwork.example' },
      select: { organizationId: true },
    }));
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const account = async (label: string) => {
    const email = `ends-${label}-${randomUUID().slice(0, 8)}@cwork.example`;
    await prisma.user.create({
      data: {
        organizationId,
        email,
        passwordHash: await crypto.hashPassword(PASSWORD),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    return email;
  };
  const signIn = async (email: string): Promise<Signed> => {
    const res = await api.post('/auth/login', undefined, { email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body as Signed;
  };
  const me = (token: string) => api.get('/auth/me', token);

  it('works while the session is in force', async () => {
    const session = await signIn(await account('live'));

    expect((await me(session.accessToken)).status).toBe(200);
    expect((await me(session.accessToken)).status).toBe(200);
  });

  it('stops working the moment its own session is signed out', async () => {
    const session = await signIn(await account('own'));
    expect((await me(session.accessToken)).status).toBe(200);

    const out = await api.post('/auth/logout', session.accessToken, {
      refreshToken: session.refreshToken,
    });

    expect(out.status).toBeLessThan(300);
    expect((await me(session.accessToken)).status).toBe(401);
  });

  it('stops every session of the account when signing out without naming one', async () => {
    const email = await account('all');
    const first = await signIn(email);
    const second = await signIn(email);
    expect((await me(second.accessToken)).status).toBe(200);

    await api.post('/auth/logout', first.accessToken, {});

    expect((await me(first.accessToken)).status).toBe(401);
    expect((await me(second.accessToken)).status).toBe(401);
  });

  it('stops working when another device ends the session, and leaves that device working', async () => {
    const email = await account('other');
    const laptop = await signIn(email);
    const phone = await signIn(email);
    const row = await prisma.session.findFirstOrThrow({
      where: { user: { email }, tokenHash: crypto.hashToken(laptop.refreshToken) },
    });
    expect((await me(laptop.accessToken)).status).toBe(200);

    const ended = await api.delete(`/auth/sessions/${row.id}`, phone.accessToken);

    expect(ended.status).toBeLessThan(300);
    expect((await me(laptop.accessToken)).status).toBe(401);
    expect((await me(phone.accessToken)).status).toBe(200);
  });

  it('stops every session of the account when the password is changed', async () => {
    const email = await account('password');
    const other = await signIn(email);
    const here = await signIn(email);

    const changed = await api.post('/auth/change-password', here.accessToken, {
      currentPassword: PASSWORD,
      newPassword: `New-${randomUUID()}-Aa1!`,
    });
    expect(changed.status).toBeLessThan(300);

    expect((await me(other.accessToken)).status).toBe(401);
    expect((await me(here.accessToken)).status).toBe(401);
  });

  it('keeps an access token working after its session moved on to a fresh refresh token', async () => {
    const session = await signIn(await account('rotate'));

    const renewed = await api.post('/auth/refresh', undefined, {
      refreshToken: session.refreshToken,
    });

    expect(renewed.status).toBe(200);
    expect((await me(session.accessToken)).status).toBe(200);
    expect((await me((renewed.body as Signed).accessToken)).status).toBe(200);
  });

  it('ends the whole family when an old refresh token is presented again', async () => {
    const session = await signIn(await account('reuse'));
    const renewed = (
      await api.post('/auth/refresh', undefined, { refreshToken: session.refreshToken })
    ).body as Signed;
    expect((await me(renewed.accessToken)).status).toBe(200);

    const replay = await api.post('/auth/refresh', undefined, {
      refreshToken: session.refreshToken,
    });

    expect(replay.status).toBe(401);
    expect((await me(renewed.accessToken)).status).toBe(401);
  });
});
