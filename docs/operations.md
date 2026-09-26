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

### First-run setup

A freshly migrated database has no organisation and no account, and there is no
registration endpoint — by design. The only thing that can create the first
administrator is a process with shell access to the server:

```bash
docker compose run --rm migrate npm run db:init
```

It asks for an organisation name, a short code, a timezone and the first
administrator's email and password, then creates one organisation, the eight
system roles and that one account. Nothing else: no departments, no positions,
no employees.

To finish in a browser instead — which is usually nicer for typing a Thai
organisation name — ask for a token:

```bash
docker compose run --rm migrate npm run db:init -- --web
```

and open `$PUBLIC_WEB_URL/setup` with it. The token is single use, expires after
an hour, and is the only thing the wizard accepts.

**Why a token rather than "if no organisation exists, let anyone through".**
Between `docker compose up` and the moment setup finishes, a deployment is
reachable and unclaimed. A bare emptiness check would hand it to whoever found
it first — a scanner sweeping port 8080 has better odds of being first than the
person who just started the container and is still reading logs. Requiring a
token moves the credential to something only the operator has: a shell on the
server. There is no endpoint that issues one; `db:init` is the only source.

Other things worth knowing:

- **It refuses to run twice.** A database with an organisation in it — including
  a soft-deleted one — gets a refusal and no writes. So does the wizard, token
  or no token: a token minted while the install was empty is worthless once
  somebody else has finished setting it up.
- **Two wizards cannot race.** Setup runs inside a transaction holding a
  Postgres advisory lock, so the second one waits and then fails the re-check
  rather than quietly creating a second administrator.
- **Scripted installs** pass `--name`, `--code`, `--timezone`, `--email` and
  either `--password` or `CWORK_ADMIN_PASSWORD` (which keeps the password out of
  shell history and out of `ps`). Without a terminal and without those, it
  refuses rather than hanging on a prompt.
- **The first administrator holds `role:manage`**, which is on the MFA-required
  list, so its first sign-in goes through enrolment before any session exists.
  Neither the CLI nor the wizard prints a TOTP secret — the administrator enrols
  its own.
- **The account has no employee record.** It is an operator, not a member of
  staff. Create employees from the console afterwards; give the person their own
  employee account then if they need one.

### Demo data is a separate thing

`docker compose run --rm migrate npm run db:seed` creates a fictional company
with a published password and a published two-factor secret. It is for
evaluating Cwork and nothing else, it says so when it runs, and it refuses to
install itself beside an organisation it did not create (`SEED_FORCE=1`
overrides that, and you will not want to).

It runs in two halves, and `db:seed` chains them:

| | |
|---|---|
| `db:seed:base` | The org chart, policies, leave types, shifts, pay components and people. |
| `db:demo` | What that company has *done*: last month's payroll, leave that was requested and approved, expense claims, a hiring pipeline, a review cycle. |

The second half boots the application and calls the same services an HTTP
request would, rather than inserting rows. That is the whole point of it: the
payslips are produced by the real Thai tax code, the approvals are routed by the
real policy engine, and the run had to be prepared by one person and approved by
another because payroll refuses to let anyone do both. Demo data that lies about
what the product does is worse than no demo data.

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

That includes the in-app notification itself. Approving leave writes the
balance, the request, the notification and its delivery event in one commit, so
there is no state where an approval happened and nobody was told, nor one where
somebody was told about an approval that did not.

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

## Sending email and push

Nothing is sent until a relay is configured, and the API says which mode it is
in at every boot — a deployment can never quietly believe it is notifying people
when it is not:

```bash
docker compose logs api | grep -i delivery
# [DeliveryService] Email delivery on via smtp.example.com:587
# [DeliveryService] Push delivery is off (PUSH_ENABLED is false)
```

### Email

```bash
EMAIL_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURITY=starttls        # or `tls` for implicit TLS on 465
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_FROM_ADDRESS=no-reply@yourcompany.co.th
PUBLIC_WEB_URL=https://hr.yourcompany.co.th
```

`starttls` **refuses to send** if the server does not offer STARTTLS, rather
than falling back to plaintext with the relay password on the wire. `none` is
for a relay on localhost and nothing else.

`EMAIL_ENABLED=true` with no `SMTP_HOST`, or `PUSH_ENABLED=true` with any FCM
credential missing, **refuses to boot** and names every missing variable at
once. The alternative is an outbox quietly filling with dead letters days later,
over a setting somebody believes they already made.

`PUBLIC_WEB_URL` is where the button in every email points, and where the
unsubscribe link lives. An email that says something is waiting but not where is
an email that may as well not have been sent.

### Push

Firebase Cloud Messaging's HTTP v1 API. iOS goes through FCM as well — the app
registers an FCM token either way — so there is no separate APNs setup:

```bash
PUSH_ENABLED=true
FCM_PROJECT_ID=your-project
FCM_CLIENT_EMAIL=push@your-project.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

All three come from a service-account JSON key. The newlines in the private key
must be written as `\n`: a PEM with real newlines in a `.env` file is a PEM that
arrives truncated.

A device FCM reports as `UNREGISTERED` — the app was uninstalled — has its row
deleted rather than retried. Note that the employee app does not yet register a
token, so push has no devices to send to until it does.

### What is retried and what is not

| Answer | What happens |
|---|---|
| SMTP 4xx, FCM 5xx | Retried on the outbox backoff: 30s, doubling, capped at 30 minutes |
| SMTP 5xx (no such mailbox) | Dead-lettered immediately — the eighth attempt is refused for the same reason as the first |
| FCM 401/403 | Dead-lettered immediately, naming the credential problem |
| FCM `UNREGISTERED` | Device row deleted, event delivered |

Failures are visible in `outbox_events` — see [The outbox](#the-outbox) for the
queries.

### Preferences and unsubscribe

`GET /api/v1/notifications/preferences` and `PUT` the same path set a rule per
notification type, with `*` as the catch-all. A rule for a specific type wins
over the catch-all, and no rule at all means every channel is on: somebody who
has never opened the settings page should still hear that their leave was
approved.

Every email carries a `List-Unsubscribe` header and a footer link. The link is
public and signed — nobody should have to sign in to stop receiving email, which
is the difference between an unsubscribe link and a complaint to the spam
filter. It turns off **email only**; push is untouched, because the click
happened in an email and answering a question nobody asked is how preferences
become untrustworthy. In-app notifications are never affected: that row is the
record, not the message.

The signature is derived from `JWT_ACCESS_SECRET`, so rotating it invalidates
old unsubscribe links — the same bargain as rotating it signing everybody out.

## Observability

- **Logs** are one JSON object per line on stdout, in the shape the PaynEat
  ecosystem's [telemetry contract v1.1](https://github.com/SuruchBoss/PaynEat-ERP/blob/main/docs/TELEMETRY.md)
  fixes, so the same queries work across Cwork, the ERP and the POS. Nothing
  about it needs the ecosystem: it is simply a documented shape. Each line has a
  string `severity` (`DEBUG` … `CRITICAL`), a `time`, a `message`, and a
  `labels` object carrying `app` (`cwork-api`), `event` and `correlation_id`.
  - **Correlation.** Every request carries an id — the caller's `x-request-id`
    if it matches `^[\w-]{8,64}$`, otherwise a generated one — echoed in the
    response header, included in every error body, stored on the audit row, and
    the `correlation_id` of every line the request writes. A user reporting a
    bug can hand you a request id that ties the whole thing together. A W3C
    `traceparent` header is picked up as `trace`.
  - **Events.** Every request, including one a guard refuses (a 401, a 429) or
    no route matches, writes one `http.request.completed` line with the path
    (never the query string; a token in the path is written as `:token`), the
    status and the latency. A refused sign-in also writes
    `auth.sign_in.failed`; a failed outbox delivery writes
    `outbox.delivery.failed`, keyed by the event's id, at `ERROR` once it is
    dead-lettered. Everything else is `app.log`.
  - **Never logged:** passwords, tokens, MFA codes, names, email addresses,
    national IDs, bank details, salaries, request bodies, query strings. People
    are identified by internal user id. An end-to-end test puts distinctive
    values of each through the API and fails if any reaches a log line or a
    metric label.
  - `LOG_LEVEL` is the least severe line written (default `INFO`; the older
    `info`/`warn`/`debug` still work). Error stacks are written only at
    `DEBUG`, and only as frames. `LOG_FORMAT=gcp` moves `labels` and `trace` to
    the keys Google Cloud Logging reads specially
    (`logging.googleapis.com/labels`, and `logging.googleapis.com/trace` as
    `projects/$GOOGLE_CLOUD_PROJECT/traces/<id>`) and changes nothing else. Leave
    it unset anywhere else.
- **Metrics** are Prometheus text at `GET /metrics` on **`METRICS_PORT`
  (9464), never the API port**. `docker-compose.yml` does not publish it: a
  scraper reaches it on the internal network, and nothing outside should.
  Beside Node's process metrics:

  | Metric | Labels | |
  |---|---|---|
  | `http_requests_total` | `app`, `method`, `route`, `status` | `route` is the template, `/api/v1/employees/:id`, never a concrete path; `unmatched` for a path no route has |
  | `http_request_duration_seconds` | `app`, `method`, `route` | histogram |
  | `auth_sign_in_failures_total` | `app` | every refused sign-in step |
  | `outbox_pending_events` | `app`, `destination` | undelivered, not dead-lettered |
  | `outbox_oldest_pending_age_seconds` | `app`, `destination` | 0 when nothing waits |

  The two outbox gauges are read from the database at scrape time, so every
  replica reports the same backlog and a restart does not reset it. Their
  `destination` is the outbox event type (`notification.raised`), which is
  what the relay routes on.
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
| `auth_sign_in_failures_total` rate, or `AuditAction.LOGIN_FAILED` | Credential stuffing |
| Assistant `blockedReason` entries | Guardrails firing; each is worth reading |
| `outbox_oldest_pending_age_seconds` climbing | Email or push is not getting out; `outbox.delivery.failed` lines say why |
| `http_requests_total{status="429"}` | Rate limits biting — an attack, or a limit set too low |

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

`db:verify` catches a migration that dropped too much; the opposite mistake —
changing `schema.prisma` and forgetting the migration — is caught by
`npm run verify:migrations`. CI runs `prisma migrate deploy` against an empty
database, which proves the migrations *run* but not that they build the schema
`schema.prisma` describes; a model with no matching migration would only fail
on the first query that touched the missing column, in production. `verify:migrations`
replays the migrations into a scratch database and diffs the result against the
schema: in a healthy tree the only difference is the two hand-written search
indexes above (`knowledge_chunks_content_trgm_idx` and
`knowledge_chunks_embedding_hnsw`), which Prisma reports as drift every time.
Anything else — an added column, a dropped one — fails the build with the
statement printed.

Neither of those runs a migration against *data*. The `upgrade` CI job does:
it checks out the most recent release tag, lets its own migrations and seed
populate a database, then migrates that populated database up to the current
commit and reads the seed back through the current Prisma client. A migration
that is safe on empty tables but not on populated ones — a `NOT NULL` column
with no default, or a dropped column the code still reads — passes `migrate
deploy` and fails here, before it reaches an installation that has data in it.

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
