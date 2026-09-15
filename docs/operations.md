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

## Running more than one instance

Rate-limit counters are in-process by default. That is correct for a single
instance and quietly wrong for several: two replicas behind a load balancer hand
out twice the budget, and a restart forgets every counter.

```bash
THROTTLE_STORAGE=postgres
```

Counters then live in the `rate_limit_counters` table, shared by every instance,
at the cost of one round-trip per request. A nightly job clears out dead windows.
The API states which store it is using at boot:

```bash
docker compose logs api | grep -i rate-limit
# Rate-limit counters are shared through PostgreSQL
```

The **account lockout** — five wrong passwords, then fifteen minutes — is a
different mechanism and has always been shared: it lives on the user row. This
setting is about the per-client request budget.

Scheduled jobs need nothing switched on: each one takes a Postgres advisory lock
before it does anything, on every deployment, so only one instance runs it. See
[Scheduled jobs](#scheduled-jobs).

## Turning on malware scanning

Uploads are streamed to clamd before they are stored. It is off by default
because it needs one to talk to, and the API logs which mode it is in at every
boot — a deployment can never quietly believe it is scanning when it is not.

```bash
docker compose --profile av up -d clamav
```

Then in `.env`:

```bash
MALWARE_SCAN_ENABLED=true
CLAMAV_HOST=clamav
```

The image downloads its signature database on first start, which takes a few
minutes; the healthcheck allows for it. The database lives in the `clamav-db`
volume, so a restart does not re-download it.

Check it took:

```bash
docker compose logs api | grep -i malware
# Malware scanning enabled — clamd at clamav:3310 answered PING
```

**While clamd is unreachable, uploads are held rather than passed.** They are
recorded as `PENDING` and refused on download; an hourly job rescans them, so an
outage costs a delay rather than a lost file. If you see uploads stuck at
`PENDING`, clamd is the first place to look.

## Requiring two-factor authentication

Accounts holding `employee:read:sensitive`, `payroll:run`, `payroll:approve` or
`role:manage` must carry a second factor — that is not configurable, and they
cannot sign in without one.

To require it of *everyone*, set `security.requireMfa` in the organisation's
`settings`:

```sql
UPDATE organizations
SET settings = jsonb_set(settings, '{security,requireMfa}', 'true', true)
WHERE code = 'YOUR_ORG';
```

Anyone not yet enrolled is walked through enrolment at their next sign-in rather
than locked out. Note that the mobile app can present a code but cannot yet
enrol one — see CW-021 in the backlog — so turning this on organisation-wide
while field staff have no console access will strand them.

## Scheduled jobs

`ScheduledTasksService` runs nightly maintenance. Cron times are UTC, chosen to
land in the early hours of Asia/Bangkok.

| Job | Schedule (UTC) | What it does |
|---|---|---|
| `attendance-close-out` | 18:00 daily | Marks no-shows ABSENT, missing clock-outs INCOMPLETE |
| `finalise-separations` | 18:30 daily | Ends employment past the final working day, disables the login |
| `purge-expired-candidates` | 03:00 daily | PDPA: scrubs candidate PII past its retention deadline |
| `purge-rate-limit-counters` | 04:00 daily | Clears dead windows from the shared rate-limit table |
| `rescan-pending-files` | hourly | Gives a verdict to uploads stored while clamd was unreachable |
| `prune-expired-tokens` | weekly | Deletes sessions and reset tokens expired over 30 days |
| `leave-year-rollover` | 31 Dec | Carries the capped remainder into the next leave year |

Every job is idempotent and bounded by date, so a missed run catches up on the
next one and a double run changes nothing. A failure in one tenant is logged and
does not stop the others.

### More than one replica

Every replica runs this same schedule, so each job takes a **Postgres advisory
lock** before it starts and the instances that do not get it stand down:

```bash
docker compose logs api | grep -i "held by another instance"
# [JobLockService] [attendance-close-out] held by another instance — skipped
```

Nothing to configure and nothing to run — the lock lives in the database that is
already there. Idempotence is what makes a duplicate run harmless; the lock is
what stops it happening, along with the duplicated audit rows, notifications and
write-write races that come of three instances doing identical work at once.

There is no lease to renew and no heartbeat, because the lock is scoped to a
database transaction: an instance killed mid-job loses its connection and
Postgres releases the lock on its own. What it does mean is that the job runs
with a transaction held open, so `JOB_LOCK_TIMEOUT_MS` (15 minutes by default)
bounds how long that can last. A job that runs past it loses the lock while
still working and says so:

```
[attendance-close-out] ran past JOB_LOCK_TIMEOUT_MS (900000ms) and lost its lock
```

Raise it for an organisation large enough that the nightly close-out genuinely
takes longer. An open transaction also holds back vacuum for its duration, which
is the reason not to simply set it to an hour and forget.

## The outbox

Anything that has to leave the system — an email, a push, a webhook — is not
sent by the code that caused it. That code writes an **outbox event in its own
transaction**, and `OutboxDispatcher` relays it afterwards:

| | |
|---|---|
| `OUTBOX_POLL_MS` | How often each instance polls. `0` switches dispatch off here. Default 5000 |
| `OUTBOX_BATCH_SIZE` | Events claimed per poll, dispatched in one transaction. Default 20 |
| `OUTBOX_MAX_ATTEMPTS` | Failures before an event is parked as a dead letter. Default 8 |
| `OUTBOX_RETENTION_DAYS` | How long delivered events are kept. Default 14 |

Writing the row and sending the message in one transaction is the only way to
make them atomic, so both go into PostgreSQL and the second becomes a message
later. A transaction that rolls back takes its events with it; a process that
dies after committing leaves them to whoever is alive next.

**Every replica polls.** Unlike the scheduled tasks, which take a lock so
exactly one instance runs them, the claim here is
`SELECT … FOR UPDATE SKIP LOCKED`: each dispatcher takes rows nobody else holds
and walks past the rest, so three instances drain three times faster instead of
fighting. A queue is meant to be shared; there is no "twice" to avoid when every
row has one owner.

Delivery is **at least once**. A handler may be called again after a failure
elsewhere in its batch, so handlers have to be safe to repeat. Exactly-once
would mean a distributed transaction with whatever is on the other end, which is
not something an HRIS should be buying.

### When something is not being delivered

```sql
-- Owed but not yet delivered
SELECT "eventType", count(*) FROM outbox_events
 WHERE "processedAt" IS NULL AND "failedAt" IS NULL GROUP BY 1;

-- Dead letters, newest first: the message somebody was owed and never got
SELECT id, "eventType", attempts, "lastError", "failedAt" FROM outbox_events
 WHERE "failedAt" IS NOT NULL ORDER BY "failedAt" DESC LIMIT 20;
```

Retries back off from 30 seconds, doubling, capped at 30 minutes. After
`OUTBOX_MAX_ATTEMPTS` the event is parked with `failedAt` set and is never
claimed again. Dead letters are **not** purged by the nightly job — only
delivered events are — because that row is the only record that a message was
owed and missed. To replay one after fixing the cause:

```sql
UPDATE outbox_events
   SET "failedAt" = NULL, attempts = 0, "nextAttemptAt" = now()
 WHERE id = '…';
```

An event type nobody has registered a handler for is marked delivered rather
than retried, and the API logs at boot which types have listeners. That is why a
deployment with no email provider configured does not slowly fill this table.

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
2. **Multiple API replicas.** Stateless once rate limiting is shared
   (`THROTTLE_STORAGE=postgres`); scheduled jobs already elect one instance per
   run by themselves (see above).
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
