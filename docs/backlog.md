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
| **0** | A baseline to measure from | CW-028 · CW-030 · CW-036 · CW-029 |
| **1** | A stranger can install it | CW-022 · CW-027 |
| **2** | The pilot can run | CW-010 · CW-023 · CW-024 · CW-025 · CW-026 |
| **3** | After the pilot | CW-016 · CW-031 · CW-009 · CW-014 · CW-008 · CW-032 · CW-033 |
| **4** | When someone actually needs it | CW-004 · CW-019 · CW-005 · CW-021 · CW-017 |

The plan was drawn up before CW-002, CW-003, CW-006, CW-007 and CW-020 landed,
and those five came out of it as they were finished. Two consequences worth
stating rather than leaving implicit:

- **Phase 1 lost CW-020, CW-034 and CW-035** — the advisories are cleared, and
  the README now carries screenshots and an English translation.
- **Multiple instances are supported now, not forbidden.** The plan assumed one
  instance scaled vertically; CW-003 and CW-007 made replicas a configuration
  rather than a hazard. Nothing downstream depends on the old assumption.

`CW-031` — a hosted demo — is the largest single thing that would help anyone
evaluate this project, and it sits in phase 3 only because it is blocked on an
unanswered question about who pays for the assistant's API usage.

---

## P0 — blocks a real deployment

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

Two statements in the docs are not true, and each could lead somebody to rely on
something that is not there.

**Scope**
- Remove "multi-tenant" as a property of the product. `organizationId` is
  defence in depth inside a single-organisation deployment and no test covers
  two organisations sharing a database. *(Done in `spec.md`; `README.md`,
  `architecture.md` and `security.md` still need the pass.)*
- State plainly that the Thai tax and social-security rules have **not** been
  reviewed by anyone qualified, in `README.md` and at the head of
  `payroll-thailand.md`. They were written from published sources and
  unit-tested for internal consistency, which proves the code matches what its
  author believed — not that the belief is correct.
- Open an issue inviting an accountant or payroll professional to review the
  rules. Open source is a reasonable way to find one.

**Acceptance** No document claims multi-tenancy; no reader can reach the payroll
rules without meeting the warning first.

**Files** `README.md`, `docs/`

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

### CW-023 · Send notifications by email
`P1` · platform · **M**

`NotificationsService` writes in-app rows and an outbox event, and nothing
delivers either. During the pilot that means an approver never learns a leave
request is waiting unless they happen to open the console. `.env.example` has no
mail configuration at all.

CW-006 landed while this was being planned, so the original argument for
bypassing the outbox is gone: register a handler with `OutboxRegistry` and the
retry, backoff and dead-letter behaviour comes for free.

**Scope**
- `MAIL_ENABLED=false` by default: boots, logs plainly that notifications are
  in-app only.
- `MAIL_ENABLED=true` with incomplete configuration: **refuses to boot**, the
  same rule `ASSISTANT_ENABLED` already follows.
- An outbox handler for the notification event, with Thai-capable templates for
  approval-pending, approved, rejected and document-ready.

**Acceptance**
- Submitting leave emails the approver.
- SMTP being down parks the event for retry and leaves the leave request alone.
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
- Re-binding without approval is impossible, and every re-binding is audited.

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
they have — and by now `main` has moved a long way in a short time.

**Scope** Tag `v0.1.0` at the current tree. Add `CHANGELOG.md` in Keep a
Changelog form. State the 0.x contract in `README.md`: breaking changes allowed,
recorded, no LTS before 1.0.

**Acceptance** `git describe` names a release, and the changelog has an entry
for it.

**Files** `CHANGELOG.md`, `README.md`

---

### CW-036 · Say how this code was written
`P1` · project · **S**

Almost every commit in this repository was authored by an AI agent working under
direction, several of them adding thousands of lines at once. That is visible in
`git log` to anyone who looks, and it matters to three different readers: a
contributor judging how much to trust the code around their change, an operator
deciding whether to run payroll on it, and a reviewer working out who to ask
about a design decision.

Leaving it unsaid is not neutral. It reads as concealment the moment someone
runs `git log`, and it costs more credibility than stating it ever would.

**Scope**
- A "How this was built" section in `README.md`: the code was generated by an AI
  agent; the architecture, security model and priorities were decided, argued
  over and recorded by a human; `spec.md` § Agreed direction is that record.
- Say what it implies about review status — the suites pass and the decisions
  are documented, but no independent human has read every line.
- State in `CONTRIBUTING.md` how commits are expected to be shaped from here:
  one change per commit.
- **Do not rewrite the existing history.** It is accurate, and rewriting it to
  look more human would be the actual dishonesty.

**Acceptance** A contributor learns how this code was produced from the README,
not by inferring it from the commit sizes.

**Files** `README.md`, `CONTRIBUTING.md`

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

---

### CW-022 · Register the employee app for push
`P2` · mobile · **M**

The backend sends push through FCM and `POST /notifications/devices` has always
existed, but the Flutter app never calls it. So push delivery works and has
nowhere to go: no device has a token registered, and every send finds an empty
list.

**Scope**
- `firebase_core` and `firebase_messaging`, with the Android and iOS project
  configuration each needs.
- Ask for permission at a moment that makes sense — after the first approval
  the person submits, not on the splash screen.
- Register the token after sign-in and refresh it when FCM rotates it;
  unregister on sign-out, or the next person to use the phone gets somebody
  else's leave approvals.
- Open the screen the notification points at when it is tapped: the payload
  already carries `type` and `notificationId`.

**Acceptance**
- A leave approval arrives on a real device within a minute of the decision.
- Signing out stops the notifications for that account on that device.
- A revoked or expired token is removed rather than retried — the backend
  already deletes what FCM reports as `UNREGISTERED`, so this is about not
  re-registering a stale one.

**Files** `mobile/lib/core/`, `mobile/lib/features/auth/`, `mobile/android/`,
`mobile/ios/`

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
broken product, not a disabled option. The boot-time rule stays as it is; this
is only about the UI.

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
Without a CLA the licence cannot realistically be changed later — an accepted
consequence, but it should be a stated one.

**Scope** Document DCO in `CONTRIBUTING.md`, add the sign-off line to the pull
request template, add a CI check for it, and note in `README.md` that there is
no CLA and why.

**Acceptance** A pull request without `Signed-off-by` fails CI with a message
saying how to fix it.

**Files** `CONTRIBUTING.md`, `.github/`

---

### CW-031 · A public demo instance
`P2` · project · **M**

Evaluating Cwork means cloning it, writing an `.env`, running compose, migrating
and seeding. The README's screenshots help, but nobody can try an approval flow
from a picture — and the assistant, the thing that distinguishes this from other
open-source HR systems, is off by default.

**Blocked on a decision:** who pays for the demo's LLM usage. Asking visitors for
their own API key is not an option — it trains people to paste credentials into
unfamiliar sites. If no budget is agreed, ship the demo with the assistant off
and a short screen recording instead.

**Scope**
- A hosted instance reset hourly, writable so approval flows can be tried.
- Sign-in as employee, manager or HR in one click.
- If the assistant is on: cheapest model, a hard spending cap at the provider,
  and per-IP rate limiting on the assistant routes — the existing per-user caps
  do nothing when everyone shares a demo account.

**Acceptance** Someone with no local setup can approve a leave request within a
minute of opening the link, and no single visitor can exceed the spending cap.

**Files** `docs/`, `README.md`, deployment configuration

---

### CW-032 · Test migrations from the previous release in CI
`P2` · platform · **S**

CI only ever runs `prisma migrate deploy` against an empty database, so nothing
proves an existing installation survives an upgrade. Once other people are
running Cwork, a bad migration destroys their data, not ours.

**Scope** A job that checks out the previous tag, migrates and seeds, then
migrates up to the current commit and asserts the seeded data is still readable.
Depends on CW-028 for a first tag to upgrade from.

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
it as it is. `isRootedDevice` is the opposite case and is handled by CW-025.

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
| **CW-011** · `npm run test:e2e` was a dangling script | It pointed at `./test/jest-e2e.json`, which did not exist, and `backend/test/` was an empty directory, so the command failed with a Jest config error. Rebuilt as a suite that boots the real application, migrates, truncates and seeds its own database, and runs in CI — 36 checks at the time, 49 once CW-001 added its own. Covers auth and deny-by-default, RBAC row scoping at all three visibility levels, the leave ledger, idempotent punch replay, geofence flagging, the payroll lifecycle with separation of duties, and the append-only audit trail. |
| **CW-001** · Privileged accounts could sign in with a password alone | TOTP (RFC 6238), implemented against the RFC's own test vectors rather than pulled in as a dependency, and required — not offered — for any account holding `employee:read:sensitive`, `payroll:run`, `payroll:approve` or `role:manage`. A correct password for such an account now yields a challenge token, not a session; that token carries a `typ` claim the access-token strategy rejects, which is the only thing separating it from a full session since both are signed with the same secret. Codes cannot be replayed inside their own window, recovery codes are single-use, a wrong code counts towards the password lockout, and disabling is refused for an account that must have one. Recovery codes are stored as SHA-256 digests rather than argon2 as the ticket originally said: at 100 bits of entropy a slow KDF buys nothing and only gives a half-authenticated endpoint a way to burn CPU, and refresh tokens already use the same treatment for the same reason. Mobile can present a code but not yet enrol — see CW-021. |
| **CW-002** · Uploads were never scanned | `FileObject.scanStatus` existed and nothing ever set it, on a system that takes résumés from a public careers page. Uploads now stream to clamd *before* anything is written to storage, so malware is never stored for a later change to expose. The clamd INSTREAM protocol is implemented directly against its specification rather than pulled in as a dependency, and unit-tested. The rule throughout is that a scanner which is not working is never a pass: unreachable, timed out, or a reply that cannot be parsed all land the file at `PENDING`, which is refused on download and retried hourly. A detection is refused at upload with the signature named, audited and notified; quarantine destroys the bytes and keeps the record. Off by default, with a `clamav` compose profile to turn it on, and the API states which mode it is in at every boot. |
| **CW-003** · Rate limiting was per-instance | `@nestjs/throttler` keeps counters in memory, so two replicas behind a load balancer handed out twice the budget and a restart forgot every counter. `THROTTLE_STORAGE=postgres` now shares them through the database that is already there — no Redis, nothing extra to run or back up — as one `INSERT … ON CONFLICT DO UPDATE` so two instances racing on a key cannot both decide they were first. In-memory stays the default for a single instance, and the API says which store it is using at boot. If the store is unreachable the limiter fails open and logs an error: a rate limiter is not worth locking everyone out of a healthy system for. **The ticket’s premise was wrong** and the fix is worth recording: it said the in-memory throttler made "the sign-in lockout per-instance". It never did. The account lockout lives in `users.failedLoginCount` / `users.lockedUntil` and has always been shared. What was per-instance is the per-client *request budget* — which is what catches the caller no single lockout would notice, one wrong password each against a hundred accounts. The e2e suite proves both halves by booting two applications against one database. |
| **CW-007** · Every replica ran every scheduled job | CW-003 made more than one instance a supported configuration and left the cron schedule running on all of them. Each task now takes a **transaction-scoped Postgres advisory lock** before it does anything and the instances that do not get it stand down — no table, no migration, no lease, nothing to switch on, and nothing to clean up: an instance killed mid-job loses its connection and Postgres releases the lock by itself. Lock ids are written out by hand in `domain/job-locks.ts` rather than hashed from the job name, because a hash is one collision away from two unrelated jobs blocking each other for ever and a literal is what you can look for in `pg_locks`. **Two things in the ticket were wrong.** It said a double run would grant leave quota twice: it would not — `rolloverYear` *assigns* the carried balance rather than adding to it, separations are filtered by status, and the purges are `deleteMany`, so every task was already idempotent. What a double run actually costs is the work itself, the duplicated audit and notification rows, and write-write races between instances doing identical work at the same instant. It also asked for a heartbeat "so a crashed holder does not block the next run" — a transaction-scoped lock has nothing to heartbeat, and that is precisely the argument for it over a lease table. The cost, stated in [operations.md](./operations.md): the job runs with a transaction open, so `JOB_LOCK_TIMEOUT_MS` bounds it at fifteen minutes by default and an open transaction holds back vacuum meanwhile. The e2e suite boots three complete applications against one database and never relies on timing to decide the winner — where a race would be the point, the test takes the lock itself and holds it. |
| **CW-006** · The outbox table had no producer and no consumer | The ticket said `outbox_events` "is written transactionally and nothing reads it". Half right: nothing read it, and **nothing wrote it either** — the table had been in the schema since the first migration with no reference to it anywhere in `src`, so the work was both halves rather than one. `OutboxService.record` takes the caller's transaction client and will not work without one, because an event written on the ordinary client is a plain dual write with extra steps and nothing at the call site would show the difference. `OutboxDispatcher` claims a batch with `SELECT … FOR UPDATE SKIP LOCKED`, dispatches to whoever registered for the type, backs off from 30 seconds doubling to a 30-minute cap, and parks an event as a dead letter after `OUTBOX_MAX_ATTEMPTS`. Dead letters are never purged — only delivered events are — because that row is the only record that somebody was owed a message and did not get it. Unlike the scheduled tasks of CW-007, **every instance polls**: `SKIP LOCKED` means each dispatcher takes rows nobody else holds, so three replicas drain three times faster rather than fighting. Delivery is at least once and says so. The producer shipped with it is notifications: the in-app row and the event that will carry it out by email or push are written in one transaction, so no message is ever sent for a notification that does not exist. Nobody is listening yet — an event with no handler is marked delivered rather than queued for ever, and the API warns at boot when no handlers are registered at all — which is exactly the seam CW-005 plugs into. Closed straight afterwards, in the same branch: every call site now passes its own transaction client, so the change and the message about it commit together. `notifyIn`/`notifyManyIn` take the caller's `tx` and throw rather than swallow — inside a transaction there is nothing else they could do, since PostgreSQL has already aborted and catching would only move the failure to the commit. Four of the call sites had no transaction to join and now have one: approving a resignation writes the request, the employee and the employment event together, which was three separate writes that could always have disagreed with each other. The best-effort `notify` survives for exactly one caller — an upload the scanner refused, where nothing was stored and there is nothing to be atomic with — and a unit test fails if a second one appears without being added to the list with a reason. |
| **CW-005** · Notifications never left the database | In-app rows and nothing else, so nobody learned a leave request was waiting unless they opened the console. SMTP is now written out against RFC 5321 and FCM's HTTP v1 API against its own two requests — the same trade as the clamd client and the TOTP implementation, because what is actually needed is one well-specified conversation and the alternative is a transport abstraction and a dependency tree. Both register as outbox handlers, so a failed send retries on the backoff CW-006 already built and never blocks the request that caused it. **The retry rule is the part worth arguing about**: the ticket asked for a bounce to be "retried with backoff and then recorded as failed", but eight attempts over an hour at a mailbox refused for not existing teaches nothing and buries the one message somebody should have looked at. A new `PermanentDeliveryError` lets a handler say so, and the dispatcher dead-letters it at once: SMTP 5xx and FCM 401/403 immediately, SMTP 4xx and FCM 5xx on the backoff. `starttls` refuses to send if the server does not offer STARTTLS rather than putting the relay password on the wire, and a device FCM calls `UNREGISTERED` has its row deleted instead of retried. Preferences are a rule per notification type with `*` as the catch-all; the unsubscribe link in every footer is public and signed, because nobody should have to sign in to stop receiving email, and it turns off email only — the click happened in an email, and in-app notifications are the record rather than a message. Both fakes speak the real protocols, and the FCM one verifies the service-account assertion against the key pair it generated, so a client that signs the wrong bytes fails in CI rather than at three in the morning. **Not done, and it is not backend work**: the employee app does not register an FCM token yet, so push has nowhere to go until it does. |
| **CW-020** · Nine high-severity advisories in shipped dependencies | Two root causes, not nine: multer below 2.3.0 (four advisories) and deepmerge-ts below 8.0.0 reached through `@prisma/config`. Everything else was npm reporting the parents. Both are fixed upstream but neither parent has picked the fix up — the latest NestJS 11 still pins multer 2.2.0, and Prisma 7 still pins deepmerge-ts 7 — so the fixed versions are pinned through npm `overrides` rather than by taking two major upgrades for a security patch. `npm audit --omit=dev` is clean, and a CI job re-checks it weekly as well as on every push, because an advisory is published against code that has not changed. The upload endpoint also now states its whole contract as multer limits (one part, named `file`, no text fields), which is what actually neutralises the two field-name advisories: they need a text part, and there is no longer one to send. **The ticket's premise was wrong** in a way worth recording: it called multer "reachable from the public careers page". It is not. `POST /careers/:orgCode/jobs/:slug/apply` takes JSON, and the only multipart route in the system, `POST /files/upload`, sits behind the global auth guard — so this was an authenticated denial of service, not an anonymous one. Still worth fixing; not the emergency the ticket described. The upgrade also broke something on the way in, which is the argument for the tests: Nest maps multer errors by matching their *message*, multer 2.4 reworded `LIMIT_UNEXPECTED_FILE`, and a file sent under the wrong field name started returning 500 with a stack trace. The exception filter now reads `err.code`, as multer's own documentation asks. |
| **CW-035** · The README was Thai only | A reviewer who does not read Thai could not assess the project at all, which for something that wants contributors is a hard stop. `README.md` is now English with `README.th.md` alongside it and a switcher at the top of both. This is not CW-016: the *interface* is still Thai-only, and the translation layer for both clients remains open. |
| **CW-034** · The README described the system and showed none of it | Seeing any screen cost a clone, an `.env`, a compose run, a migration and a seed — minutes of commitment from someone who had not yet decided the project was worth any. Twenty-one console screenshots and eight from the app now sit in `docs/screenshots/`, fourteen of them in the README itself. The cross-client recording the ticket also asked for — submit leave on the phone, approve it in the console — was not done; open a new ticket if it is wanted. |
