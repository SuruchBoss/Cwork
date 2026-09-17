/**
 * The transactional outbox (CW-006).
 *
 * The ticket said `outbox_events` "is written transactionally and nothing reads
 * it". Half right: nothing read it, and **nothing wrote it either** — the table
 * had been in the schema since the first migration with no producer and no
 * consumer anywhere in `src`. So this is both halves, not one.
 *
 * What is actually being tested is the three promises that make an outbox worth
 * the machinery, each of which is a silent data-loss bug when it fails:
 *
 *  1. An event written in a transaction that rolls back is never dispatched.
 *  2. One bad event does not stop the others.
 *  3. Two dispatchers running at once never deliver the same event twice.
 *
 * The third is why two complete applications are booted. Polling is off
 * throughout (`OUTBOX_POLL_MS=0`, set in the global setup) and every drain here
 * is explicit — a timer draining the same rows underneath would make "exactly
 * once" a matter of luck.
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { OutboxDispatcher } from 'src/core/outbox/outbox.dispatcher';
import { OutboxRegistry } from 'src/core/outbox/outbox.registry';
import { OutboxService } from 'src/core/outbox/outbox.service';
import {
  NOTIFICATION_RAISED,
  NotificationsService,
} from 'src/modules/notifications/notifications.service';
import { createTestApp, type TestContext } from './utils/test-app';

const EMPLOYEE = 'dev2@cwork.example';

describe('Outbox (e2e)', () => {
  let instanceA: TestContext;
  let instanceB: TestContext;
  let prisma: PrismaService;
  let outbox: OutboxService;
  let organizationId: string;

  beforeAll(async () => {
    instanceA = await createTestApp();
    instanceB = await createTestApp();

    prisma = instanceA.app.get(PrismaService);
    outbox = instanceA.app.get(OutboxService);

    const organization = await prisma.organization.findFirstOrThrow({ select: { id: true } });
    organizationId = organization.id;
  });

  afterAll(async () => {
    await instanceB?.close();
    await instanceA?.close();
  });

  beforeEach(async () => {
    // Other suites raise notifications of their own, and a drain claims
    // whatever is owed — so each case starts from an empty queue rather than
    // counting on being alone.
    await prisma.outboxEvent.deleteMany();
  });

  const record = (eventType: string, payload: Record<string, unknown> = {}) =>
    prisma.$transaction(async (tx) => {
      await outbox.record(tx, {
        organizationId,
        eventType,
        aggregateType: 'Test',
        aggregateId: 'test',
        payload,
      });
    });

  describe('what the transaction covers', () => {
    it('never dispatches an event whose transaction rolled back', async () => {
      const seen: string[] = [];
      instanceA.app
        .get(OutboxRegistry)
        .register('test.rolled-back', async (event) => void seen.push(event.id));

      await expect(
        prisma.$transaction(async (tx) => {
          await outbox.record(tx, {
            organizationId,
            eventType: 'test.rolled-back',
            aggregateType: 'Test',
            aggregateId: 'test',
            payload: {},
          });
          throw new Error('the business operation failed');
        }),
      ).rejects.toThrow('the business operation failed');

      const drained = await instanceA.app.get(OutboxDispatcher).drainOnce();

      expect(drained.claimed).toBe(0);
      expect(seen).toEqual([]);
      expect(await prisma.outboxEvent.count()).toBe(0);
    });

    it('keeps an event whose transaction committed, even with nobody listening', async () => {
      await record('test.unheard');

      // Delivered rather than stuck: a queue that fills up with events no build
      // of this application has ever wanted is a queue that stops draining.
      const drained = await instanceA.app.get(OutboxDispatcher).drainOnce();

      expect(drained).toMatchObject({ claimed: 1, delivered: 1 });
      const [event] = await prisma.outboxEvent.findMany();
      expect(event.processedAt).not.toBeNull();
    });
  });

  describe('when a handler fails', () => {
    it('does not stop the events either side of it', async () => {
      const delivered: string[] = [];
      const registry = instanceA.app.get(OutboxRegistry);
      registry.register('test.good', async (event) => void delivered.push(event.aggregateId));
      registry.register('test.bad', async () => {
        throw new Error('the provider said no');
      });

      await prisma.$transaction(async (tx) => {
        await outbox.recordMany(tx, [
          {
            organizationId,
            eventType: 'test.good',
            aggregateType: 'T',
            aggregateId: 'first',
            payload: {},
          },
          {
            organizationId,
            eventType: 'test.bad',
            aggregateType: 'T',
            aggregateId: 'second',
            payload: {},
          },
          {
            organizationId,
            eventType: 'test.good',
            aggregateType: 'T',
            aggregateId: 'third',
            payload: {},
          },
        ]);
      });

      const drained = await instanceA.app.get(OutboxDispatcher).drainOnce();

      expect(drained).toMatchObject({ claimed: 3, delivered: 2, retried: 1 });
      expect(delivered.sort()).toEqual(['first', 'third']);
    });

    it('schedules a retry rather than trying again straight away', async () => {
      instanceA.app.get(OutboxRegistry).register('test.retry', async () => {
        throw new Error('not yet');
      });

      await record('test.retry');
      await instanceA.app.get(OutboxDispatcher).drainOnce();

      const [event] = await prisma.outboxEvent.findMany();
      expect(event.attempts).toBe(1);
      expect(event.lastError).toContain('not yet');
      expect(event.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

      // A hot loop is the failure mode here: a provider that is down would be
      // asked again every poll, for as long as it stays down.
      const again = await instanceA.app.get(OutboxDispatcher).drainOnce();
      expect(again.claimed).toBe(0);
    });

    it('parks an event as a dead letter once its attempts run out', async () => {
      instanceA.app.get(OutboxRegistry).register('test.poison', async () => {
        throw new Error('this will never work');
      });

      await record('test.poison');

      const maxAttempts = 8;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        // Make the event eligible again without waiting out the backoff.
        await prisma.outboxEvent.updateMany({ data: { nextAttemptAt: new Date() } });
        await instanceA.app.get(OutboxDispatcher).drainOnce();
      }

      const [event] = await prisma.outboxEvent.findMany();
      expect(event.attempts).toBe(maxAttempts);
      expect(event.failedAt).not.toBeNull();
      expect(event.processedAt).toBeNull();

      // Parked, not deleted: this row is the only record that somebody was
      // owed a message and never got it.
      await prisma.outboxEvent.updateMany({ data: { nextAttemptAt: new Date() } });
      expect((await instanceA.app.get(OutboxDispatcher).drainOnce()).claimed).toBe(0);
    });
  });

  describe('two dispatchers at once', () => {
    it('never delivers the same event twice', async () => {
      const delivered: string[] = [];
      const handler = async (event: { aggregateId: string }): Promise<void> => {
        delivered.push(event.aggregateId);
      };
      instanceA.app.get(OutboxRegistry).register('test.shared', handler);
      instanceB.app.get(OutboxRegistry).register('test.shared', handler);

      await prisma.$transaction(async (tx) => {
        await outbox.recordMany(
          tx,
          Array.from({ length: 12 }, (_, index) => ({
            organizationId,
            eventType: 'test.shared',
            aggregateType: 'T',
            aggregateId: `event-${index}`,
            payload: {},
          })),
        );
      });

      // `FOR UPDATE SKIP LOCKED` is what makes this safe: each dispatcher takes
      // rows nobody else holds and walks past the rest, so running both is
      // faster rather than wrong.
      const [first, second] = await Promise.all([
        instanceA.app.get(OutboxDispatcher).drainOnce(),
        instanceB.app.get(OutboxDispatcher).drainOnce(),
      ]);

      expect(first.claimed + second.claimed).toBe(12);
      expect(delivered).toHaveLength(12);
      expect(new Set(delivered).size).toBe(12);
      expect(await prisma.outboxEvent.count({ where: { processedAt: null } })).toBe(0);
    });
  });

  describe("a notification inside the caller's transaction", () => {
    let userId: string;

    beforeAll(async () => {
      const user = await prisma.user.findFirstOrThrow({
        where: { email: EMPLOYEE },
        select: { id: true },
      });
      userId = user.id;
    });

    it('leaves neither the notification nor its event when the caller rolls back', async () => {
      // The gap this closes: before, the notification was written in a
      // transaction of its own *after* the business one committed, so a change
      // that rolled back could still announce itself, and a crash in between
      // lost the announcement of a change that did happen.
      const before = await prisma.notification.count({ where: { userId } });

      await expect(
        prisma.$transaction(async (tx) => {
          await instanceA.app.get(NotificationsService).notifyIn(tx, organizationId, userId, {
            type: 'test.rolled-back',
            title: 'ไม่ควรเห็นข้อความนี้',
            body: 'the business operation is about to fail',
          });
          throw new Error('the business operation failed');
        }),
      ).rejects.toThrow('the business operation failed');

      expect(await prisma.notification.count({ where: { userId } })).toBe(before);
      expect(await prisma.outboxEvent.count()).toBe(0);
    });

    it('writes both when the caller commits', async () => {
      await prisma.$transaction(async (tx) => {
        await instanceA.app.get(NotificationsService).notifyIn(tx, organizationId, userId, {
          type: 'test.committed',
          title: 'อนุมัติแล้ว',
          body: 'and the message about it survived with it',
        });
      });

      const notifications = await prisma.notification.findMany({
        where: { userId, type: 'test.committed' },
      });
      const events = await prisma.outboxEvent.findMany({
        where: { eventType: NOTIFICATION_RAISED },
      });

      expect(notifications).toHaveLength(1);
      expect(events).toHaveLength(1);
      expect(events[0].aggregateId).toBe(notifications[0].id);
    });

    it('fails the caller rather than swallowing its own error', async () => {
      // Inside a transaction there is nothing else it could do: PostgreSQL has
      // already aborted, so catching would only move the failure to the commit
      // and lose the reason on the way.
      await expect(
        prisma.$transaction(async (tx) => {
          await instanceA.app.get(NotificationsService).notifyIn(tx, 'not-a-uuid', userId, {
            type: 'test.broken',
            title: 'x',
            body: 'x',
          });
        }),
      ).rejects.toThrow();

      expect(await prisma.notification.count({ where: { type: 'test.broken' } })).toBe(0);
    });
  });

  describe('the notification producer', () => {
    it('records an event alongside every notification it writes', async () => {
      const token = await instanceA.api.token(EMPLOYEE);
      const user = await prisma.user.findFirstOrThrow({
        where: { email: EMPLOYEE },
        select: { id: true, organizationId: true },
      });

      await instanceA.app.get(NotificationsService).notify(user.organizationId, user.id, {
        type: 'test.notification',
        title: 'หัวข้อ',
        body: 'เนื้อหา',
      });

      const events = await prisma.outboxEvent.findMany({
        where: { eventType: NOTIFICATION_RAISED },
      });

      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({ userId: user.id, type: 'test.notification' });

      // The in-app row is still written synchronously — the console reads it
      // back immediately, and making that wait for a poll would be a
      // regression dressed up as architecture.
      //
      // Asserted by looking for the row, not by counting the list. The status
      // check is the point: this used to read `.length` off an unchecked body,
      // so when the request was refused the whole failure read "Expected: NaN,
      // Received: undefined" and named neither the status nor the route. And
      // `list()` takes 50, so a difference of one stops being visible as soon
      // as this account has fifty notifications.
      const after = await instanceA.api.get('/notifications', token);
      expect(after.status).toBe(200);
      expect(after.body.map((n: { type: string }) => n.type)).toContain('test.notification');
    });
  });
});
