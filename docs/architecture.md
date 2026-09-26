# Architecture

## The shape of the system

```
┌──────────────────┐        ┌──────────────────┐
│  mobile/         │        │  web/            │
│  Flutter         │        │  React + Vite    │
│  employees       │        │  HR & admin      │
└────────┬─────────┘        └────────┬─────────┘
         │      HTTPS / JSON · JWT   │
         └─────────────┬─────────────┘
                       ▼
            ┌─────────────────────┐
            │  backend/  NestJS   │
            │  modular monolith   │
            └──────────┬──────────┘
                       ▼
            ┌─────────────────────┐
            │  PostgreSQL 16      │
            │  (+ pgvector, opt.) │
            └─────────────────────┘
```

Three deployables, one database. No message broker, no service mesh, no Redis
in the default install. An HRIS for a few thousand employees does not generate
the load that justifies them, and every piece of infrastructure is something a
self-hoster has to run, monitor and upgrade.

## Why a modular monolith

Leave, attendance and payroll are not independent. A payroll run reads approved
overtime, unpaid leave days and locked attendance records, and it must see a
consistent snapshot of all three. As separate services that becomes a
distributed transaction; as modules in one process it is a database transaction.

The module boundaries are still real:

- Each module owns its tables. `PayrollService` never queries `leave_requests`
  directly — it calls the leave module's service.
- Modules communicate through injected services, not through each other's
  repositories.
- The approval engine talks back through a handler registry
  (`ApprovalOutcomeRegistry`), so `ApprovalsModule` does not import the modules
  it serves. That is what keeps the dependency graph acyclic.

Those boundaries are what would let any module be extracted later, if a
deployment ever grows to need it. Nothing here forecloses that; it just does not
pay the cost up front.

## Layering inside a module

```
modules/payroll/
├── domain/                  Pure functions. No client, no framework, no I/O.
│   ├── thai-tax.ts
│   └── payroll-calculator.ts
├── dto/                     Request and response shapes, with validation.
│   └── payroll.dto.ts
├── payroll.service.ts       Orchestration, transactions, permissions.
├── compensation.service.ts  A second service when one grew too broad.
├── payroll.controller.ts    HTTP only: route, guard, delegate.
└── payroll.module.ts
```

**One boundary is enforced, and it is `domain/`.** Everything else is a flat
file whose name says what it is. There is no `application/` or `infrastructure/`
directory, deliberately: a service file and a controller file per module is
already unambiguous at this size, and a directory per layer would be four
folders deep to hold one file each.

Splitting happens when a service gets broad rather than on a schedule — payroll
is four services because compensation, expense claims and benefits are each
their own subject, not because a rule said so.

The `domain/` directory is the one that earns its boundary. Leave arithmetic,
attendance derivation, Thai tax, KPI scoring and assessment grading are all pure
functions of their inputs. That is why there are 323 domain tests that run in
under ten seconds with no database: the rules that are expensive to get wrong are the
ones that are cheapest to test.

It is also what makes "why was I charged 2.5 days?" answerable. The calculation
is one function you can read, not a query plan spread across three services.

**What `domain/` may import**: types and enums from `@prisma/client`, and
nothing else from it. `AttendanceStatus` and `LeaveAccrualMethod` are the
vocabulary the rules are written in, and re-declaring them here to keep a rule
pure on paper would mean two definitions to keep in step. What is banned is the
*client* — a `domain/` function never reads or writes anything.

## State management

| Layer | Concern | Tool |
|---|---|---|
| Web | Server state | TanStack Query |
| Web | Session, UI preferences | Zustand (persisted) |
| Web | Form state | react-hook-form + zod |
| Mobile | Everything | Riverpod |

The split on web is deliberate. Server state can go stale because someone else
changed it; client state cannot. Keeping them in separate systems means "is this
stale?" is a question only one layer ever has to answer. Putting API responses
in Zustand would mean hand-writing cache invalidation in every component.

Mobile uses Riverpod for both, because the app is small enough that a second
system would be overhead, and `AsyncValue` already models loading/error/data
without three booleans per screen.

Neither client uses code generation. Both could; neither needs it badly enough
to make `build_runner` a step a contributor can forget.

## Request flow

```
Request
  → RequestContextMiddleware   assigns a correlation id
  → ThrottlerGuard             rate limit
  → JwtAuthGuard               authenticate (global; opt out with @Public)
  → PermissionsGuard           authorise (@RequirePermissions)
  → ValidationPipe             validate + strip unknown keys
  → Controller → Service → Repository → Prisma
  → AuditInterceptor           record what changed (@Audited)
  → AllExceptionsFilter        one error shape, stable codes
```

Two properties fall out of this:

**Deny by default.** The JWT guard is global. A new controller is authenticated
unless it explicitly opts out with `@Public()`. Forgetting a decorator fails
closed, which is the direction you want that mistake to go.

**Mass assignment is impossible.** The validation pipe runs with
`forbidNonWhitelisted: true`, so a payload carrying `organizationId` or `role`
is rejected outright rather than silently ignored.

## Tenant scoping

**One deployment serves exactly one organisation.** Every tenant-owned table
carries `organizationId` and every repository query filters on it explicitly,
but that is a safety net inside a single-organisation install — it is not
multi-tenancy, and nothing should be built on the assumption that two
organisations may share a database. Nothing in the test suite exercises that
case.

There is deliberately no Prisma middleware injecting the filter automatically.
An implicit filter is invisible when it goes missing — raw queries, nested
writes and `$queryRaw` all escape it — and a scoping bug that silently stops
working is far worse than one the compiler can point at.

That one organisation has to come from somewhere, and the module that creates it
is the one place in the codebase with no tenant to scope to. `modules/setup`
runs exactly once per install: it takes an organisation, the system role set and
one administrator, and after that every one of its entry points refuses. Its
authority comes from outside HTTP — `npm run db:init` needs a shell on the
server, and the web wizard needs a single-use token that only `db:init` can
mint. `SetupModule` provides its own `CryptoService` rather than borrowing the
global one, so the CLI can boot a three-module context instead of the whole
application to write four rows.

## Data model

Three patterns run through the schema:

**Effective dating.** Compensation is never updated in place. A raise inserts a
new row and closes the previous one, so a payslip from eight months ago can
still be recomputed from the salary that actually applied then.

**Append-only streams with derived aggregates.** Attendance punches are
append-only; the daily `AttendanceRecord` is a pure reduction over them. A
correction adds new punches and the day is recomputed — history is never
rewritten. The `audit_logs` and `attendance_punches` tables enforce this with a
database trigger, so a compromised application account still cannot edit them.

**Snapshots at decision points.** A payslip stores the compensation, tax profile
and attendance figures it was computed from. An approval instance stores the
entity as submitted. When someone disputes a number a year later, the inputs are
still there.

## What is not here

- **No message broker.** The `outbox_events` table exists so domain events can
  be relayed transactionally when someone needs that, but nothing consumes it
  by default.
- **No Redis.** Rate limiting is in-process by default; `THROTTLE_STORAGE=postgres`
  shares the counters through the database that is already there, so running
  several instances does not mean running another service.
- **No scheduler service.** Cron lives in the API process. Every replica runs
  the same schedule and each job takes a Postgres advisory lock, so one of them
  does the work and the rest stand down — see [operations.md](./operations.md).
- **No message broker.** Anything that has to leave the system is written to
  `outbox_events` in the same transaction as the change that caused it, and
  relayed by a poller claiming batches with `FOR UPDATE SKIP LOCKED`. One
  table, no Kafka, and the consistency guarantee a broker would not have given
  on its own anyway.
- **No mail or push library.** SMTP is a few hundred lines of RFC 5321 and
  FCM's HTTP v1 API is two requests, so both are written out and unit-tested
  against their own specifications rather than brought in with a transport
  abstraction and a dependency tree.

These are all deliberate: an HRIS that needs a Kafka cluster to send a leave
notification is an HRIS nobody can self-host.
