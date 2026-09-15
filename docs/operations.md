# Operations

## Deploying

```bash
cp .env.example .env
# Fill in POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
# FIELD_ENCRYPTION_KEY. Compose refuses to start without them.

docker compose up -d --build
docker compose run --rm --build migrate                  # apply migrations
docker compose run --rm migrate npm run db:verify        # confirm hand-written DB objects
```

Everything that needs the Prisma CLI runs through the one-off `migrate` service,
never `exec api`. The API image is pruned to production dependencies and ships
no CLI on purpose; `migrate` is built from the Dockerfile's `build` stage, which
keeps them. It sits behind the `tools` compose profile, so `up` never starts it
and it holds no long-running container.

Then create your first organisation and admin. The seed
(`docker compose run --rm migrate npm run db:seed`) creates a demo company with
known passwords — **use it to evaluate, never in production.**

### Backups

Two things must be backed up, **separately**:

1. **The database.** `pg_dump` on a schedule; test a restore.
2. **`FIELD_ENCRYPTION_KEY`.** National IDs, bank accounts and MFA secrets are
   encrypted with it. Lose it and those columns are permanently unreadable.

Storing the key in the same place as the database backup defeats the purpose of
encrypting the columns. Keep it in a secret manager.

### Upgrading

```bash
git pull
docker compose build
docker compose run --rm --build migrate
docker compose up -d
docker compose run --rm migrate npm run db:verify
```

Migrations are forward-only. Take a database backup first.

## Scheduled jobs

`ScheduledTasksService` runs nightly maintenance. Cron times are UTC, chosen to
land in the early hours of Asia/Bangkok.

| Job | Schedule (UTC) | What it does |
|---|---|---|
| `attendance-close-out` | 18:00 daily | Marks no-shows ABSENT, missing clock-outs INCOMPLETE |
| `finalise-separations` | 18:30 daily | Ends employment past the final working day, disables the login |
| `purge-expired-candidates` | 03:00 daily | PDPA: scrubs candidate PII past its retention deadline |
| `prune-expired-tokens` | weekly | Deletes sessions and reset tokens expired over 30 days |
| `leave-year-rollover` | 31 Dec | Carries the capped remainder into the next leave year |

Every job is idempotent and bounded by date, so a missed run catches up on the
next one and a double run changes nothing. A failure in one tenant is logged and
does not stop the others.

> **Running more than one API replica?** These jobs assume a single instance.
> Two replicas will both run the close-out. Either run one replica with
> scheduling enabled and the rest with it disabled, or put a Postgres advisory
> lock around each job.

## Observability

- **Logs** are structured. Every request carries a correlation id, echoed in the
  `x-request-id` header, included in every error body, and stored on the audit
  row. A user reporting a bug can hand you a request id that ties the whole
  thing together.
- **Health**: `/health/live` (process up, no DB) and `/health/ready`
  (DB + memory). Both sit outside the API prefix and are version-neutral, so
  probes point at a path that never moves.
- **Audit**: `/api/v1/audit-logs` with `audit:read`, or query `audit_logs`
  directly. It is append-only at the database level.

### What to watch

| Signal | Why |
|---|---|
| `PayrollRun.status = FAILED` | Payroll did not calculate; `failureReason` says why |
| Payroll runs with `skipped` employees | Someone has no compensation record and would be paid nothing |
| `AttendanceRecord.anomalyFlags` volume | A spike usually means a geofence is wrong, not that people are cheating |
| `AuditAction.LOGIN_FAILED` rate | Credential stuffing |
| Assistant `blockedReason` entries | Guardrails firing; each is worth reading |
| Unprocessed `outbox_events` | Only if you have wired a relay |

## Scaling

The default install is one API container and one Postgres. That comfortably
serves a few thousand employees. In order of what to do first:

1. **Postgres before anything else.** Add connection pooling (PgBouncer) and a
   read replica for reporting before splitting the app.
2. **Multiple API replicas.** Stateless except for two things: rate limiting is
   in-process (point `@nestjs/throttler` at a shared store) and scheduled jobs
   assume a single instance (see above).
3. **Object storage.** The default `local` driver writes to a container volume,
   which does not work across replicas. Implement the S3 driver in
   `StorageService` — the seam is there and throws a clear error rather than
   silently falling back to local disk.

## Migrations and the drift trap

Prisma does not know about the hand-written SQL in
`prisma/migrations/*_search_and_integrity/`: search indexes, CHECK constraints,
and the append-only triggers on `audit_logs` and `attendance_punches`.

When you run `prisma migrate dev` after changing `schema.prisma`, Prisma
compares the database to the Prisma schema and **generates DROP statements for
these objects as if they were drift.** This bit us during development: an
innocuous `migrate dev` silently dropped every search index.

So:

1. Always use `prisma migrate dev --create-only`.
2. Open the generated migration and delete any `DROP INDEX`, `DROP COLUMN` or
   `DROP TRIGGER` that targets an object from that file.
3. Apply it, then run `npm run db:verify`.

`db:verify` asserts every hand-written object still exists and fails loudly if
one went missing. It runs in CI for exactly this reason.

The lexical-search indexes are expression indexes rather than a stored generated
column, and the query computes `to_tsvector(...)` inline — so if an index does
get dropped, search degrades to a sequential scan instead of breaking outright.

## Restoring from backup

```bash
docker compose stop api web
docker compose exec -T postgres psql -U cwork -d postgres -c 'DROP DATABASE cwork;'
docker compose exec -T postgres psql -U cwork -d postgres -c 'CREATE DATABASE cwork;'
cat backup.sql | docker compose exec -T postgres psql -U cwork -d cwork
docker compose run --rm migrate npm run db:verify
docker compose start api web
```

Restore `FIELD_ENCRYPTION_KEY` to the value that was in use when the backup was
taken, or the encrypted columns will not decrypt.
