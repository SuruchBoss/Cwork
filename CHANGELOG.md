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

Nothing yet.

## [0.3.0] — 2026-09-18

Hardening and polish for opening the repository to visitors. A signing secret
that could be forged outside production is closed; the overview page works on a
phone and reads to a screen reader; the walkthrough is recorded in Thai as well
as English; and two more checks fail the build when the documentation drifts
from the code.

### Security

- **The API booted on the placeholder signing secret outside production.**
  `backend/.env.example` shipped a working `JWT_ACCESS_SECRET=change-me-…` — 32
  characters, so it cleared the length check — while the guard that recognises
  the placeholder ran only under `NODE_ENV=production`, which that same file did
  not set. A token signed with the published string was accepted on a
  development boot, which binds `0.0.0.0` like any other, so a forged admin
  token read the employee register over the network. The example now ships the
  JWT secrets blank (the API refuses to start on a placeholder and names the
  fields), and the placeholder and equal-secret checks run at every tier, which
  is what `security.md` already described.

### Fixed

- The five-minute demo in the README did not work on a clean clone. The
  `migrate` compose service is what `npm run db:seed` and `npm run db:init` are
  documented to run through, and both boot Nest, which validates the whole
  environment before any module starts — but the service passed no JWT secrets.
  The seed stopped half way, leaving a console that contradicted the README,
  and `db:init` failed outright.
- Layout and contrast faults on the landing page: the hero headline overflowed
  its column and painted across the product video, anchor jumps left section
  headings under the sticky bar, the download button set its label in muted
  grey on orange, the savings figure was drawn at 1.9:1 on the dark band, and
  the page scrolled sideways at 320px. Every text and background pair now
  clears WCAG AA in both themes.
- **The assistant reported itself as available when it was not** (CW-038). Three
  configurations reached `GET /config` as `assistantEnabled: true` while the
  module handed back the disabled provider, so both clients drew an assistant
  that answered every question with `ASSISTANT_DISABLED`: the provider name
  `openai-compatible`, which validates but has no implementation anywhere in
  `src`; `ASSISTANT_PROVIDER=none` with the assistant switched on; and the
  Anthropic provider with no API key, outside production. `spec.md` and
  `security.md` both already stated the rule — an optional feature fails loudly
  when switched on — but the check ran only in production and only for one
  provider. **If your `.env` has `ASSISTANT_ENABLED=true` without a usable
  provider, the API now refuses to start and names what is missing.** The
  shipped `backend/.env.example` was one such file, and is fixed.
  `ASSISTANT_EMBEDDING_PROVIDER` had the same shape and is restricted the same
  way: `openai` validated, routed knowledge search through the vector path, and
  returned exactly what `none` returns, because the embedding call is not
  implemented until CW-018. It accepts `none` until that lands.
- **The landing page had no document head**, so every phone laid it out at
  around 980px and zoomed out. It now has a doctype, a language, a viewport,
  a description, canonical and hreflang links, and Open Graph cards.
- **Every console screenshot on the landing page was stretched 93% too tall.**
  The width and height attributes on an `<img>` map to the CSS properties, and
  the rule set only `width`, leaving the attribute's height standing.
- The Thai copy on the landing page read like a translation — calques
  (ติดธง for "flagged"), transliterations (เอนจิน, สตาร์ท, ไมเกรชัน, เซสชัน),
  literal renderings (หน่วยความจำถาวร, ฝั่งเครื่อง, โดยค่าตั้งต้น), English
  passive voice, and one invented benchmark. Rewritten throughout.
- **A sign-in was refused when it landed in the same second as a forced
  sign-out.** The 0.2.0 fix covered only the account-creation write site; the
  comparison itself still read `iat × 1000 < sessionsValidFrom`, so a password
  change, a forced logout or a disabled account left every request refused with
  "session has been invalidated" for up to a second, cleared by signing in
  again. The comparison now happens at the whole-second resolution `iat` can
  express, in one place shared by the JWT strategy and the MFA verify. It had
  been surfacing in CI as an intermittent end-to-end failure.
- **The overview page could not be used from a phone, in two ways.** The
  language switch was hidden along with the section links below 880px, so a
  visitor arriving on a phone — the audience the page is bilingual for — had no
  way to reach the other language; and the console screenshots, given the full
  column width, put the interface's own 14px labels under 4px on a 390px
  screen. The switch now stays, and each screenshot links to its full-size
  asset for the phone's own zoom.
- **The savings figure on the landing calculator wrapped mid-number** for any
  company over about eighty people — the one figure the section exists to show,
  broken between two digits. It no longer wraps and shrinks to fit instead; the
  English page had also asked `Intl` for THB without naming the symbol and
  rendered "THB" where the Thai page rendered "฿".
- **The recorded walkthrough was in the wrong typeface, and each caption named
  the previous screen.** The console asks for IBM Plex Sans Thai; inside the
  recorder that request failed silently and the video fell back to Loma, two
  scrolls above screenshots in the right face. And because the console is a
  single-page app, the caption bar outlived each navigation, so for the settle
  after every route change it described the screen just left. The recorder now
  serves the font itself and waits for the destination before it captions.
- **A screenshot showed a state a default install cannot be in.**
  `15-assistant.png` was captured with the assistant switched on, directly under
  a line saying it is off by default; it is replaced by the knowledge base,
  which answers with no provider configured. A byte-identical duplicate
  screenshot went too, and `landing/` joined the repository-layout table.
- **`npm test` failed on a clean clone** because naming the `APP_CONFIG`
  injection token pulled in the module that defines it, whose `@Module`
  decorator validated `process.env` at import time — so a unit test that touches
  neither a database nor a config could not load. The token now lives in a file
  of its own. This is a second clean-clone failure, distinct from the compose
  one above.
- **The README told a reader running without Docker that pgvector was
  optional.** The first migration opens `CREATE EXTENSION "vector"`, so a plain
  `postgres:16` stops at `prisma migrate deploy`. CI and compose always ran
  `pgvector/pgvector:pg16`; only the non-Docker note said otherwise.
- **Ten documented test counts were wrong**, across six files in two languages:
  two different claims — the domain layer, and the whole suite — had drifted
  into one number. Corrected to the measured 246 domain and 288 backend unit.
- **The menu and theme buttons had no name a screen reader could read** — each
  was an icon-only glyph announced as "button", and on a phone the menu button
  is the only way to navigate. Both now carry an `aria-label`, the menu also an
  `aria-expanded` bound to its state, and the decorative glyph is `aria-hidden`.

### Added

- `npm run verify:compose` — checks in CI that every compose service which
  boots application code is handed the environment the application refuses to
  start without, derived from the real validation schema rather than a second
  list that can drift.
- **An English landing page** at `/en/`, generated from the Thai one by
  `landing/build-en.mjs` so the two cannot drift. A Thai string with no
  translation fails the build. The Pages workflow regenerates it and fails on a
  diff.
- The landing page is published to GitHub Pages and linked from both READMEs.
- **`npm run verify:docs`** — measures the backend suites and checks every
  documented test count against them in CI; a number with two homes, or a claim
  reworded past the pattern that watches it, fails the build.
- **`npm run verify:sql`** — the greppable tenant scoping ADR-0003 asks for:
  every raw SQL statement in `src/` is listed with why it is safe, and an
  unclassified or stale entry fails the build.
- **A Thai-captioned walkthrough** beside the English one, recorded from the
  same script (`docs/demo/record.mjs`, now taking a language). The Thai overview
  page shows the Thai take; the English page and the READMEs keep the English
  one.
- **A social-preview card** (`docs/social-preview/`) — the 1280×640 image GitHub
  serves when the repository link is unfurled, generated from an HTML card so it
  can be regenerated when the screenshot or palette changes.

### Changed

- **Empty and error states now speak the monochrome glyph language the rest of
  the interface uses**, instead of colour emoji (📭 ✅ 🧾 ⚠️ …) that rendered
  differently on every platform and read as placeholders. Each empty state now
  shows the glyph of its own section. 24 icons across 20 files; no behaviour
  change, as the icons were already `aria-hidden`.

## [0.2.0] — 2026-09-15

A stranger can install this now, and can see what it does without reading Thai.
Phase 1 of the plan in [the backlog](./docs/backlog.md), plus the PDPA minimum a
pilot needs.

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

- **`GET /config`**, a public endpoint reporting the feature flags a client
  needs before it can draw its shell. One flag today, `assistantEnabled`.

- **`npm run db:demo`**, a second half to the demo seed that gives the fictional
  company a history: last month's payroll run, leave that was requested and
  approved, expense claims, a hiring pipeline mid-flight and an open review
  cycle. `db:seed` chains the two. It drives the application's own services
  rather than inserting rows, so the payslips come from the real Thai tax code
  and the run had to be prepared and approved by two different people.

- **A recorded walkthrough** in both READMEs, and the script that produces it
  (`docs/demo/record.mjs`). It drives the real console against the seeded
  company, second factor included, so the demo cannot drift from the product.
  English captions are burned in, because the interface is Thai until CW-016
  lands and thirty seconds of a language you do not read tells you nothing.

- **The PDPA minimum a pilot needs** (CW-026). [Personal data](./docs/privacy.md)
  lists every class of personal data the schema holds and where, the retention
  the software actually enforces and the far longer list it does not, and a
  step-by-step erasure procedure that was run against a real database before it
  was written down. [A draft employee notice](./docs/privacy-notice.th.md) in
  Thai goes with it.
  - Two facts that procedure had to establish rather than assume: an employee
    who has ever clocked in **cannot be deleted** — the append-only trigger on
    `attendance_punches` blocks the cascade — and the audit trail cannot be
    erased at all without destroying the property it exists for. Both are now
    written down, with what to do instead.

### Changed

- **The assistant is hidden when it is switched off** (CW-027). `ASSISTANT_ENABLED=false`
  is the default and every role carries `assistant:use`, so the standard install
  put an assistant entry in front of everybody that could only fail — which
  reads as a broken product rather than a disabled option. The console now drops
  the sidebar entry and the app drops the bottom-navigation tab. A bookmark from
  before it was switched off still resolves, to the screen that explains why it
  is off. The boot-time rule is unchanged.
- `db:seed` now says it is demo data when it runs, and refuses to install itself
  beside an organisation it did not create (`SEED_FORCE=1` overrides).
- **The demo seed no longer leaves most of the console empty.** Payroll,
  expenses, recruitment and performance all showed *"nothing here yet"* after
  the documented five-minute setup, which did not match the screenshots in the
  README and told an evaluator nothing about whether any of it works.

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

[Unreleased]: https://github.com/SuruchBoss/Cwork/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/SuruchBoss/Cwork/releases/tag/v0.3.0
[0.2.0]: https://github.com/SuruchBoss/Cwork/releases/tag/v0.2.0
[0.1.0]: https://github.com/SuruchBoss/Cwork/releases/tag/v0.1.0
