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
