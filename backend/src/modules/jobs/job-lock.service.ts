import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { PrismaService } from '../../core/prisma/prisma.service';
import { JOB_LOCK_NAMESPACE, lockIdFor, type JobName } from './domain/job-locks';

export type JobLockOutcome = 'ran' | 'skipped' | 'failed';

/** Prisma's code for an interactive transaction that outlived its timeout. */
const TRANSACTION_EXPIRED = 'P2028';

/**
 * Runs a scheduled task on one instance at a time.
 *
 * Every replica of the API runs the same cron schedule, so without this the
 * nightly work happens once per replica: the same close-out written three
 * times, three scans of the same held files, three passes over the same
 * candidates. Most of it is idempotent by design and survives that; what does
 * not survive is the cost, the duplicated audit and notification rows, and the
 * write-write races between instances doing identical work at the same instant.
 *
 * The lock is a **Postgres transaction-scoped advisory lock**, which is the
 * cheapest correct answer available: no table, no migration, no lease to renew,
 * and — the part that matters — nothing to clean up. An instance that is killed
 * mid-task loses its connection, Postgres rolls the transaction back, and the
 * lock is gone. That is why there is no heartbeat here: a heartbeat exists to
 * detect a holder that died, and a lock the database releases on its own has
 * nothing to detect.
 *
 * The cost is that the lock is only held as long as the transaction is open, so
 * the task runs inside one. It holds a connection and a snapshot for the
 * duration, which delays vacuum a little; `JOB_LOCK_TIMEOUT_MS` bounds that.
 *
 * That transaction is a lock holder and **not** a unit of work. The task's own
 * writes go through the ordinary client on another connection, so they are not
 * rolled back with it — a task that needs its writes to be atomic still has to
 * say so itself, exactly as it did before.
 */
@Injectable()
export class JobLockService {
  private readonly logger = new Logger(JobLockService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: RootConfig,
  ) {}

  /**
   * Runs `work` if this instance can take `name`'s lock, and does nothing at
   * all if another instance holds it.
   *
   * Never throws. A scheduled task has nobody to report to, and an unhandled
   * rejection out of a cron callback takes the process with it under Node's
   * default policy — so a failure is logged and returned, not raised.
   */
  async runExclusively(name: JobName, work: () => Promise<void>): Promise<JobLockOutcome> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(${JOB_LOCK_NAMESPACE}::int, ${lockIdFor(name)}::int)
              AS locked
          `;

          // `pg_try_advisory_xact_lock` never waits: it either takes the lock
          // or tells us somebody else has it. A skipped run is the normal,
          // expected outcome on every instance but one.
          if (rows[0]?.locked !== true) {
            this.logger.log(`[${name}] held by another instance — skipped`);
            return 'skipped';
          }

          await work();
          return 'ran';
        },
        { timeout: this.config.jobs.lockTimeoutMs, maxWait: 10_000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === TRANSACTION_EXPIRED
      ) {
        this.logger.error(
          `[${name}] ran past JOB_LOCK_TIMEOUT_MS (${this.config.jobs.lockTimeoutMs}ms) and lost ` +
            'its lock while still working. Raise the timeout, or give the task less to do per run.',
        );
        return 'failed';
      }

      this.logger.error(`[${name}] failed`, error instanceof Error ? error.stack : String(error));
      return 'failed';
    }
  }
}
