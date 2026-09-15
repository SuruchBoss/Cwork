# Changelog

All notable changes to Cwork are recorded here, in the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html), with
the 0.x caveat stated in the [README](./README.md#versioning): **breaking changes
are allowed before 1.0**, they are recorded here, and there is no long-term
support branch until then.

The reasoning behind a change lives in the
[backlog's Done table](./docs/backlog.md#done), which is worth more than this
file when you want to know *why* — including the several tickets whose own
premise turned out to be wrong. This file is for knowing *what*, and when.

Adding a `## [x.y.z]` section here and pushing it to `main` is what cuts a
release: the [Release workflow](./.github/workflows/release.yml) reads the top
entry, tags it and publishes the notes.

## [Unreleased]

### Added

- **First-run setup for a clean install** (CW-022). `npm run db:init` creates an
  organisation, the eight system roles and one administrator — and nothing else.
  Until now the only way to get an account was `db:seed`, which the README
  itself labels demo data, so installing Cwork for real people meant loading a
  fictional company with published credentials and then cleaning up after it.
  - `npm run db:init -- --web` prints a single-use token instead and setup
    finishes in a browser at `/setup`. Minting a token requires shell access to
    the server, which is what keeps a deployment that is up but not yet set up
    from being claimed by whoever reaches it first. There is deliberately no
    endpoint that issues one, and no "if no organisation exists, let anyone
    through" check anywhere.
  - Both paths refuse once an organisation exists, including a token that was
    valid moments earlier, and two concurrent attempts are serialised by a
    Postgres advisory lock.
  - The first administrator holds `role:manage`, so it enrols a second factor at
    its first sign-in. Nothing in setup prints a TOTP secret.

### Changed

- `db:seed` now says it is demo data when it runs, and refuses to install itself
  beside an organisation it did not create (`SEED_FORCE=1` overrides).

### Fixed

- An account could not use an access token issued in the same wall-clock second
  as the account row was created: `User.sessionsValidFrom` is stored with
  millisecond precision and is compared against a JWT `iat` in whole seconds, so
  the token read as older than the account and every request came back "session
  has been invalidated". Unreachable before — no account could be created and
  signed into that quickly — and reachable the moment setup existed.

## [0.1.0] — 2026-09-15

The first release. Everything below existed before it; naming it is what CW-028
was for, so that an installation can say which version it is running instead of
"whatever `main` was that day".

### Added

- **Employees** — effective-dated records, employment events, org structure,
  offboarding with a scheduled final working day.
- **Leave** — entitlements with accrual and carry-over, a balance ledger that
  reserves on submission, Thai public-holiday and weekend handling.
- **Attendance** — clock in/out with a geofence flag, shift derivation, overtime
  requests, a nightly close-out that marks no-shows and incomplete days.
- **Payroll** — effective-dated compensation, Thai withholding tax and social
  security, overtime multipliers, payslips, a run lifecycle with separation of
  duties between the person who runs it and the person who approves it.
- **Recruitment** — job requisitions, a public careers page, applications with
  PDPA consent and a retention purge, assessments.
- **Performance** — review cycles, KPI and competency scoring, acknowledgement.
- **Documents and files** — document requests resolving to merge data, uploads
  checked by MIME type, extension and magic bytes.
- **Approvals** — a policy engine with conditions, ordered steps, delegation and
  SLA due dates, shared by every module that needs a decision.
- **Audit** — append-only at the database level, enforced by a trigger.
- **The HR assistant** — answers policy questions from the organisation's own
  documents, with tool scoping that cannot be talked out of its permissions.
  Off by default.
- **Clients** — a React 19 admin console and a Flutter employee app that
  tolerates being offline.
- **Second-factor authentication** (CW-001) — TOTP implemented against RFC 6238,
  required rather than offered for any account that can read sensitive employee
  data, run payroll, approve payroll or manage roles.
- **Malware scanning** (CW-002) — uploads streamed to clamd *before* they are
  stored, so malware is never written down for a later change to expose. A
  scanner that is unreachable holds the file rather than passing it. Off by
  default; `docker compose --profile av` turns it on.
- **Shared rate limiting** (CW-003) — `THROTTLE_STORAGE=postgres` puts the
  request budget in the database that is already there, so a limit belongs to
  the deployment rather than to whichever replica answered.
- **The transactional outbox** (CW-006) — domain events written in the same
  transaction as the change that caused them, relayed by a poller claiming
  batches with `FOR UPDATE SKIP LOCKED`. Retries with backoff, dead-letters what
  cannot be delivered, and keeps the dead letters.
- **Leader election for scheduled jobs** (CW-007) — each nightly task takes a
  Postgres advisory lock, so running three replicas runs the work once.
- **Email and push delivery** (CW-005) — SMTP written against RFC 5321 and FCM's
  HTTP v1 API, both registered as outbox handlers. Per-user preferences and a
  signed public unsubscribe link. Off by default; a channel switched on with
  incomplete configuration refuses to boot.
- **An end-to-end test suite** (CW-011) — 103 checks driving the real
  application over HTTP, including two and three instances sharing one database.

### Changed

- **Notifications commit with the change they announce.** Previously a business
  transaction committed and the notification followed in a transaction of its
  own, so a crash in between left an approval nobody was told about. Four call
  sites gained a transaction they never had — approving a resignation wrote
  three rows that could always have disagreed with each other.
- **Multer errors are mapped by code rather than by message.** Nest's own
  mapping matches message text; multer 2.4 reworded one, and every affected
  request became a 500 with a stack trace.
- **The upload endpoint states its whole contract as parser limits** — one part,
  named `file`, no text fields — which is what neutralises the field-name
  denial-of-service advisories rather than the version bump alone.

### Fixed

- **The documented Docker quick start could not migrate or seed** (CW-000). The
  API image is pruned to production dependencies, so the commands the README
  gave had no Prisma CLI and no ts-node.
- **`npm run test:e2e` pointed at a config that did not exist** (CW-011).
- **Nine high-severity advisories in shipped dependencies** (CW-020) — multer
  and deepmerge-ts, pinned through npm `overrides` because neither parent had
  picked the fixes up.
- **The login screen's logo rendered as a full-width bar** on every device: a
  56×56 square inside a `CrossAxisAlignment.stretch` column.

### Security

- Argon2id password hashing, AES-256-GCM field encryption, refresh-token
  rotation with family reuse detection, deny-by-default authorisation, row-level
  visibility scoping, and an append-only audit trail enforced by the database.
- CI fails on a new high-severity advisory in a shipped dependency, weekly as
  well as on every push.

### Known limitations

Stated in full in [security.md](./docs/security.md#what-this-does-not-do) and
[spec.md](./docs/spec.md#known-limits). The ones that decide whether you can run
this yet:

- There is no way to create an organisation without loading the demo data
  (CW-022).
- The Thai payroll and social-security rules have not been reviewed by anyone
  qualified ([#36](https://github.com/SuruchBoss/Cwork/issues/36)).
- `organizationId` is not a tenant boundary. One deployment serves one
  organisation.
- The employee app cannot register for push yet (CW-037).
- This code has never had a penetration test, and no independent human has read
  every line — see [How this was built](./README.md#how-this-was-built).

[Unreleased]: https://github.com/SuruchBoss/Cwork/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SuruchBoss/Cwork/releases/tag/v0.1.0
