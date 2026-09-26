// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared rate limiting across instances (CW-003).
 *
 * The acceptance criterion is about two API instances sharing one store, so
 * this boots two complete applications — what two replicas behind a load
 * balancer are — and sends requests alternately at both. With the counters in
 * memory each keeps its own budget and the deployment hands out twice what it
 * advertises; with them in PostgreSQL the budget belongs to the deployment.
 *
 * One correction this suite makes concrete, because the original ticket
 * conflated two mechanisms: the *account lockout* was never per-instance. It
 * has always lived in `users.failedLoginCount` / `users.lockedUntil`, so it is
 * shared whatever the throttler does. What was per-instance is the per-client
 * request budget — the thing that catches a caller no single account lockout
 * would notice, such as one wrong password each against a hundred accounts.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type TestContext } from './utils/test-app';

/** Small enough to exhaust quickly, large enough to interleave two instances. */
const LIMIT = 5;

const EMPLOYEE = 'dev2@cwork.example';

describe('Shared rate limiting (e2e)', () => {
  describe('with the counters in PostgreSQL', () => {
    let instanceA: TestContext;
    let instanceB: TestContext;
    let token: string;

    beforeAll(async () => {
      const env = { THROTTLE_STORAGE: 'postgres', THROTTLE_LIMIT: String(LIMIT) };
      instanceA = await createTestApp({ env });
      instanceB = await createTestApp({ env });

      // Signing in spends budget of its own; take the token first, then start
      // from an empty table so the arithmetic below is about this test only.
      token = await instanceA.api.token(EMPLOYEE);
      await instanceA.app.get(PrismaService).rateLimitCounter.deleteMany();
    });

    afterAll(async () => {
      // Reverse order: each app restores the environment it captured, so the
      // last one created must be the first one closed.
      await instanceB?.close();
      await instanceA?.close();
    });

    it('spends one budget across both instances, not one each', async () => {
      const statuses: number[] = [];

      // Alternate, so neither instance sees more than half the traffic. With
      // in-memory counters both would still have budget left at the end.
      for (let attempt = 0; attempt < LIMIT; attempt += 1) {
        const target = attempt % 2 === 0 ? instanceA : instanceB;
        statuses.push((await target.api.get('/employees?limit=1', token)).status);
      }

      expect(statuses).toEqual(Array(LIMIT).fill(200));

      const overBudget = await instanceB.api.get('/employees?limit=1', token);
      expect(overBudget.status).toBe(429);
    });

    it('keeps refusing on the other instance too', async () => {
      // The block belongs to the caller, not to whichever replica saw them last.
      const onA = await instanceA.api.get('/employees?limit=1', token);

      expect(onA.status).toBe(429);
    });

    it('holds the counter in the database rather than in a process', async () => {
      const counters = await instanceA.app.get(PrismaService).rateLimitCounter.findMany();

      const blocked = counters.find((c) => c.blockedUntil !== null);
      expect(blocked).toBeDefined();
      expect(blocked!.hits).toBeGreaterThan(LIMIT);
      // The key carries the throttler name, so a tight limit on one route
      // cannot spend a loose one's budget.
      expect(blocked!.key.startsWith('default:')).toBe(true);
    });
  });

  describe('with the default in-memory storage', () => {
    let soloA: TestContext;
    let soloB: TestContext;
    let token: string;

    beforeAll(async () => {
      // Stated rather than inherited: what this block contrasts is the storage,
      // so it should not depend on what the previous one left behind.
      const env = { THROTTLE_STORAGE: 'memory', THROTTLE_LIMIT: String(LIMIT) };
      soloA = await createTestApp({ env });
      soloB = await createTestApp({ env });
      token = await soloA.api.token(EMPLOYEE);
    });

    afterAll(async () => {
      await soloB?.close();
      await soloA?.close();
    });

    it('gives each instance a budget of its own — the bug, demonstrated', async () => {
      // Kept as a test rather than a comment: this is what a multi-instance
      // deployment gets by default, and the reason the setting exists.
      for (let attempt = 0; attempt < LIMIT + 2; attempt += 1) {
        await soloA.api.get('/employees?limit=1', token);
      }
      expect((await soloA.api.get('/employees?limit=1', token)).status).toBe(429);

      // The second instance has never heard of this caller.
      expect((await soloB.api.get('/employees?limit=1', token)).status).toBe(200);
    });
  });
});
