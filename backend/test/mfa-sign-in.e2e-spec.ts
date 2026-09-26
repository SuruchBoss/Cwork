// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Signing in with a second factor (GHSA-3cgw-73cr-r8c6, fixed in 0.3.1).
 *
 * Two properties the sign-in flow has to hold, pinned here because both were
 * broken for three releases without a test noticing:
 *
 *   - a session is issued only in answer to a verified code — never in exchange
 *     for the challenge token alone;
 *   - wrong codes count towards the lockout until a sign-in actually completes,
 *     so re-entering a correct password in between does not start the count
 *     over.
 *
 * Each test signs in as an account created here for that test alone, so
 * locking one out, or leaving a challenge half-finished, cannot reach any other
 * spec sharing this database.
 */
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from 'src/core/config/config.token';
import type { RootConfig } from 'src/core/config/configuration';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CryptoService } from 'src/core/security/crypto.service';
import { generateTotpForStep, generateTotpSecret, timeStepAt } from 'src/modules/auth/domain/totp';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const PASSWORD = `Mfa-${randomUUID()}`;

describe('Sign-in with a second factor (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let organizationId: string;
  let maxFailedAttempts: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    prisma = ctx.app.get(PrismaService);
    crypto = ctx.app.get(CryptoService);
    maxFailedAttempts = ctx.app.get<RootConfig>(APP_CONFIG).auth.maxFailedAttempts;

    const seeded = await prisma.user.findFirstOrThrow({
      where: { email: 'hr.manager@cwork.example' },
      select: { organizationId: true },
    });
    organizationId = seeded.organizationId;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  /** An account with an activated second factor and nothing else. */
  async function enrolledAccount(label: string): Promise<{ email: string; secret: string }> {
    const secret = generateTotpSecret();
    const email = `mfa-${label}-${randomUUID().slice(0, 8)}@cwork.example`;
    await prisma.user.create({
      data: {
        organizationId,
        email,
        passwordHash: await crypto.hashPassword(PASSWORD),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        mfaEnabled: true,
        mfaSecretEnc: crypto.encrypt(secret),
        mfaEnrolledAt: new Date(),
      },
    });
    return { email, secret };
  }

  const signIn = (email: string) =>
    api.post('/auth/login', undefined, { email, password: PASSWORD });

  const currentCode = (secret: string): string =>
    generateTotpForStep(secret, timeStepAt(Date.now()));

  /** Six digits that no step inside the verification window can produce. */
  function wrongCode(secret: string): string {
    const step = timeStepAt(Date.now());
    const accepted = new Set([-2, -1, 0, 1, 2].map((d) => generateTotpForStep(secret, step + d)));
    for (let n = 0; ; n += 1) {
      const candidate = String(n).padStart(6, '0');
      if (!accepted.has(candidate)) return candidate;
    }
  }

  describe('an enrolled account', () => {
    it('cannot exchange its challenge token for a session without a verified code', async () => {
      const { email, secret } = await enrolledAccount('challenge');

      const login = await signIn(email);
      expect(login.status).toBe(200);
      expect(login.body).toMatchObject({ mfaRequired: true, mfaEnrolled: true });
      const challengeToken = login.body.challengeToken as string;

      // Every endpoint that accepts a challenge token, offered this one without a
      // valid code. `complete-enrolment` is kept on the list after its removal so
      // that bringing it back fails here.
      const attempts: Array<[string, Record<string, unknown>]> = [
        ['/auth/mfa/complete-enrolment', { challengeToken, code: 'enrolled' }],
        ['/auth/mfa/activate', { challengeToken, code: wrongCode(secret) }],
        ['/auth/mfa/verify', { challengeToken, code: wrongCode(secret) }],
      ];
      for (const [path, body] of attempts) {
        const res = await api.post(path, undefined, body);
        expect({ path, accessToken: res.body?.accessToken }).toEqual({
          path,
          accessToken: undefined,
        });
        expect(res.status).toBeGreaterThanOrEqual(400);
      }

      // The token itself was good: with a real code it does sign in, so the
      // refusals above were about the missing code, not a dead token.
      const verified = await api.post('/auth/mfa/verify', undefined, {
        challengeToken,
        code: currentCode(secret),
      });
      expect(verified.status).toBe(200);
      expect(verified.body.accessToken).toEqual(expect.any(String));
    });
  });

  describe('wrong codes', () => {
    it('lock the account even when a correct password is entered between them', async () => {
      const { email, secret } = await enrolledAccount('lockout');

      // One wrong code per sign-in, each sign-in starting from the correct
      // password — the spread that a password-triggered reset would hide.
      let lastChallenge = '';
      for (let attempt = 1; attempt <= maxFailedAttempts; attempt += 1) {
        const login = await signIn(email);
        expect({ attempt, status: login.status }).toEqual({ attempt, status: 200 });
        lastChallenge = login.body.challengeToken as string;

        const wrong = await api.post('/auth/mfa/verify', undefined, {
          challengeToken: lastChallenge,
          code: wrongCode(secret),
        });
        expect(wrong.status).toBe(401);
      }

      const locked = await signIn(email);
      expect(locked.status).toBe(422);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');

      // A challenge issued before the lock does not get round it, even with the
      // right code.
      const late = await api.post('/auth/mfa/verify', undefined, {
        challengeToken: lastChallenge,
        code: currentCode(secret),
      });
      expect(late.status).toBe(422);
      expect(late.body.code).toBe('ACCOUNT_LOCKED');
      expect(late.body.accessToken).toBeUndefined();
    });

    it('stop counting once a sign-in completes', async () => {
      const { email, secret } = await enrolledAccount('reset');

      const missOnce = async (): Promise<void> => {
        const login = await signIn(email);
        expect(login.status).toBe(200);
        const wrong = await api.post('/auth/mfa/verify', undefined, {
          challengeToken: login.body.challengeToken,
          code: wrongCode(secret),
        });
        expect(wrong.status).toBe(401);
      };

      // One short of the limit, then a real sign-in, then one short again: the
      // completed sign-in is what clears the count, so this never locks.
      for (let i = 1; i < maxFailedAttempts; i += 1) await missOnce();

      const login = await signIn(email);
      const session = await api.post('/auth/mfa/verify', undefined, {
        challengeToken: login.body.challengeToken,
        code: currentCode(secret),
      });
      expect(session.status).toBe(200);

      for (let i = 1; i < maxFailedAttempts; i += 1) await missOnce();

      const stillOpen = await signIn(email);
      expect(stillOpen.status).toBe(200);
      expect(stillOpen.body.mfaRequired).toBe(true);
    });
  });
});
