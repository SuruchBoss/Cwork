# Cwork — specification

What the system does, module by module. This is the reference for what
"correct" means: when an implementation and this document disagree, one of them
is a bug. The tie-breaker is the tests: `*/domain/*.spec.ts` for the rules
below, and `backend/test/*.e2e-spec.ts` for the ones that only show up when the
whole thing runs.

It describes the system as built, not as wished for. Work that is *not* built
lives in [backlog.md](./backlog.md); the architecture behind these decisions is
in [architecture.md](./architecture.md).

**Status:** version 0.1.0. Verified end to end — sign-in through payroll — but
not audited. See [Non-functional requirements](#non-functional-requirements)
for the honest limits.

---

## 1. Scope

Cwork is a self-hosted HR information system. **One deployment serves exactly
one organisation.**

Every tenant-owned table carries `organizationId` and every query filters on it,
but that is defence in depth — not a guaranteed tenant boundary, and not a claim
that two organisations may share a database. Nothing in the test suite exercises
that case, so nothing should depend on it.

| In scope | Out of scope |
|---|---|
| Employee records, org structure, employment history | Applicant-tracking integrations (LinkedIn, Indeed) |
| Recruitment: requisition → posting → application → assessment → interview → offer → employee | Background-check vendors |
| Leave: entitlement, accrual, request, approval, balance ledger | Time-off marketplaces |
| Attendance: clock in/out, geofencing, shifts, corrections, overtime | Biometric hardware |
| Payroll: compensation, Thai PIT and social security, payslips | Bank payment file generation, e-filing |
| Benefits, expense reimbursement | Procurement, general ledger |
| Performance: review cycles, weighted KPIs, calibration | Compensation-planning modelling |
| An HR assistant that answers from your own policy documents | A general-purpose chatbot |

### Actors

| Actor | Reaches the system through |
|---|---|
| Employee | Flutter mobile app; the console if granted a console role |
| Line manager | Both — approvals, team attendance, team KPIs |
| HR officer / HR admin | Web console |
| Payroll officer | Web console |
| Finance approver | Web console — approves payroll runs they did not prepare |
| System administrator | Web console — roles, org structure, audit |
| Candidate | Public careers page; no account |

---

## Agreed direction

Recorded 2026-09-15, from a design review of the whole system. These are
*decisions*, not shipped behaviour — where one is not yet implemented it names
the ticket that will implement it. [backlog.md](./backlog.md) holds the work;
this holds the reasoning, so that a contributor can tell a deliberate choice
from an oversight.

### What this project is

Cwork is an **open-source product meant for other people to run**, not an
internal system that happens to be public. That is the bar everything below is
set against: a stranger has to be able to install it, evaluate it, and find out
what it does not do without reading the source.

| | |
|---|---|
| Licence | Apache-2.0, kept. Contributions under DCO (`Signed-off-by`), no CLA — which also means the licence cannot realistically be changed later (CW-029). |
| Versioning | 0.x. Breaking changes are allowed and recorded in `CHANGELOG.md`. No LTS before 1.0 (CW-028). |
| Deployment | One organisation per deployment. One instance is the default and what the pilot will run on; several are supported rather than forbidden, since CW-003 and CW-007 made replicas a matter of configuration. |
| Language | Thai is the interface default. English is a translation: keys are English, Thai ships as a translation file. Content an organisation types in — leave type names, departments, positions — is not translated (CW-016). The README is already bilingual (CW-035). |
| Dates | The database stores Gregorian years, always. The Buddhist era exists only in Thai presentation. |

### Before real people use it

There is no production user. The first is a **pilot: one organisation, 5–20
employees, four weeks, leave and attendance only — no payroll.**

Three measures, agreed before it starts:

1. **How often HR corrects data by hand.** This is the readiness signal. If it
   exceeds what the pilot organisation will tolerate, feature work stops until
   it comes down.
2. **What share of punches are flagged.** A high number means the geofence or
   the offline ceiling is set wrong — not that employees are cheating.
3. **What employees ask a manager because they could not find it in the app.**
   That is the missing-feature list, observed rather than guessed.

**Location is captured when a punch is made and at no other time.** The app does
not track anyone continuously. Before the pilot, employees get that in writing
together with a retention period and a way to ask for erasure (CW-026).

### Decisions a contributor would otherwise have to guess at

**An optional feature fails loudly when switched on and stays quiet when off.**
`ASSISTANT_ENABLED=false` boots without complaint; `ASSISTANT_ENABLED=true` with
no API key refuses to boot. Mail follows the same rule, as malware scanning
already does. Anything disabled is hidden in the UI rather than shown as a
control that cannot work: both clients read the deployment's flags from the
public `GET /config` and leave out what is switched off.

**Attendance trusts the employee, within a ceiling.** A punch outside the
geofence is flagged, not refused, and an offline punch is credited at capture
time. Both are open to abuse and both are kept, because an employee must always
be able to prove they turned up. The bound is that a punch held offline beyond a
configured window, or taken on a rooted device, is flagged for a manager to
confirm (CW-025).

**A flagged punch is confirmed, never rewritten.** Confirmation runs through the
existing approval engine, but its only outcomes are *acknowledge* and *reject
the flag*. It never creates or deletes a punch, because `attendance_punches` is
append-only at the database level and that has to stay true (CW-025).

**The assistant is everywhere and required nowhere.** AI features are welcome on
any screen, under one rule: whatever the assistant does, a person must be able
to do without it — slower, more clicks, but reachable. An organisation running
`ASSISTANT_ENABLED=false` gets a slower product, never a broken one. That rule
is what keeps the system installable where payroll data cannot leave the
building, and it is precisely why the AI features are allowed to be ambitious.

**The model narrates; it never computes.** Every figure an AI feature shows
comes from a tool backed by the same pure domain functions the console uses.
The model may say what a number means. It may not work out what the number is.
A payroll figure the model arrived at by itself is a defect, not a rounding
difference.

**A tool may not widen who the caller can see.** [ADR-0004](./adr/0004-assistant-tool-scoping.md)
says assistant tools take no employee id. The rule it is reaching for is
slightly broader: *no tool parameter may extend the caller's reach*. A payroll
run id or a review id the caller already owns does not extend it; an employee
id does. Manager-facing tools take no subject at all — they resolve their scope
from the caller's permissions through the same `employeeVisibilityFilter` the
console uses, so a manager sees their reports and nobody else's, by the same
code path, whether they clicked or asked.

**Self-hosting the model is a requirement, not a convenience.** The more the
assistant does, the more payroll and identity data passes through it. An
operator who cannot send that to a third party must be able to point it at a
model they run (CW-038). This reverses an earlier recommendation to simply
delete the unimplemented provider option.

**No schema for features that do not exist.** A column nothing writes is a lie
told to whoever reads the schema next. Kiosk devices get no `type` field until
kiosk devices are built, and the unused anti-fraud columns are removed rather
than left as decoration (CW-033).

### Open questions

Recorded because they are unanswered, not because they are unimportant.

| | |
|---|---|
| How long may a punch sit offline before it needs confirming? | 12 hours is a placeholder. The pilot's flag rate decides it. |
| Who pays for the AI in a public demo? | Unresolved. If nothing is decided, the demo ships with the assistant off and a screen recording in its place (CW-031). |
| Who reviews the Thai tax and social-security rules? | Nobody yet (CW-030). |
| Keep or delete `AttendancePunch.selfieFileId`? | Proposed: delete it (CW-033). |

---

## 2. Identity, roles and permissions

### 2.1 Authentication

- Email and password. Passwords are hashed with **Argon2id** (19456 KiB memory,
  t=2, p=1). No other hash is accepted.
- Sign-in returns a short-lived **access token** (JWT, 15 min default) and a
  long-lived **refresh token** (30 days default) — unless the account owes a
  second factor, in which case it returns a challenge instead. See
  [Second factor](#second-factor) below.
- Refresh tokens **rotate** on every use. Presenting a refresh token that has
  already been used invalidates the entire token family — the signal of a stolen
  token is that it gets used twice.
- `User.sessionsValidFrom` invalidates every outstanding token for that user at
  once. Password change and forced sign-out both set it.
- Failed sign-ins lock the account after `AUTH_MAX_FAILED_ATTEMPTS` (default 5)
  for `AUTH_LOCKOUT_MINUTES` (default 15).
- Both clients refresh through a **single-flight** guard: concurrent 401s
  collapse into one refresh, never a stampede.
- The credential endpoints — sign-in, MFA verify and enrolment — carry their own
  rate limit, `AUTH_THROTTLE_LIMIT` (default 10/minute), far tighter than the
  global one.
- Rate-limit counters are in-process by default and shared through PostgreSQL
  when `THROTTLE_STORAGE=postgres`, which is what a deployment with more than one
  instance needs. The account lockout above is a separate mechanism and has
  always been shared, since it lives on the user row.

**Requirement:** no endpoint is reachable without a valid access token unless it
is explicitly marked public. The `JwtAuthGuard` is registered globally, so the
default for a new endpoint is *denied*.

#### Second factor

TOTP (RFC 6238), verified against the RFC's own test vectors.

**Requirement: a privileged account cannot obtain an access token with only a
password.** Holding `employee:read:sensitive`, `payroll:run`, `payroll:approve`
or `role:manage` makes a second factor mandatory; so does
`settings.security.requireMfa` on the organisation.

Sign-in becomes two steps for such an account. A correct password returns a
**challenge token** rather than a session:

| Response | Meaning |
|---|---|
| `mfaRequired: false` | Full session — tokens and user |
| `mfaRequired: true, mfaEnrolled: true` | Present a code at `POST /auth/mfa/verify` |
| `mfaRequired: true, mfaEnrolled: false` | Enrol first, then `POST /auth/mfa/complete-enrolment` |

**Requirements:**

1. The challenge token carries a `typ` claim the access-token strategy rejects.
   It is signed with the same secret, issuer and audience as an access token, so
   that claim is the only thing between "password accepted" and a session.
2. The secret is AES-256-GCM encrypted, returned in the clear exactly once, and
   inactive until a code proves it was scanned.
3. **A code cannot be spent twice**, even inside its own validity window.
4. Recovery codes are single-use and stored as digests; they are shown once.
5. A wrong code counts towards the same lockout a wrong password does.
6. Disabling requires a current code, and is refused for an account that is
   required to have one.

### 2.2 Authorisation

Permissions are strings shaped `<resource>:<action>`, listed in
`backend/src/core/security/permissions.ts`. Roles are named bundles of them, so
an organisation can define a role without a code change.

`:self` and `:team` variants narrow the *rows* a permission reaches:

| Suffix | Rows visible |
|---|---|
| none | Every employee in the organisation |
| `:team` | The caller's direct and indirect reports |
| `:self` | The caller's own employee record only |

Row scoping is applied by `employeeVisibilityFilter(user)` as a Prisma
`where` clause, not by filtering in the controller. The seeded roles are
`SUPER_ADMIN`, `HR_ADMIN`, `HR_OFFICER`, `PAYROLL_OFFICER`, `MANAGER`,
`EMPLOYEE`, plus two narrower ones.

**Requirement:** decrypting a national ID or bank account needs
`employee:read:sensitive` — a separate privilege from `employee:read`, and every
use is audited.

### 2.3 Tenant scoping

Every tenant-owned table carries `organizationId`, and every query filters on
the caller's organisation. There is no global "current tenant" — it is an
explicit parameter, because an implicit one is a cross-tenant leak waiting for a
forgotten `await`. See [ADR-0003](./adr/0003-explicit-tenant-scoping.md).

To be explicit: this is a safety net inside a single-organisation deployment. It
is not multi-tenancy, and must not be described as such — see [§1](#1-scope).

---

## 3. Employees

### 3.1 Records

An `Employee` holds identity, employment terms and the relations for contacts,
dependants, education, experience, documents and bank accounts. National ID and
bank account number are encrypted at the column level with **AES-256-GCM**,
stored as `v1:iv:tag:ciphertext`.

- Employee numbers come from `NumberSequence`, so they are gapless per
  organisation and safe under concurrency.
- Deletion is **soft** (`deletedAt`). Employment history is evidence.
- Every change to employment terms writes an `EmploymentEvent` — the record of
  *why* a title or salary changed, not just that it did.

### 3.2 Org structure

`Department`, `Position` and `WorkLocation` are per-organisation. Departments
nest. A `WorkLocation` carries the coordinates and radius used for geofencing.

### 3.3 Offboarding

`ResignationRequest` → approval chain → `OffboardingTask` checklist →
`ExitInterview`. An employee with `resignation:submit:self` can start it; only
`offboarding:manage` can complete the checklist or record the interview.

---

## 4. Leave

### 4.1 Types and entitlement

`LeaveType` is configuration: paid or unpaid, whether it needs a document,
whether it allows half or hourly days, carry-over limits, and the accrual
method. The seed ships eight Thai statutory types.

`LeaveEntitlement` is the per-employee, per-year quota. Accrual methods:

| Method | Rule |
|---|---|
| `ANNUAL_GRANT` | Full quota at the start of the leave year |
| `MONTHLY_ACCRUAL` | Earned month by month — the usual treatment for new joiners |
| `SENIORITY_TIERED` | The tier matching years of service |

### 4.2 Computing a request

`computeLeaveDays()` explodes a date range into the working days it actually
consumes.

**Requirements:**

1. Days that are not working weekdays for the organisation are excluded.
2. Public holidays inside the range are excluded. *Friday to Monday over a
   holiday weekend costs 2 days, not 4.*
3. Half days count 0.5. Hourly leave counts `hours ÷ hoursPerDay` (default 8).
4. The computation is a pure function of its inputs — no database, no clock.

### 4.3 Balance ledger

Balance is `granted + adjustments − used − pending`. A submitted request
**reserves** its days as pending immediately, so two overlapping requests cannot
both fit inside one remaining day. Approval moves pending → used; rejection or
cancellation returns them.

States: `DRAFT → PENDING → APPROVED | REJECTED | CANCELLED`, plus
`CANCELLED_AFTER_APPROVAL` for a cancellation once the days were already used.

**Requirement:** a balance is never negative unless someone with
`leave:balance:adjust` made it so deliberately, and that adjustment is audited.

---

## 5. Attendance

### 5.1 Punches

`AttendancePunch` is an **append-only** stream. A database trigger raises an
exception on `UPDATE` or `DELETE`. Corrections are new rows plus an
`AttendanceCorrection`, never an edit.

Each punch carries a client-generated id, so a retry from a phone that lost
connectivity is **idempotent** — replaying a punch does not double-count it.

### 5.2 Geofencing and flags

`checkGeofence()` treats a punch as inside when `distance − gpsAccuracy ≤ radius`.
Penalising someone for their phone's error margin generates false anomalies and
destroys trust in the flags that matter.

**Requirement: a punch outside the fence is flagged, never rejected.** The same
applies when GPS is off, denied or times out. An employee must always be able to
prove they turned up; HR reviews the flag afterwards.

Flags: `MOCK_LOCATION`, `ROOTED_DEVICE`, `OUTSIDE_GEOFENCE`, `NO_LOCATION`,
`LOW_GPS_ACCURACY`, `CLOCK_DRIFT`, `NEW_DEVICE`, `IMPOSSIBLE_TRAVEL` (two
positions further apart than 200 km/h could explain).

### 5.3 Derived records

`deriveAttendance()` folds the punch stream for one employee-day into an
`AttendanceRecord`: first in, last out, worked minutes net of breaks, late and
early-leave minutes against the assigned shift, and a status of `PRESENT`,
`LATE`, `ABSENT`, `ON_LEAVE`, `HOLIDAY` or `DAY_OFF`.

The derivation is pure and re-runnable: the punch stream is the source of truth,
and the record is a cache of it.

**Shift assignment is API-only.** Late and early-leave minutes are measured
against the assigned shift, but nothing in the console defines a shift or
assigns one, so in practice those numbers come from seeded or API-created data.
See CW-010 in the [backlog](./backlog.md).

### 5.4 Offline capture

The mobile app queues punches while offline in durable storage and replays them
on reconnect. The queue is bounded (50) and drops oldest-first. A punch the
server rejects permanently (4xx) is dropped from the queue rather than retried
forever.

The server credits the instant the punch was *captured*, not the instant it
arrived, so someone who clocked in at a warehouse with no signal is not punished
for it. That trust is deliberate and it is meant to be bounded — see
[Agreed direction](#agreed-direction) and [CW-025](./backlog.md), which is not
yet implemented.

### 5.5 Overtime

`OvertimeRequest` is submitted, approved through the chain, then paid in the
next run. Default multipliers are the Labour Protection Act's:

| Type | Multiplier |
|---|---|
| Overtime on a normal working day | 1.5× |
| Work on a day off, within normal hours | 1× |
| Work on a public holiday | 2× |
| Overtime on a public holiday | 3× |

Organisations that pay more override these in `settings.overtime`.

---

## 6. Payroll

> **These rules have not been reviewed by an accountant, a payroll bureau, or
> anyone else qualified to confirm them.** They were written from published
> sources and are unit-tested for internal consistency, which proves the code
> matches what its author believed — not that the belief is correct. Verify them
> yourself before paying anyone. See [CW-030](./backlog.md).

### 6.1 Run lifecycle

`PayrollPeriod` → `PayrollRun` → `Payslip` + `PayslipItem`.

`DRAFT → CALCULATING → CALCULATED → PENDING_APPROVAL → APPROVED → PAID`, with
`FAILED` and `CANCELLED` as terminal branches.

**Requirement — separation of duties:** whoever calculated a run cannot approve
it. Enforced by the API, not by policy. `payroll:run` and `payroll:approve` are
separate permissions and the service compares the actor against the preparer.

**Requirement:** once a run is `PAID`, the attendance and leave it consumed are
locked against edits for that period.

### 6.2 Proration

**A monthly-salaried employee is paid the full month minus *explicit* unpaid
leave and absence.** Days that simply have not been closed out — future dates,
or a clock-in rollout still in progress — must not reduce pay.

```
effectivePayableDays = max(0, employeeWorkingDays − unpaidLeaveDays − absentDays)
```

where `employeeWorkingDays` is the organisation's calendar working days for the
period, clipped to the employee's hire and termination dates.

Getting this wrong silently shorts people, which is the worst class of payroll
bug. It is regression-tested.

### 6.3 Thai personal income tax

`THAI_TAX_RULES_2026` is **data**, not code: brackets, allowance caps and
deduction rates in one exported object. A new tax year is a new rule set.

Progressive brackets, 2026:

| Net income (THB) | Rate |
|---|---|
| 0 – 150,000 | 0% |
| 150,001 – 300,000 | 5% |
| 300,001 – 500,000 | 10% |
| 500,001 – 750,000 | 15% |
| 750,001 – 1,000,000 | 20% |
| 1,000,001 – 2,000,000 | 25% |
| 2,000,001 – 5,000,000 | 30% |
| above 5,000,000 | 35% |

Expense deduction 50% of income capped at 100,000. Personal allowance 60,000;
spouse 60,000; child 30,000 (60,000 for a second or later child born 2018 or
after); parent care 30,000 each, at most 4. Insurance, provident fund, RMF and
SSF are capped individually and again in combination.

**Requirement — monthly withholding** projects the annual liability from
year-to-date actuals and divides the remainder over the remaining periods. A
mid-year first run must fold `priorEmployerIncome` and `priorEmployerTax` into
the year-to-date figures, or it under-withholds and the employee gets a bill in
March.

### 6.4 Social security (มาตรา 33)

5% of wage, wage floored at 1,650 and capped at 15,000 THB/month — so the
contribution is between 83 and 750 THB. The employer matches it. An annual cap
applies per employee.

### 6.5 Payslip integrity

`netPay = grossEarnings − totalDeductions` is a **database CHECK constraint**,
not only application logic. A payslip that does not balance cannot be stored.

Employer contributions are recorded on the payslip as
`EMPLOYER_CONTRIBUTION` lines: they are employer cost, never deductions from
the employee, and never part of net pay.

### 6.6 Benefits and expenses

`BenefitPlan` / `BenefitEnrollment` carry employer and employee cost, which flow
into the run as recurring lines. `ExpenseClaim` has line items with categories
and receipts, goes through the approval chain, and pays through payroll or
outside it.

**Benefits are API-only.** The endpoints, models and permissions are all there,
but the console has no benefits screen, so enrolment means calling the API
directly — and enrolments feed payroll. See CW-009 in the
[backlog](./backlog.md).

---

## 7. Approvals

One declarative engine serves every approvable entity:
`LEAVE_REQUEST`, `OVERTIME_REQUEST`, `EXPENSE_CLAIM`, `ATTENDANCE_CORRECTION`,
`RESIGNATION`, `JOB_REQUISITION`, `JOB_OFFER`, `PAYROLL_RUN`,
`DOCUMENT_REQUEST`.

An `ApprovalPolicy` has ordered `ApprovalPolicyStep`s, each resolving an
approver by `LINE_MANAGER`, `DEPARTMENT_HEAD`, `ROLE` or `SPECIFIC_USER`.
Policies carry `conditions` (for example, amount thresholds) and a `priority`;
the highest-priority policy whose conditions match wins.

Submitting creates an `ApprovalInstance` and the first `ApprovalTask`. Tasks
resolve to `APPROVED`, `REJECTED`, `SKIPPED`, `DELEGATED` or `EXPIRED`.

**Requirement:** the approvals module must not import the modules it approves
for. Outcomes are dispatched through `ApprovalOutcomeRegistry`, which is what
keeps leave, payroll and recruitment from forming an import cycle.

---

## 8. Recruitment

`JobRequisition` (approved) → `JobPosting` (public) → `Candidate` +
`Application` → `AssessmentInvitation` → `Interview` + `InterviewScorecard` →
`JobOffer` → employee record.

- The careers page is public and unauthenticated. Applications require **PDPA
  consent** and carry a retention date.
- Assessments auto-grade objective questions. **A paper with any question
  needing manual grading is held back from a final score** rather than reported
  as partially graded — a half-scored candidate is worse than an ungraded one.
- Accepting an offer converts the candidate into an `Employee`, carrying the
  agreed terms rather than re-typing them.

---

## 9. Performance

`ReviewCycle` → `KpiTemplate` → per-employee `KpiGoal` with weights →
`KpiCheckIn` → `PerformanceReview` (self and manager) → calibration.

- Achievement is capped at **150%** by default, so one runaway metric cannot
  carry a review.
- A weighted score requires the weights to sum to 100; anything else is a
  configuration error, surfaced rather than normalised silently.
- Calibration (`review:calibrate`) is a separate permission from submitting.

---

## 10. Documents and files

`DocumentRequest` covers `EMPLOYMENT_CERTIFICATE`, `SALARY_CERTIFICATE`,
`PAYSLIP_COPY`, `TAX_WITHHOLDING_50BIS`, `VISA_SUPPORT_LETTER`,
`BANK_LOAN_LETTER` and `SOCIAL_SECURITY_LETTER`. An employee requests; someone
with `document:issue` fulfils.

**Nothing renders the document.** The API returns the *merge data* a certificate
template needs, and `issue` records the id of a file somebody uploaded — so the
approval trail ends in a manual step. See CW-008 in the
[backlog](./backlog.md).

Files go to local disk or S3-compatible storage behind one `StorageService`.
Uploads are checked against a MIME allow-list, a matching extension, and the
type's magic bytes, with a 20 MB ceiling.

The multipart parser is held to the same contract before any of that: one part,
named `file`, and no text fields at all. Two of the four multer advisories this
cleared are denial of service through a crafted *field name* rather than a file,
and a request that cannot carry a field cannot carry one of those.

**Requirement: uploads are scanned before they are stored.** The bytes are
streamed to clamd (`MALWARE_SCAN_ENABLED`); a detection is refused at upload
with the signature named, audited, and notified to the uploader, and nothing is
written. `FileObject.scanStatus` records the verdict:

| Status | Meaning | Downloadable |
|---|---|---|
| `CLEAN` | clamd passed it | yes |
| `INFECTED` | quarantined — the row survives, the bytes do not | no |
| `PENDING` | the scanner could not be reached, timed out, or replied unintelligibly | **no** |
| `SKIPPED` | scanning is switched off for this deployment | yes |

**Requirement: a scanner that is not working is never a pass.** Every failure
mode lands at `PENDING`, which is held rather than served; an hourly sweep
retries it. A file is served unscanned only when scanning is deliberately off,
which the API announces at every boot.

---

## 11. The HR assistant

Optional. `ASSISTANT_ENABLED=false` is the default and everything else works
unchanged.

### 11.1 Retrieval

`KnowledgeDocument` → `KnowledgeChunk`, searched with PostgreSQL full-text plus
trigram matching. No embeddings are required — which matters for Thai, where
the absence of word boundaries defeats naive tokenisation. pgvector is available
for semantic search but is not the default path.

### 11.2 Tools

Twelve tools: balances, payslips, attendance, policy lookup, filing a leave
request, requesting a document.

**Requirement — no tool takes an employee id.** Every one resolves its subject
from the authenticated principal. There is no parameter a prompt injection can
set to read someone else's payslip; the blast radius of a fully compromised
model is bounded by what that user could already see. See
[ADR-0004](./adr/0004-assistant-tool-scoping.md).

**Requirement:** write tools (`submit_leave_request`, `request_document`)
require `confirmed: true`, so the model cannot file a request the employee only
asked about.

### 11.3 Guardrails

- Messages are screened for crisis content **before** the model call, and such a
  message is answered with human contact details instead of a completion.
- Responses are redacted for PII **after** the model call.
- Tool iterations are capped (6); history is capped (20 messages).
- The provider is behind an `LlmProvider` interface. With the assistant off, a
  `DisabledProvider` is bound, so nothing reaches an external API.

---

## 12. Audit

Every mutating request that touches employee data writes an `AuditLog` row:
actor, action, entity type and id, before and after, IP, user agent, request id.

**Requirement: the audit trail is append-only in the database.** A trigger
raises an exception on `UPDATE` or `DELETE` against `audit_logs`. A compromised
application account can add entries but cannot rewrite history.

---

## 13. Clients

### 13.1 Web console

React 19 + Vite. Server state is **TanStack Query**; session and UI state is
**Zustand** with persistence. They are not interchangeable, and mixing them is
the most common way a console starts showing stale data.

Forms are `react-hook-form` + `zod`. Navigation is permission-filtered: a user
never sees a link to a page the API would refuse.

### 13.2 Mobile app

Flutter with Riverpod, **no code generation** — see
[ADR-0005](./adr/0005-no-codegen-in-clients.md). Tokens live in
`flutter_secure_storage`. Tabs are computed by `visibleTabsFor(SessionUser)`,
which is unit-tested rather than trusted.

It can *present* a second factor — a generated code or a recovery code — but it
cannot **enrol** one: scanning a QR code with the phone displaying it does not
work. An account that must enrol is sent to the console. That is invisible while
the requirement only reaches console roles, and a lock-out the moment an
organisation sets `settings.security.requireMfa` for everyone. See CW-021 in the
[backlog](./backlog.md).

---

## Non-functional requirements

| | |
|---|---|
| **Correctness** | Business rules are pure functions in `domain/` with no I/O, unit-tested: 306 backend, 29 web, 35 mobile. A 181-check e2e suite drives the real API over HTTP and runs in CI. |
| **Money** | `Decimal(18,4)` everywhere. Never a float. |
| **Dates** | `@db.Date` for calendar values, timestamps for instants. Organisation timezone defaults to Asia/Bangkok. |
| **Configuration** | Validated at boot and the process **refuses to start** on a bad or missing secret. |
| **Input** | `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`, so an unexpected field is rejected rather than ignored. |
| **Localisation** | UI is Thai. Nothing in the architecture is Thailand-specific: tax rules are data, leave types are configuration, OT multipliers are settings. |
| **Scheduled work** | Nightly maintenance runs inside the API process. Every replica runs the same schedule and each job takes a Postgres advisory lock first, so it runs once per schedule however many instances there are. Nothing to configure; `JOB_LOCK_TIMEOUT_MS` bounds how long one may hold it. |
| **Side effects** | Anything leaving the system is recorded as an outbox event in the transaction that caused it and relayed afterwards, so nothing is sent for work that rolled back and nothing is lost to a crash between the two. Notifications commit with the change they announce — an approval nobody was told about is not a state the system can reach. Delivery is at least once; every instance drains the queue, claiming with `FOR UPDATE SKIP LOCKED`. |
| **Notification delivery** | In-app always; email over SMTP and push over FCM when configured, both relayed from the outbox and both off by default. A 4xx is retried on the backoff, a 5xx is dead-lettered at once. Per-user preferences, with a signed public unsubscribe link in every email. A channel switched on with incomplete configuration refuses to boot. |
| **Deployment** | Three containers — API, console, PostgreSQL 16 — plus a one-off `migrate` container behind a compose profile. No broker, no Redis, no Kubernetes. An HRIS that needs a Kafka cluster to send a leave notification is one nobody can self-host. |

### Known limits

Stated plainly, with the remedies in
[security.md](./security.md#what-this-does-not-do) and tickets in
[backlog.md](./backlog.md):

- Malware scanning is off by default; it needs a clamd to talk to.
- Rate limiting is in-process unless `THROTTLE_STORAGE=postgres` is set.
- The employee app does not register a push token yet, so push has no devices to reach.
- No ภ.ง.ด.1 withholding-tax filing export.
- Issued documents are not rendered; the API supplies merge data only.
- Benefits and shift administration exist in the API but not in the console.
- The mobile app can present a second factor but cannot enrol one.
- **The Thai tax and social-security rules are unreviewed** by anyone qualified
  (CW-030).
- **No device binding.** `deviceId` is recorded on every punch and authorises
  nothing (CW-024).
- **The offline punch queue is editable by the device owner** — it is in
  `SharedPreferences`, not the keystore (CW-025).
- `AttendancePunch.selfieFileId` is never written, and the `isRootedDevice` the
  API accepts is never sent by the app (CW-025, CW-033).
- No penetration test. This code has not been audited.
