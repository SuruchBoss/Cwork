// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Scheduled jobs run once across the fleet (CW-007).
 *
 * CW-003 made more than one instance a supported configuration; this is the
 * other half of it. Every replica runs the same cron schedule, so before this
 * ticket the nightly work happened once per replica.
 *
 * Three complete applications are booted against one database — what three
 * replicas behind a load balancer are — and the tests never rely on timing to
 * decide who wins. Where a race would otherwise be the whole point, the test
 * takes the lock itself and holds it, so "the other instances stood down" is an
 * assertion rather than a hope.
 *
 * One correction the suite makes concrete. The ticket asked for "a heartbeat so
 * a crashed holder does not block the next run" and said a double run would
 * grant leave quota twice. Neither survives contact with the code:
 *
 *  - Every task here was already written to be idempotent — `rolloverYear`
 *    *assigns* the carried balance rather than adding to it, separations are
 *    filtered by status, the purges are `deleteMany`. A second run does not
 *    double anything. What it does is duplicate the *work*, the audit and
 *    notification rows, and the write-write races.
 *  - A transaction-scoped advisory lock has nothing to heartbeat. A holder that
 *    dies loses its connection and Postgres releases the lock; that is the
 *    reason to prefer it over a lease table, not a gap in it.
 */
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { FilesService } from 'src/modules/files/files.service';
import { JOB_LOCKS, JOB_LOCK_NAMESPACE } from 'src/modules/jobs/domain/job-locks';
import { JobLockService, type JobLockOutcome } from 'src/modules/jobs/job-lock.service';
import { ScheduledTasksService } from 'src/modules/jobs/scheduled-tasks.service';
import { startFakeClamd, type FakeClamd } from './utils/fake-clamd';
import { createTestApp, type TestContext } from './utils/test-app';

const UPLOADER = 'dev2@cwork.example';

const CLEAN_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'ascii',
);

/** Polls until a condition holds, so no test has to guess at a sleep. */
async function until(condition: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Scheduled job locking (e2e)', () => {
  let clamd: FakeClamd;
  let instances: TestContext[];
  let locks: JobLockService[];
  let tasks: ScheduledTasksService[];

  beforeAll(async () => {
    clamd = await startFakeClamd({ kind: 'scan' });

    const env = {
      MALWARE_SCAN_ENABLED: 'true',
      CLAMAV_HOST: '127.0.0.1',
      CLAMAV_PORT: String(clamd.port),
      CLAMAV_TIMEOUT_MS: '1500',
    };

    instances = [];
    for (let i = 0; i < 3; i += 1) instances.push(await createTestApp({ env }));

    locks = instances.map((i) => i.app.get(JobLockService));
    tasks = instances.map((i) => i.app.get(ScheduledTasksService));
  });

  afterAll(async () => {
    // Reverse order: each app restores the environment it captured, so the last
    // one created is the first one closed.
    for (const instance of [...(instances ?? [])].reverse()) await instance?.close();
    await clamd?.close();
  });

  /**
   * Takes a job's lock from the test itself and holds it until released.
   *
   * This is what makes "the others stood down" provable instead of likely: the
   * lock is definitely held before a single instance is asked to run.
   */
  async function holdLockFor(job: keyof typeof JOB_LOCKS): Promise<() => Promise<void>> {
    const prisma = instances[0].app.get(PrismaService);

    let acquired!: () => void;
    let failed!: (error: unknown) => void;
    let release!: () => void;
    const isAcquired = new Promise<void>((resolve, reject) => {
      acquired = resolve;
      failed = reject;
    });
    const canRelease = new Promise<void>((resolve) => (release = resolve));

    const holding = prisma
      .$transaction(
        async (tx) => {
          // `pg_advisory_xact_lock` returns void, which Prisma cannot read
          // back; the `try` variant returns a boolean and tells us plainly
          // whether the test is holding what it thinks it is.
          const rows = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(${JOB_LOCK_NAMESPACE}::int, ${JOB_LOCKS[job]}::int)
              AS locked
          `;
          if (rows[0]?.locked !== true) throw new Error(`Could not take the ${job} lock`);
          acquired();
          await canRelease;
        },
        { timeout: 30_000, maxWait: 10_000 },
      )
      // Without this a failure inside the transaction would hang the await
      // below rather than failing the test.
      .catch((error: unknown) => {
        failed(error);
        release();
      });

    await isAcquired;
    return async () => {
      release();
      await holding;
    };
  }

  describe('three instances, one run', () => {
    it('lets exactly one of them through and turns the other two away', async () => {
      const ran: number[] = [];
      const outcomes: (JobLockOutcome | undefined)[] = [undefined, undefined, undefined];

      // The winner blocks on this gate, so the losers are guaranteed to be
      // asking for the lock while it is genuinely held.
      let open!: () => void;
      const gate = new Promise<void>((resolve) => (open = resolve));

      const running = locks.map((lock, index) =>
        lock
          .runExclusively('prune-expired-tokens', async () => {
            ran.push(index);
            await gate;
          })
          .then((outcome) => {
            outcomes[index] = outcome;
            return outcome;
          }),
      );

      // Only release once both losers have definitively stood down — otherwise
      // a straggler could take the lock after the winner hands it back and the
      // test would be measuring its own scheduling, not the lock.
      await until(
        () => outcomes.filter((o) => o === 'skipped').length === 2,
        'two instances to stand down',
      );
      open();

      const settled = await Promise.all(running);

      expect(settled.filter((o) => o === 'ran')).toHaveLength(1);
      expect(settled.filter((o) => o === 'skipped')).toHaveLength(2);
      expect(ran).toHaveLength(1);
    });

    it('hands the lock back afterwards, so the next run is not blocked for ever', async () => {
      // A lock that is never released turns a once-a-night job into a
      // once-ever job, and nothing would fail loudly when it did.
      const first = await locks[0].runExclusively('prune-expired-tokens', async () => {});
      const second = await locks[1].runExclusively('prune-expired-tokens', async () => {});

      expect([first, second]).toEqual(['ran', 'ran']);
    });

    it('releases the lock when the task throws, and does not rethrow', async () => {
      // An unhandled rejection out of a cron callback takes the process down
      // under Node's default policy, and a lock stuck behind a failed task
      // would take every later run with it.
      const failed = await locks[0].runExclusively('prune-expired-tokens', async () => {
        throw new Error('the task exploded');
      });
      const afterwards = await locks[1].runExclusively('prune-expired-tokens', async () => {});

      expect(failed).toBe('failed');
      expect(afterwards).toBe('ran');
    });

    it('does not let one job block a different one', async () => {
      const release = await holdLockFor('prune-expired-tokens');

      const other = await locks[1].runExclusively('purge-expired-candidates', async () => {});

      expect(other).toBe('ran');
      await release();
    });
  });

  describe('a real scheduled task with a visible side effect', () => {
    let pendingFileId: string;

    beforeAll(async () => {
      // A file uploaded while clamd was unreachable is held PENDING, and the
      // hourly sweep is what eventually gives it a verdict. Every scan it
      // performs is visible on the other end of the socket, which is what makes
      // "ran twice" something a test can see rather than infer.
      clamd.behaviour = { kind: 'hang' };

      const token = await instances[0].api.token(UPLOADER);
      const uploaded = await instances[0].api.upload('/files/upload', token, {
        filename: 'held.pdf',
        contentType: 'application/pdf',
        content: CLEAN_PDF,
      });

      expect(uploaded.body.scanStatus).toBe('PENDING');
      pendingFileId = uploaded.body.id;

      clamd.behaviour = { kind: 'scan' };
    });

    it('scans nothing on any instance while another holds the lock', async () => {
      const release = await holdLockFor('rescan-pending-files');
      const before = clamd.received.length;

      await Promise.all(tasks.map((task) => task.rescanPendingFiles()));

      expect(clamd.received.length).toBe(before);

      const files = instances[0].app.get(FilesService);
      const stillPending = await files.findPending();
      expect(stillPending.map((f) => f.id)).toContain(pendingFileId);

      await release();
    });

    it('scans each held file exactly once when the lock is free', async () => {
      const files = instances[0].app.get(FilesService);
      const pending = await files.findPending();
      const before = clamd.received.length;

      await Promise.all(tasks.map((task) => task.rescanPendingFiles()));

      // One scan per held file, not one per file per instance. Other suites
      // leave held files of their own behind, so the count is relative.
      expect(clamd.received.length).toBe(before + pending.length);

      const metadata = await instances[0].api.get(
        `/files/${pendingFileId}`,
        await instances[0].api.token(UPLOADER),
      );
      expect(metadata.body.scanStatus).toBe('CLEAN');
    });
  });

  describe('the wiring', () => {
    it('gives every registered cron job a lock', async () => {
      // The failure this catches is a new scheduled task that nobody thought
      // about — it would run on all three instances and nothing would say so.
      const registry = instances[0].app.get(SchedulerRegistry);
      const registered = [...registry.getCronJobs().keys()].sort();

      expect(registered).toEqual(Object.keys(JOB_LOCKS).sort());
    });

    it('makes every task ask for its own lock before doing anything', async () => {
      const lock = instances[0].app.get(JobLockService);
      const asked: string[] = [];
      const spy = jest
        .spyOn(lock, 'runExclusively')
        .mockImplementation(async (name): Promise<JobLockOutcome> => {
          asked.push(name);
          return 'skipped';
        });

      const task = tasks[0];
      await task.purgeRateLimitCounters();
      await task.rescanPendingFiles();
      await task.closeOutAttendance();
      await task.finaliseSeparations();
      await task.purgeCandidates();
      await task.purgeEmployees();
      await task.pruneExpiredTokens();
      await task.rolloverLeaveYear();
      await task.purgeDeliveredOutbox();

      spy.mockRestore();

      // `purge-rate-limit-counters` is absent on purpose: it returns before
      // taking a lock when the counters are in memory, which is the default
      // here. Taking out a transaction to discover there is nothing to do is
      // the one thing worth skipping.
      expect(asked.sort()).toEqual(
        Object.keys(JOB_LOCKS)
          .filter((name) => name !== 'purge-rate-limit-counters')
          .sort(),
      );
    });
  });
});
