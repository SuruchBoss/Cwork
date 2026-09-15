/**
 * Shared rate-limit counters, for deployments running more than one instance.
 *
 * `@nestjs/throttler` ships an in-memory store, which is correct for a single
 * process and quietly wrong for two: N replicas hand out N times the budget,
 * and a restart forgets every counter. This keeps them in PostgreSQL — the
 * database is already there, so nothing new has to be run or backed up.
 *
 * Reproducing the in-memory semantics exactly matters, because the guard reads
 * only `isBlocked`:
 *
 *   - each hit inside the window increments the count;
 *   - the hit that takes the count past the limit sets a block;
 *   - while blocked the count is frozen and every request is refused;
 *   - once the block expires the window starts again at one hit.
 *
 * The whole read-modify-write is one `INSERT … ON CONFLICT DO UPDATE`, so two
 * instances racing on the same key cannot both decide they were first.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { PrismaService } from '../prisma/prisma.service';

/** One counter row, as the upsert returns it. */
export interface RateLimitRow {
  hits: number;
  expiresAt: Date;
  blockedUntil: Date | null;
}

/**
 * Turns a stored row into what the guard expects.
 *
 * Split out from the SQL so the arithmetic — seconds, rounding, what counts as
 * blocked — can be tested without a database. `@nestjs/throttler` takes its
 * inputs in milliseconds and reports back in whole seconds.
 */
export function toStorageRecord(row: RateLimitRow, nowMs: number): ThrottlerStorageRecord {
  const blockedUntilMs = row.blockedUntil?.getTime() ?? 0;
  const isBlocked = blockedUntilMs > nowMs;

  return {
    totalHits: row.hits,
    timeToExpire: Math.max(0, Math.ceil((row.expiresAt.getTime() - nowMs) / 1000)),
    isBlocked,
    timeToBlockExpire: isBlocked ? Math.max(0, Math.ceil((blockedUntilMs - nowMs) / 1000)) : 0,
  };
}

/**
 * The key a counter is stored under.
 *
 * The guard may reuse one tracker across several named throttlers, so the name
 * belongs in the key — otherwise a tight limit on sign-in and a loose global one
 * would share a single counter.
 */
export function counterKey(key: string, throttlerName: string): string {
  return `${throttlerName}:${key}`;
}

@Injectable()
export class PostgresThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(PostgresThrottlerStorage.name);

  constructor(private readonly prisma: PrismaService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const storedKey = counterKey(key, throttlerName);

    try {
      const rows = await this.prisma.$queryRaw<RateLimitRow[]>`
        INSERT INTO rate_limit_counters AS c ("key", "hits", "expiresAt", "blockedUntil")
        VALUES (
          ${storedKey},
          1,
          now() + make_interval(secs => ${ttl}::double precision / 1000),
          NULL
        )
        ON CONFLICT ("key") DO UPDATE SET
          -- Frozen while blocked; reset when the block or the window has run
          -- out; otherwise one more hit in the current window.
          "hits" = CASE
            WHEN c."blockedUntil" > now() THEN c."hits"
            WHEN c."blockedUntil" IS NOT NULL OR c."expiresAt" <= now() THEN 1
            ELSE c."hits" + 1
          END,
          "expiresAt" = CASE
            WHEN c."blockedUntil" > now() THEN c."expiresAt"
            WHEN c."blockedUntil" IS NOT NULL OR c."expiresAt" <= now()
              THEN now() + make_interval(secs => ${ttl}::double precision / 1000)
            ELSE c."expiresAt"
          END,
          "blockedUntil" = CASE
            WHEN c."blockedUntil" > now() THEN c."blockedUntil"
            -- Repeats the hit calculation above: a SET item cannot read another
            -- one's result, and one statement is worth the duplication.
            WHEN (
              CASE
                WHEN c."blockedUntil" IS NOT NULL OR c."expiresAt" <= now() THEN 1
                ELSE c."hits" + 1
              END
            ) > ${limit}
              THEN now() + make_interval(secs => ${blockDuration}::double precision / 1000)
            ELSE NULL
          END
        RETURNING "hits", "expiresAt", "blockedUntil"
      `;

      const row = rows[0];
      if (!row) throw new Error('rate limit upsert returned no row');
      return toStorageRecord(row, Date.now());
    } catch (error) {
      // A rate limiter that cannot reach its store must not lock everyone out
      // of an otherwise healthy system. Fail open, and say so loudly enough to
      // be noticed — the database being unreachable is not a small problem.
      this.logger.error(
        `Rate-limit store unavailable, allowing the request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
