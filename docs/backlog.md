# Backlog

Open work on Cwork, most important first. Every ticket here is grounded in
something that is actually missing or broken in the code — not a wish list.

The [specification](./spec.md) says what the system does today. This says what
it does not.

**Conventions**

| | |
|---|---|
| Priority | **P0** blocks a real deployment · **P1** needed before payroll runs on real people · **P2** worth doing · **P3** nice to have |
| Estimate | **S** under a day · **M** a few days · **L** a week or more |
| 🌱 | Good first issue — self-contained, with a clear acceptance test |

## Order of work

Agreed 2026-09-15 — the reasoning is in
[spec.md § Agreed direction](./spec.md#agreed-direction). Priority still marks
severity; this is the sequence work is actually taken in.

| Phase | | |
|---|---|---|
| **0** | A baseline to measure from | CW-028 · CW-030 · CW-029 |
| **1** | A stranger can install it | CW-022 · CW-020 · CW-027 |
| **2** | The pilot can run | CW-010 · CW-023 · CW-024 · CW-025 · CW-026 · CW-007 |
| **3** | After the pilot | CW-016 · CW-031 · CW-009 · CW-014 · CW-008 · CW-032 · CW-033 |
| **4** | When someone actually needs it | CW-004 · CW-019 · CW-002 · CW-003 · CW-005 · CW-006 · CW-021 · CW-017 |

Two deliberate departures from priority order:

- **CW-007 is pulled into phase 2.** The pilot holds real people's leave
  balances, and an accrual job that runs twice during a rolling restart grants
  leave twice — hard to unpick afterwards, and a few hours to prevent.
- **CW-002 and CW-003 sit in phase 4 despite being P0.** Both guard surfaces the
  pilot does not use: the public careers page, and a second replica. They become
  P0-in-practice the moment either is switched on.

---

## P0 — blocks a real deployment

### CW-002 · Scan uploads for malware
`P0` · security · **M**

`FileObject.scanStatus` exists and nothing ever sets it. Uploads are type- and
magic-byte checked, which stops a renamed `.exe` but not a malicious PDF.
Résumés arrive from the public careers page — this is the least trusted input
the system takes.

**Scope**
- Queue an async scan on upload (ClamAV via `clamd` is the obvious default).
- Hold files at `PENDING` and refuse download until `CLEAN`.
- Quarantine on `INFECTED`, notify, and audit it.
- Degrade explicitly when no scanner is configured — a documented setting, not a
  silent pass.

**Acceptance**
- The EICAR test file is quarantined and never downloadable.
- A clean file becomes downloadable once scanned.
- With scanning disabled, boot logs say so plainly.

**Files** `backend/src/modules/files/`

> Phase 4: this guards the public careers page, which the pilot does not use. It
> is P0 again the day that page goes live.

---

### CW-003 · Move rate limiting to a shared store
`P0` · security · **S** · 🌱

`@nestjs/throttler` is in-memory, so the sign-in lockout is per-instance. Two
replicas behind a load balancer means double the attempts, and the limit
disappears entirely on restart.

**Scope** Point the throttler at Redis (or Postgres, to avoid adding a
dependency) behind a config switch, keeping in-memory as the single-instance
default.

**Acceptance** With two API instances against one store, the sixth failed
sign-in is rejected regardless of which instance serves it.

**Files** `backend/src/core/`, `docker-compose.yml`, `docs/operations.md`

---

### CW-022 · First-run setup for a clean install
`P0` · platform · **M**

There is no way to create an organisation or a first administrator. The only
`organization.upsert` in the codebase is in `prisma/seed.ts`, which the README
itself labels *demo data — evaluation only*, and there is no `@Post` on
`organization.controller.ts` and no registration route on `auth.controller.ts`.
Anyone installing Cwork for a real organisation has to load fake data and then
clean up after it.

**Scope**
- `npm run db:init` — an interactive CLI taking organisation name, timezone and
  the first administrator's email, creating the org, the default role set and
  that one account.
- A web setup wizard for the same thing, reachable only with a one-time setup
  token that `db:init` prints. No token, no wizard — a bare "if no org exists,
  let anyone through" check is an account-takeover waiting to happen.
- Keep `db:seed` strictly for demo data and say so when it runs.
- The first administrator holds `role:manage`, so it is required to have a
  second factor. The existing `@Public() POST /auth/mfa/enroll` path already
  covers enrolling before a session exists; the CLI must not print the secret.

**Acceptance**
- A fresh database plus `db:init` yields a usable sign-in with no demo rows.
- The wizard refuses every request without a valid, unspent setup token.
- Running `db:init` a second time on a populated database refuses rather than
  creating a second organisation.

**Files** `backend/src/modules/organization/`, `backend/prisma/`, `web/src/`

---

### CW-026 · The PDPA minimum the pilot needs
`P0` · compliance · **S**

The pilot runs leave and attendance for real employees, so it collects real
location data and sick-leave records. `CW-015` — proper retention and purge — is
too large to precede it, but going in with nothing is not an option either.

**Scope**
- A notice for pilot employees: what is collected, that **location is recorded
  only at the moment of a punch and never continuously**, how long it is kept,
  and how to ask for erasure.
- A retention period written down, per record class.
- An erasure path. A documented manual procedure is acceptable here; an
  undocumented one is not.

**Acceptance** A pilot employee can be told, in writing, what is held about them
and can have it removed on request without anyone improvising.

**Files** `docs/`, `README.md`

---

### CW-030 · Correct the claims the documentation makes
`P0` · docs · **S**

Three statements in the docs are not true, and each one could lead somebody to
rely on something that is not there.

**Scope**
- Remove "multi-tenant" as a property of the product. `organizationId` is
  defence in depth inside a single-organisation deployment and no test covers
  two organisations sharing a database. *(Done in `spec.md`; `README.md`,
  `architecture.md` and `security.md` still need the pass.)*
- State plainly that the Thai tax and social-security rules have **not** been
  reviewed by anyone qualified, in `README.md` and at the head of
  `payroll-thailand.md`.
- Say that location is captured only at the instant of a punch — it is true, it
  is a real privacy property, and nothing currently says it.
- Open an issue inviting an accountant or payroll professional to review the
  rules. Open source is a reasonable way to find one.

**Acceptance** No document claims multi-tenancy; no reader can reach the payroll
rules without meeting the warning first.

**Files** `README.md`, `docs/`

---

## P1 — before payroll runs on real people

### CW-004 · ภ.ง.ด.1 withholding-tax filing export
`P1` · payroll · **L**

Payroll computes withholding correctly but there is no way to file it. Every
Thai employer must submit ภ.ง.ด.1 monthly and ภ.ง.ด.1ก annually; today that
means re-keying from payslips, which is exactly the error-prone step the system
exists to remove.

**Scope**
- ภ.ง.ด.1 monthly export in the Revenue Department's text layout.
- ภ.ง.ด.1ก annual summary.
- 50 ทวิ withholding certificate per employee (pairs with CW-008).
- Reconcile totals against the runs in the period and refuse to export when they
  disagree.

**Acceptance**
- Export for the seeded demo company matches hand-computed totals.
- A period whose runs do not reconcile produces an error naming the difference,
  not a file.
- Rounding matches the Revenue Department's rules, with tests.

**Files** `backend/src/modules/payroll/`, `docs/payroll-thailand.md`

---

### CW-005 · Deliver notifications by email and push
`P1` · platform · **M**

`NotificationsService` writes in-app rows and stops there. Nobody learns a leave
request is waiting unless they open the console, which makes the approval chain
feel broken even though it works.

**Scope**
- SMTP transport with templates for approval-pending, approved/rejected, payslip
  published, document ready.
- FCM/APNs push through the existing `DeviceToken` model.
- Per-user preferences and an unsubscribe path.
- Deliver from the outbox (CW-006) so a failed send retries and never blocks the
  request that caused it.

**Acceptance**
- Submitting leave notifies the approver by email and push within a minute.
- A bounced email is retried with backoff and then recorded as failed.
- No notification is sent for a transaction that rolled back.

**Files** `backend/src/modules/notifications/`

> `CW-023` delivers the email half directly, before the outbox exists, so the
> pilot is not held up. This ticket remains the full version: push, preferences,
> unsubscribe, and delivery from the outbox.

---

### CW-006 · Consume the outbox
`P1` · platform · **M**

`outbox_events` is written transactionally and nothing reads it. Until something
does, any side effect (email, webhook, search index) is either lost on crash or
sent for work that rolled back.

**Scope** A poller that claims a batch with `FOR UPDATE SKIP LOCKED`, dispatches
to registered handlers, retries with backoff, and parks poison messages in a
dead-letter state after N attempts.

**Acceptance**
- An event whose transaction rolled back is never dispatched.
- A handler that throws does not block other events.
- Two pollers running at once never dispatch the same event twice.

**Files** `backend/src/core/outbox/`, `backend/src/modules/jobs/`

---

### CW-007 · Leader election for scheduled jobs
`P1` · platform · **S**

`ScheduledTasksService` assumes one instance. Run two replicas and nightly
accrual runs twice, granting leave quota twice.

**Scope** A Postgres advisory lock around each scheduled task, released on
completion, with a heartbeat so a crashed holder does not block the next run.

**Acceptance** With three instances, a task with a visible side effect executes
exactly once per schedule.

**Files** `backend/src/modules/jobs/scheduled-tasks.service.ts`

> Pulled into phase 2 despite single-instance deployment being the supported
> shape: a rolling restart briefly runs two processes, and nightly accrual
> firing twice grants leave twice.

---

### CW-008 · Render issued documents as PDFs
`P1` · documents · **M**

`DocumentRequest` resolves to *merge data* for a certificate template — the
fields, not a document. HR still produces the actual certificate by hand, so the
approval trail ends in a manual step nobody can audit.

**Scope**
- Server-side PDF rendering for each `DocumentRequestType`.
- Thai-capable fonts embedded (the usual failure mode is tofu boxes).
- Organisation letterhead and an authorised signature block.
- Store the rendered file as a `FileObject`, linked to the request.
- A verification code or QR so a bank can check a salary certificate is real.

**Acceptance**
- Each request type renders with Thai text intact.
- The stored PDF is reachable only by the requester and `document:issue`.
- Re-issuing supersedes rather than overwrites, and both are audited.

**Files** `backend/src/modules/documents/`

---

### CW-009 · Benefits administration in the console
`P1` · web · **M**

The API has benefits endpoints, `BenefitPlan` / `BenefitEnrollment` models and
`benefit:read` / `benefit:manage` permissions. The console has no benefits
screen at all, so enrolment is only possible by calling the API directly — yet
enrolments feed payroll.

**Scope** Plan list and editor; enrol and un-enrol employees; effective dates;
cost split; a view of what each plan adds to the next run.

**Acceptance**
- A `benefit:manage` holder can complete an enrolment without leaving the
  console, and it appears in the next payroll calculation.
- Someone with only `benefit:read` sees no mutating control.

**Files** `web/src/features/` (new `benefits/`), `web/src/app/router.tsx`

---

### CW-010 · Shift and roster management in the console
`P1` · web · **M**

`Shift`, `WorkSchedule`, `ScheduleAssignment` and `ShiftAssignment` exist and
attendance derivation depends on them — late and early-leave minutes are
computed against the assigned shift. There is no screen to define a shift or
assign one, so those numbers come from seeded data only.

**Scope** Shift definitions; weekly schedule patterns; assign to employee,
department or location; a calendar view of who is on which shift; bulk assign.

**Acceptance**
- A shift created in the console changes the late-minute calculation for the
  assigned employee the next day.
- Overlapping assignments for one employee-day are rejected with a clear error.

**Files** `web/src/features/attendance/`, `backend/src/modules/attendance/`

---

### CW-020 · Clear the production dependency advisories
`P1` · security · **S**

`npm audit --omit=dev` reports nine high-severity advisories in shipped
dependencies. The one that matters here is **multer**, reachable from the
public careers page: a crafted multipart field name causes a denial of
service, and résumé upload is the least trusted input the system takes. The
rest come in through `@nestjs/core` and `@prisma/config` (deepmerge-ts stack
exhaustion).

**Scope** Upgrade `@nestjs/platform-express` and `prisma` to releases carrying
the fixed transitive versions; where no fix exists yet, bound the exposure —
multer already has size limits, so also cap field-name length and field count.

**Acceptance**
- `npm audit --omit=dev` reports no high or critical advisories.
- Upload tests still pass, including the magic-byte rejection.
- CI fails on a new high-severity production advisory.

**Files** `backend/package.json`, `backend/src/modules/files/`

---

### CW-023 · Send notifications by email
`P1` · platform · **M**

`NotificationsService` writes in-app rows and stops. During the pilot that means
an approver never learns a leave request is waiting unless they happen to open
the console — a leave system nobody is told about is a broken leave system, even
with every rule correct. `.env.example` has no mail configuration at all.

This is the near-term slice of `CW-005`: SMTP only, no push, and dispatched
directly rather than through the outbox. That is a deliberate trade — it will be
rewritten when `CW-006` lands — because the pilot is worth more than the two
weeks outbox-first would cost.

**Scope**
- `MAIL_ENABLED=false` by default: boots, logs plainly that notifications are
  in-app only.
- `MAIL_ENABLED=true` with incomplete configuration: **refuses to boot**, the
  same rule `ASSISTANT_ENABLED` already follows.
- Send after the transaction commits, for approval-pending, approved, rejected
  and document-ready. A send that fails is logged and never fails the request
  that triggered it.
- Thai-capable templates.

**Acceptance**
- Submitting leave emails the approver.
- SMTP being down loses the email and nothing else — the leave request is
  unaffected.
- A rolled-back transaction sends nothing.

**Files** `backend/src/modules/notifications/`, `backend/src/core/config/`

---

### CW-024 · Bind an account to a device
`P1` · attendance · security · **M**

The app already generates a stable `deviceId` and every punch records it, but
nothing authorises it: any device holding a valid token can punch. Clocking in
for an absent colleague needs nothing more than their password.

**Scope**
- A device registry: an employee's first device binds on sign-in; that binding
  is what a punch is checked against.
- Re-binding — a lost or replaced phone, which is common — requires HR approval
  and is audited. Self-service re-binding would defeat the control entirely.
- A punch from an unbound device is **recorded and flagged**, never refused,
  consistent with how the geofence already behaves.

**Acceptance**
- A punch from a second device is accepted, flagged, and visible to HR.
- Re-binding without approval is impossible, and every re-binding is in the
  audit log.

**Files** `backend/src/modules/attendance/`, `backend/src/modules/auth/`,
`mobile/lib/core/storage/`

---

### CW-025 · Harden offline punch capture
`P1` · attendance · security · **M**

The server credits the instant a punch was captured, which is right — someone in
a warehouse with no signal should not lose the time. But `punch_queue.dart`
keeps that queue in `SharedPreferences`, which the owner of a rooted device can
edit, so arrival times are forgeable. Meanwhile the API accepts
`dto.isRootedDevice` and **the app never sends it**: there is no root-detection
dependency in `pubspec.yaml`, so `ROOTED_DEVICE` can never be raised.

**Scope**
- Move the queue to `flutter_secure_storage`, which tokens already use.
- Detect and send rooted/jailbroken status so the flag the backend is waiting
  for actually fires.
- A configurable ceiling — 12 hours as the starting value — beyond which a
  queued punch is flagged for a manager to confirm. The real number comes from
  the pilot's flag rate.
- Confirmation runs through the existing approval engine, with **only two
  outcomes: acknowledge, or reject the flag.** It must never create or delete a
  punch: `attendance_punches` is append-only at the database level and that
  property is load-bearing.

**Acceptance**
- A punch replayed 14 hours late is accepted, flagged, and appears in a
  manager's queue.
- Confirming or rejecting writes no new punch and deletes none.
- A rooted device produces `ROOTED_DEVICE` end to end.

**Files** `mobile/lib/features/attendance/data/`,
`backend/src/modules/attendance/`, `backend/src/modules/approvals/`

---

### CW-028 · A release baseline and a CHANGELOG
`P1` · project · **S** · 🌱

There is no `CHANGELOG.md` and the repository has no tags. Anyone installing
Cwork runs whatever `main` happened to be that day and cannot say which version
they have. The next phase rewrites every UI string for `CW-016`; without a
marker first there is nothing to compare against or fall back to.

**Scope** Tag `v0.1.0` at the current tree — it works end to end and the suites
pass, which is a fair baseline. Add `CHANGELOG.md` in Keep a Changelog form.
State the 0.x contract in `README.md`: breaking changes allowed, recorded, no
LTS before 1.0.

**Acceptance** `git describe` names a release, and the changelog has an entry
for it.

**Files** `CHANGELOG.md`, `README.md`

---

## P2 — worth doing

### CW-012 · Expense claims on mobile
`P2` · mobile · **M**

The backend supports expense claims and the console can manage them, but the
employee app cannot submit one — so the person holding the receipt has to wait
until they are at a desk. Photographing a receipt is the obvious phone task.

**Scope** Submit a claim with line items; attach photos from camera or gallery;
track status; see what was reimbursed in which payslip.

**Acceptance** A claim submitted on the phone appears in the console approval
queue with its attachments intact.

**Files** `mobile/lib/features/` (new `expenses/`)

---

### CW-013 · Overtime requests on mobile
`P2` · mobile · **S** · 🌱

Same gap as CW-012: overtime is requested where the work happens, not at a desk.
The approvals tab already exists, so this is the submission half.

**Acceptance** An OT request submitted on mobile is picked up by the same
approval policy as one submitted in the console, with the same multiplier.

**Files** `mobile/lib/features/attendance/`

---

### CW-014 · Document requests on mobile
`P2` · mobile · **S** · 🌱

The assistant can file a document request, but there is no screen for it — so
the feature only exists for deployments that turned the AI on. It should not
take an LLM to ask for a salary certificate.

**Acceptance** Every `DocumentRequestType` can be requested and tracked from the
app with the assistant disabled.

**Files** `mobile/lib/features/` (new `documents/`)

---

### CW-015 · Employee data retention and purge
`P2` · compliance · **M**

Candidate records carry a PDPA retention date and are purged. Employee records
have no equivalent. Retention is usually mandated for employees, but "usually"
is not a policy, and a leaver who asks for erasure currently has no path.

**Scope** Configurable retention per record class; a purge job that redacts
rather than deletes where law requires the record to survive; a report of what
would be purged before it runs; audit every purge.

**Acceptance** A dry run lists affected records and changes nothing. A purge
leaves payroll history legally intact while removing the personal identifiers it
does not need.

**Files** `backend/src/modules/employees/`, `backend/src/modules/jobs/`

---

### CW-016 · English locale
`P2` · web · mobile · **L**

Every UI string is hard-coded Thai. The architecture is jurisdiction-neutral —
tax rules are data, leave types configuration — but the interface is not, so a
non-Thai-reading evaluator cannot assess the system at all.

**Scope** Extract strings behind an i18n layer in both clients; English
alongside Thai; per-user language; locale-aware dates and currency (the Buddhist
era calendar is the sharp edge).

**Acceptance** Switching language translates the whole console with no layout
breakage, and Thai remains the default.

**Files** `web/src/`, `mobile/lib/`

> Decided: keys are English, Thai ships as a translation file, Thai stays the
> default. Content an organisation enters — leave type names, departments,
> positions — is not translated. Store Gregorian years always; the Buddhist era
> is a presentation concern only.

---

### CW-021 · Two-factor enrolment on mobile
`P2` · mobile · **M**

The app can complete a second factor — it shows a code field and accepts a
generated or recovery code — but it cannot *enrol* one. Scanning a QR code with
the phone that is displaying it does not work, so an account required to have a
second factor is currently told to enrol in the web console first.

That is fine while the requirement only reaches privileged console roles. An
organisation that turns on `settings.security.requireMfa` for everyone leaves
its field staff unable to set themselves up from the only device they have.

**Scope** Enrolment without a camera round-trip: show the secret, offer a
"copy to clipboard" and a deep link that hands the `otpauth://` URI straight to
an authenticator app on the same device, then confirm with a code.

**Acceptance** An employee with no console access can enrol and sign in using
only the phone, and the recovery codes are shown once with a way to save them.

**Files** `mobile/lib/features/auth/`

---

### CW-027 · Hide the assistant when it is disabled
`P2` · web · mobile · **S** · 🌱

`ASSISTANT_ENABLED=false` is the default, so the standard install shows an
assistant entry that cannot work. A control that fails when pressed reads as a
broken product, not a disabled option.

**Scope** Expose the flag on a public config endpoint and hide the assistant
entry point in both clients when it is off.

**Acceptance** With the assistant disabled, neither client offers any route to
it, and nothing 404s.

**Files** `web/src/`, `mobile/lib/`, `backend/src/modules/assistant/`

---

### CW-029 · Require DCO sign-off on contributions
`P2` · project · **S** · 🌱

Contributions are taken under Apache-2.0 with no CLA and no sign-off, so there
is no record that a contributor had the right to submit what they submitted.
Without a CLA the licence cannot realistically be changed later — that is an
accepted consequence, but it should be a stated one.

**Scope** Document DCO in `CONTRIBUTING.md`, add the sign-off line to the pull
request template, add a CI check for it, and note in `README.md` that there is
no CLA and why.

**Acceptance** A pull request without `Signed-off-by` fails CI with a message
saying how to fix it.

**Files** `CONTRIBUTING.md`, `.github/`

---

### CW-031 · A public demo instance
`P2` · project · **M**

Evaluating Cwork currently means cloning it, writing an `.env`, running compose,
migrating and seeding. Most people will not, and the assistant — the thing that
distinguishes this from other open-source HR systems — is off by default, so
nobody evaluating it ever sees the feature.

**Blocked on a decision:** who pays for the demo's LLM usage. Asking visitors
for their own API key is not an option — it trains people to paste credentials
into unfamiliar sites. If no budget is agreed, ship the demo with the assistant
off and a short screen recording instead.

**Scope**
- A hosted instance reset hourly, writable so that approval flows can actually
  be tried.
- Sign-in as employee, manager or HR in one click.
- If the assistant is on: cheapest model, a hard spending cap at the provider,
  and per-IP rate limiting on the assistant routes specifically — the existing
  per-user caps do nothing when everyone shares a demo account.

**Acceptance** Someone with no local setup can approve a leave request within a
minute of opening the link, and no single visitor can exceed the spending cap.

**Files** `docs/`, `README.md`, deployment configuration

---

### CW-032 · Test migrations from the previous release in CI
`P2` · platform · **S**

CI only ever runs `prisma migrate deploy` against an empty database, so nothing
proves that an existing installation survives an upgrade. Once other people are
running Cwork, a bad migration destroys their data, not ours.

**Scope** A job that checks out the previous tag, migrates and seeds, then
migrates up to the current commit and asserts the seeded data is still readable.
Depends on `CW-028` for a first tag to upgrade from.

**Acceptance** A migration that drops a populated column fails CI.

**Files** `.github/workflows/ci.yml`

---

### CW-033 · Remove the unused anti-fraud columns
`P2` · attendance · **S** · 🌱

`AttendancePunch.selfieFileId` is never written — there is no camera capture
anywhere in the app — and selfie capture was considered and not adopted, partly
because biometric data drags consent and retention obligations along with it. A
column nothing writes misleads whoever reads the schema next.

The same argument settles kiosk devices: no `type` field on the device model
until kiosk devices are actually built.

**Scope** Drop `selfieFileId` in a migration, or implement capture. Do not leave
it as it is. `isRootedDevice` is the opposite case and is handled by `CW-025`:
the API already accepts it, so wire the app up to send it.

**Acceptance** Every column in `attendance.prisma` is written by some code path.

**Files** `backend/prisma/schema/attendance.prisma`

---

## P3 — nice to have

### CW-017 · Accessibility pass on the console
`P3` · web · **M**

The console has never been tested with a screen reader or for keyboard-only
operation. HR software is used all day, every day, and is exactly where this
matters.

**Scope** Audit against WCAG 2.2 AA; fix focus management in dialogs and menus;
label every control; check contrast in both themes; add an automated axe check
to CI.

**Acceptance** No critical or serious axe violations on the main screens;
approving a leave request is possible with the keyboard alone.

**Files** `web/src/`

---

### CW-018 · Semantic knowledge search
`P3` · assistant · **M**

Retrieval is full-text plus trigram, which handles Thai well and needs no
embeddings — deliberately. pgvector is installed but unused. Paraphrased
questions ("can I get money for my kid's school fees?" against a document titled
"สวัสดิการการศึกษาบุตร") are where lexical search gives up.

**Scope** Optional embedding pipeline behind the existing provider interface;
hybrid ranking with the lexical score; keep lexical as the default so the
assistant still works with no external API.

**Acceptance** With embeddings off, behaviour is unchanged. With them on,
paraphrased queries retrieve the right document, measured against a fixture set.

**Files** `backend/src/modules/assistant/`

---

### CW-019 · Bank payment file export
`P3` · payroll · **M**

A `PAID` run records that people were paid; the transfer itself is manual.
Thai banks each take their own fixed-width or CSV format.

**Scope** A pluggable formatter with one or two common bank layouts; decrypt
account numbers only at export time, under `employee:read:sensitive`; audit every
export.

**Acceptance** A generated file validates against the bank's published spec, and
the export is refused for a run that is not `APPROVED`.

**Files** `backend/src/modules/payroll/`

---

## Done

Kept so the reasoning survives.

| | |
|---|---|
| **CW-000** · Docker quick start could not migrate or seed | The API image is pruned to production dependencies, so `docker compose exec api npx prisma migrate deploy` and `npm run db:seed` — both documented in the README — failed: no Prisma CLI, no ts-node. Fixed by splitting the prune into its own Dockerfile stage and adding a profiled `migrate` service built from the `build` stage. The runtime image is unchanged. |
| **CW-011** · `npm run test:e2e` was a dangling script | It pointed at `./test/jest-e2e.json`, which did not exist, and `backend/test/` was an empty directory, so the command failed with a Jest config error. Rebuilt as a 36-check suite that boots the real application, migrates, truncates and seeds its own database, and runs in CI. Covers auth and deny-by-default, RBAC row scoping at all three visibility levels, the leave ledger, idempotent punch replay, geofence flagging, the payroll lifecycle with separation of duties, and the append-only audit trail. |
| **CW-001** · Privileged accounts could sign in with a password alone | TOTP (RFC 6238), implemented against the RFC's own test vectors rather than pulled in as a dependency, and required — not offered — for any account holding `employee:read:sensitive`, `payroll:run`, `payroll:approve` or `role:manage`. A correct password for such an account now yields a challenge token, not a session; that token carries a `typ` claim the access-token strategy rejects, which is the only thing separating it from a full session since both are signed with the same secret. Codes cannot be replayed inside their own window, recovery codes are single-use, a wrong code counts towards the password lockout, and disabling is refused for an account that must have one. Recovery codes are stored as SHA-256 digests rather than argon2 as the ticket originally said: at 100 bits of entropy a slow KDF buys nothing and only gives a half-authenticated endpoint a way to burn CPU, and refresh tokens already use the same treatment for the same reason. Mobile can present a code but not yet enrol — see CW-021. |
