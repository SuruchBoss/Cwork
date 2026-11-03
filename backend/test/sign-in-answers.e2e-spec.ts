// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * What a refused sign-in says.
 *
 * An address with an account and an address without one are answered alike:
 * the same wording for a wrong password, the same wait once too many have been
 * tried, and the same work done before either answer. Each test uses an account
 * made here for it alone, so locking one out cannot reach another spec.
 */
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from 'src/core/config/config.token';
import type { RootConfig } from 'src/core/config/configuration';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { AuthService } from 'src/modules/auth/auth.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PASSWORD = `Sign-${randomUUID()}`;

describe('Refused sign-ins (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let signInCrypto: CryptoService;
  let organizationId: string;
  let maxFailedAttempts: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    crypto = ctx.app.get(CryptoService, { strict: false });
    // The sign-in's own copy: the app has several, and the spies must watch this one.
    signInCrypto = (ctx.app.get(AuthService) as unknown as { crypto: CryptoService }).crypto;
    maxFailedAttempts = ctx.app.get<RootConfig>(APP_CONFIG).auth.maxFailedAttempts;
    ({ organizationId } = await prisma.user.findFirstOrThrow({
      where: { email: 'hr.manager@cwork.example' },
      select: { organizationId: true },
    }));
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const account = async (label: string) => {
    const email = `answers-${label}-${randomUUID().slice(0, 8)}@cwork.example`;
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
  const unknown = (label: string) => `nobody-${label}-${randomUUID().slice(0, 8)}@cwork.example`;
  const attempt = (email: string, password = 'not-the-password') =>
    api.post('/auth/login', undefined, { email, password });

  /** Tries until the first answer that is not a wrong password, and returns every answer. */
  const tryUntilRefused = async (email: string) => {
    const answers = [];
    for (let n = 0; n <= maxFailedAttempts + 1; n += 1) {
      answers.push(await attempt(email));
    }
    return answers;
  };

  it('answers a wrong password alike for an address with an account and one without', async () => {
    const known = await attempt(await account('wrong'));
    const missing = await attempt(unknown('wrong'));

    expect(known.status).toBe(401);
    expect(missing.status).toBe(known.status);
    expect(missing.body.message).toBe(known.body.message);
  });

  it('asks the caller to wait after the same number of tries, for either kind of address', async () => {
    const withAccount = await tryUntilRefused(await account('wait'));
    const without = await tryUntilRefused(unknown('wait'));

    expect(withAccount.map((a) => a.status)).toEqual(without.map((a) => a.status));
    expect(withAccount.map((a) => a.body.code)).toEqual(without.map((a) => a.body.code));
    const last = without[without.length - 1]!;
    expect(last.status).toBe(422);
    expect(last.body.code).toBe('ACCOUNT_LOCKED');
    expect(Object.keys(last.body).sort()).toEqual(
      Object.keys(withAccount[withAccount.length - 1]!.body).sort(),
    );
  });

  it('keeps asking an address to wait even when it then gives the password it was made with', async () => {
    const email = await account('right');
    await tryUntilRefused(email);

    const late = await attempt(email, PASSWORD);

    expect(late.status).toBe(422);
    expect(late.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('does the same password work for an address without an account as for one with', async () => {
    const check = jest.spyOn(signInCrypto, 'verifyPassword');
    try {
      await attempt(unknown('work'));
      expect(check).toHaveBeenCalledTimes(1);

      check.mockClear();
      await attempt(await account('work'));
      expect(check).toHaveBeenCalledTimes(1);
    } finally {
      check.mockRestore();
    }
  });

  it('does that work for a locked account too, before refusing it', async () => {
    const email = await account('locked');
    await tryUntilRefused(email);

    const check = jest.spyOn(signInCrypto, 'verifyPassword');
    try {
      const refused = await attempt(email);

      expect(refused.body.code).toBe('ACCOUNT_LOCKED');
      expect(check).toHaveBeenCalledTimes(1);
    } finally {
      check.mockRestore();
    }
  });
});
