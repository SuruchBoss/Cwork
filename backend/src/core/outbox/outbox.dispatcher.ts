import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { APP_CONFIG } from '../config/config.module';
import type { RootConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { isExhausted, nextAttemptAt } from './domain/retry-schedule';
import { OutboxRegistry, type OutboxEventRecord } from './outbox.registry';

/** The name the poll timer is registered under, so it can be found and cleared. */
export const OUTBOX_INTERVAL = 'outbox-dispatch';

/**
 * Longest a single handler may take before the dispatcher moves on without it.
 *
 * Not a knob, because the number only has to be larger than any reasonable
 * send and smaller than "for ever". Without it one hung SMTP connection holds
 * the claim transaction open and the whole outbox stops, quietly.
 */
const HANDLER_TIMEOUT_MS = 30_000;

/** Enough of a failure to diagnose it, not enough to bloat the row. */
const MAX_ERROR_LENGTH = 1000;

interface ClaimedRow {
  id: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
}

export interface DrainResult {
  claimed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
}

/**
 * Relays outbox events to whoever registered for them.
 *
 * A batch is claimed with `FOR UPDATE SKIP LOCKED`, which is what makes this
 * safe to run on every instance at once: each dispatcher takes rows nobody else
 * holds and walks straight past the rest, so N instances drain N times faster
 * instead of fighting. That is the opposite of the scheduled tasks in
 * `ScheduledTasksService`, which take a lock so exactly one instance runs them
 * — the difference is that a queue is *meant* to be shared, and there is no
 * "twice" to avoid when every row has one owner.
 *
 * The claim is held for the length of the dispatch. That keeps a crashed
 * instance from stranding its batch — the transaction rolls back, the locks
 * go, and the rows are simply pending again — at the cost of a transaction open
 * for as long as the batch takes. `OUTBOX_BATCH_SIZE` and the handler timeout
 * are what bound that.
 *
 * Delivery is **at least once**. A handler that succeeds inside a batch whose
 * later work fails will be called again on the retry, so handlers must be safe
 * to repeat. Exactly-once would mean a distributed transaction with whatever is
 * on the other end, which is not something an HRIS should be buying.
 */
@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxRegistry,
    private readonly schedule: SchedulerRegistry,
    @Inject(APP_CONFIG) private readonly config: RootConfig,
  ) {}

  onModuleInit(): void {
    const { pollMs, batchSize } = this.config.outbox;

    if (pollMs === 0) {
      this.logger.warn('Outbox dispatch is off (OUTBOX_POLL_MS=0) — events will accumulate');
      return;
    }

    // Registered here rather than with `@Interval`, because a decorator is
    // evaluated at import time and would freeze whatever the environment
    // happened to hold then — the same trap `@Throttle` set in CW-003.
    const timer = setInterval(() => void this.tick(), pollMs);
    this.schedule.addInterval(OUTBOX_INTERVAL, timer);

    this.logger.log(`Outbox dispatch every ${pollMs}ms, up to ${batchSize} events a time`);
  }

  /**
   * Said once everything has registered, which `onModuleInit` is too early for.
   *
   * Worth saying out loud: an event type with no listener is marked delivered
   * and dropped, so "no handlers registered" is the difference between a
   * deployment that sends email and one that silently does not.
   */
  onApplicationBootstrap(): void {
    const types = this.registry.subscribedTypes();

    if (types.length === 0) {
      this.logger.warn(
        'No outbox handlers registered — events will be marked delivered and discarded',
      );
      return;
    }
    this.logger.log(`Outbox handlers registered for: ${types.join(', ')}`);
  }

  onModuleDestroy(): void {
    if (this.schedule.doesExist('interval', OUTBOX_INTERVAL)) {
      this.schedule.deleteInterval(OUTBOX_INTERVAL);
    }
  }

  /**
   * One poll. Skips its turn while a previous drain is still going, so a slow
   * provider makes the queue late rather than making it pile up.
   */
  private async tick(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      await this.drainOnce();
    } catch (error) {
      // Reaching here means the claim itself failed — the database is
      // unreachable, say. The next tick will try again.
      this.logger.error(
        'Outbox drain failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.draining = false;
    }
  }

  /** Claims one batch and dispatches it. Exposed so tests can drive it. */
  async drainOnce(): Promise<DrainResult> {
    const result: DrainResult = { claimed: 0, delivered: 0, retried: 0, deadLettered: 0 };

    await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<ClaimedRow[]>`
          SELECT id, "organizationId", "eventType", "aggregateType", "aggregateId",
                 payload, "occurredAt", attempts
            FROM outbox_events
           WHERE "processedAt" IS NULL
             AND "failedAt" IS NULL
             AND "nextAttemptAt" <= now()
           ORDER BY "occurredAt"
           LIMIT ${this.config.outbox.batchSize}
             FOR UPDATE SKIP LOCKED
        `;

        result.claimed = rows.length;

        for (const row of rows) {
          const outcome = await this.dispatch(row);

          if (outcome.ok) {
            await tx.outboxEvent.update({
              where: { id: row.id },
              data: { processedAt: new Date(), lastError: null },
            });
            result.delivered += 1;
            continue;
          }

          const attempts = row.attempts + 1;
          const lastError = outcome.error.slice(0, MAX_ERROR_LENGTH);

          if (isExhausted(attempts, this.config.outbox.maxAttempts)) {
            await tx.outboxEvent.update({
              where: { id: row.id },
              data: { attempts, lastError, failedAt: new Date() },
            });
            result.deadLettered += 1;
            this.logger.error(
              `[${row.eventType} ${row.id}] gave up after ${attempts} attempts: ${lastError}`,
            );
            continue;
          }

          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { attempts, lastError, nextAttemptAt: nextAttemptAt(attempts, new Date()) },
          });
          result.retried += 1;
          this.logger.warn(`[${row.eventType} ${row.id}] attempt ${attempts} failed: ${lastError}`);
        }
      },
      { timeout: this.config.outbox.batchSize * HANDLER_TIMEOUT_MS + 10_000, maxWait: 10_000 },
    );

    return result;
  }

  /**
   * Runs every handler for one event.
   *
   * A handler that throws fails the event, and a handler that hangs fails it
   * too — both come back as a retry rather than as a dispatcher that stopped.
   * Errors are caught here rather than left to the caller so that one bad event
   * cannot take its whole batch down with it.
   */
  private async dispatch(row: ClaimedRow): Promise<{ ok: true } | { ok: false; error: string }> {
    const handlers = this.registry.handlersFor(row.eventType);

    if (handlers.length === 0) {
      // Nobody is listening. That is a delivered event, not a stuck one: the
      // alternative is a queue that fills up with events no build of the
      // application has ever wanted.
      this.logger.debug(`[${row.eventType} ${row.id}] no handlers — nothing to deliver`);
      return { ok: true };
    }

    const event: OutboxEventRecord = {
      id: row.id,
      organizationId: row.organizationId,
      eventType: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      payload: row.payload,
      occurredAt: row.occurredAt,
      attempts: row.attempts,
    };

    for (const handler of handlers) {
      try {
        await withTimeout(handler(event), HANDLER_TIMEOUT_MS, row.eventType);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    return { ok: true };
  }
}

/**
 * Gives up on a promise after `ms`.
 *
 * The abandoned work carries on — there is no way to cancel a promise — so this
 * frees the dispatcher rather than the handler. That is the useful half: the
 * batch is released, the event is retried later, and the queue is not held
 * hostage by one connection nobody is going to answer.
 */
async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Handler for ${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
