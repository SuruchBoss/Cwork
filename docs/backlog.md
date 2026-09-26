# Backlog

Open work on Cwork, most important first. Every ticket here is grounded in
something that is actually missing or broken in the code — not a wish list.

The [specification](./spec.md) says what the system does today. This says what
it does not.

**Who maintains what**

`spec.md` and this file belong to whoever holds the product-owner role: scope,
the order work happens in, and when a ticket is done. `README.md` is shared.
Code, and the technical documentation describing it, belongs to whoever writes
it.

Every ticket here has a GitHub issue carrying the same `CW-` number. The issue
is authoritative for **status** — open, closed, who is on it — and this file is
authoritative for **reasoning**, which is what makes the Done table worth more
than a list of closed issues. Whoever finishes a ticket names the commit in its
issue; the Done entry here gets written from that.

**One exception:** test counts. `npm run verify:docs` fails the build when a
count written in prose stops matching the suites, including the ones in
`spec.md`, so whoever changes the suites updates the counts in the same commit.
Nothing else in these two files is covered by it.

Open a ticket in either place and the other gets one to match. A ticket with no
issue is invisible to anyone browsing the repository; an issue with no entry
here loses its reasoning the moment it is closed.

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
| **0** | A baseline to measure from | ✅ closed 2026-09-16 |
| **1** | A stranger can install it | ✅ closed 2026-09-16 |
| **2** | The pilot can run | ✅ closed 2026-09-26 |
| **3** | Payroll can file and pay · the app is complete | **CW-031 first** · CW-045 → CW-046 → CW-047 · CW-048 · CW-019 · CW-012 · CW-013 · CW-014 · CW-043 |
| **4** | When someone actually needs it | CW-021 · CW-037 · CW-041 |
| **E** | Ecosystem — runs alongside, does not displace | CW-052 · CW-051 |

**Phase E added 2026-09-25.** Cwork is the system of record for people and
labour cost in an ecosystem with PaynEat POS and PaynEat ERP (the ERP's
ADR-0011). It is a lane rather than a phase because nothing in the ERP's first
release waits on Cwork, and the filings in phase 3 have people waiting on them
every day. CW-050 in particular is sequenced **after CW-044**. The principle
every ticket here is held to — it must make sense for a standalone install — is
in [spec.md § Agreed direction](./spec.md#agreed-direction).

The labour-data contract the ERP will consume is drafted in
[labour-data-contract.md](./labour-data-contract.md) and is design-only.
All of its decisions were settled on 2026-09-25, so **CW-051 implements it**.

**Phase 3 was re-aimed on 2026-09-19.** The original plan put the tax filings
last, reasoning that with no real company there was nobody to file for. That
reasoning expired when the goal became adoption rather than a pilot: payroll
that computes and cannot file or pay is the gap between Cwork and the software
people pay for, and it shuts out the largest group of potential users. CW-004
stays open as the parent of CW-045, CW-046 and CW-047 rather than being worked
as one ticket.

The filings hang off one seam. `CW-044` builds the reconciliation, permission,
download and audit path once; each filing is then a formatter over figures that
have already been checked, rather than five implementations of the same
reconciliation each able to be wrong in its own way. Only the ภ.ง.ด. chain is
sequential — ประกันสังคม, the bank file and all three mobile tickets run
alongside it.

Thirteen tickets closed between 2026-09-16 and 2026-09-19, through 0.3.0.
Phase 2 is down to CW-025 and phase 3 to the demo, document requests on mobile,
and CW-043 — which exists because a decision of mine did not reach the code; see
its ticket.

The plan was drawn up before CW-002, CW-003, CW-006, CW-007 and CW-020 landed,
and those five came out of it as they were finished. CW-005 and CW-023 have
since landed together — they were the same work described twice — which takes
email and push out of phases 2 and 4 both. Consequences worth stating rather
than leaving implicit:

- **Phase 1 lost CW-020, CW-034 and CW-035** — the advisories are cleared, and
  the README now carries screenshots and an English translation.
- **Multiple instances are supported now, not forbidden.** The plan assumed one
  instance scaled vertically; CW-003 and CW-007 made replicas a configuration
  rather than a hazard. Nothing downstream depends on the old assumption.

Phases 0 and 1 closed on 2026-09-16. A landing page and a recorded demo
walkthrough were built alongside them with no tickets of their own, and the
walkthrough covers the recording CW-034 asked for and did not get. Recorded
here so the history is not misleading about where that work came from.

**`CW-031` moved to the front of phase 3 on 2026-09-26.** A hosted demo is the
largest single thing that would help anyone evaluate this project. It waited only
on who pays for the assistant, and that was settled on 2026-09-25: nobody does,
so the assistant is off. It will be hosted on Render. The landing page's only
button today is a download, which asks an HR manager to install software before
seeing any of it.

---

## P0 — blocks a real deployment

Nothing open.



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






### CW-041 · Draft the manager's half of a review
`P3` · assistant · performance · **M**

A manager writing a review has already recorded the evidence — KPI scores,
weights and check-ins are in the system. Assembling that into prose is the part
they put off.

**This one carries a real risk and it is accepted deliberately:** drafted
reviews tend towards sameness, and a manager who accepts a draft unedited has
outsourced a judgement that is theirs to make. The guardrails below are the
reason it is worth doing anyway, and they are not optional.

**Scope**
- A tool taking a **review id**, not an employee id, and refusing unless the
  caller is that review's `reviewerEmployeeId`. A review binds reviewer to
  subject already, so this does not widen the caller's reach.
- It returns only what the manager themselves recorded: KPI goals, weights,
  scores, their own check-in notes. **No attendance, no leave, no salary** —
  those are not review evidence and hoovering them in is how this feature would
  become something nobody asked for.
- Output is a draft in an editable field, labelled as a draft, never saved
  directly as the review.
- The review cannot be submitted unedited: if the text still matches the draft
  byte for byte, submission is refused with an explanation.
- The final rating is the manager's. The model never proposes a score.

**Acceptance**
- A manager can draft, edit and submit; submitting an unedited draft is refused.
- The tool refuses a review the caller does not own.
- The draft cites only KPI and check-in data, proven by a test that puts
  distinctive attendance and salary values in the fixture and asserts they never
  appear.
- With the assistant disabled, review writing works exactly as it does today.

**Files** `backend/src/modules/assistant/`, `backend/src/modules/performance/`,
`web/src/features/performance/`

---


### CW-043 · A provider an operator can run themselves
`P1` · assistant · **M**

CW-038 was asked to choose between telling the truth about
`ASSISTANT_PROVIDER` and making it true. The decision recorded in this file was
**make it true**, and what shipped was the truth-telling half: the names that
had no implementation are gone, a deployment that reports an assistant must now
have one, and `llm-provider.ts` says plainly that it is a seam rather than a
capability.

That work is right and it is finished. The gap is mine: I changed the decision
in the prose and left the acceptance criteria describing the S, so the criteria
were met exactly as written. The remaining half needs its own ticket and its own
criteria rather than a comment on a closed one.

It also matters more now than it did. CW-039 and CW-040 have shipped, so a team's
attendance and a payroll run's figures now pass through a model. An organisation
that cannot send those to a third party currently cannot use any of it — and
`spec.md` states that self-hosting the model is a requirement, not a convenience.

`llm-provider.ts` points at CW-018 for this. That is the wrong home: CW-018 is
embeddings for knowledge search, which is a different call to a different kind
of model. Chat and embeddings should not share a ticket.

**Scope**
- An `OpenAiCompatibleProvider` implementing `LlmProvider`: base URL, optional
  API key (a local server often needs none), and the tool-calling contract the
  interface already defines.
- `ASSISTANT_PROVIDER` accepts it only once it exists — the rule CW-038 set.
- Documented against at least one local runtime end to end, so the claim is
  demonstrated rather than asserted.

**Acceptance**
- With a local OpenAI-compatible server, the assistant answers a policy question
  and completes a tool call, with no request leaving the host.
- Every guardrail holds identically: no tool takes an employee id, write actions
  still need `confirmed: true`, tool calls are audited.
- Switching provider needs no code change beyond configuration.

**Files** `backend/src/modules/assistant/providers/`,
`backend/src/core/config/`, `docs/ai-assistant.md`

---


### CW-045 · ภ.ง.ด.1 monthly withholding filing
`P1` · payroll · **M** · blocked by CW-044 · parent CW-004

Pick a month, download a file in the Revenue Department's text layout, ready to
submit. Today the figures are right and get re-keyed into whatever files them.

Rounding is where this goes wrong quietly, so it is tested against the
Department's rules rather than left to the language's defaults.

**Acceptance**
- The seeded demo company's export matches hand-computed totals line by line.
- Field widths, ordering and padding match the published specification.
- Rounding has tests at the boundaries.
- A period that does not reconcile produces CW-044's error, not a file.

**Files** `backend/src/modules/payroll/`, `docs/payroll-thailand.md`

---

### CW-046 · ภ.ง.ด.1ก annual withholding summary
`P1` · payroll · **S** · blocked by CW-045 · parent CW-004

The year's monthly filings added up — same aggregation, same rounding,
different layout.

**Acceptance**
- The annual export equals the sum of the twelve monthly exports, asserted by a
  test rather than by inspection.
- An employee who joined or left mid-year appears with the months they were paid.
- A year containing a month that does not reconcile is refused, naming it.

**Files** `backend/src/modules/payroll/`

---

### CW-047 · 50 ทวิ withholding certificates
`P1` · payroll · documents · **M** · blocked by CW-046 · parent CW-004

Every employee's annual withholding certificate as a PDF — what they need to
file their own return, and what the employer is required to issue. The
certificate renderer from CW-008 already handles Thai text, letterhead and a
signature block, so this is a template over it.

**Acceptance**
- Each certificate's figures match that employee's line in the ภ.ง.ด.1ก export.
- Thai text renders with no tofu boxes.
- An employee fetches their own and nobody else's; issuing for others needs the
  document-issuing permission.
- Re-issuing supersedes rather than overwrites, and both are audited.

**Files** `backend/src/modules/documents/`, `backend/src/modules/payroll/`

---

### CW-048 · ประกันสังคม monthly filing (สปส. 1-10)
`P1` · payroll · **M** · blocked by CW-044

Payroll computes both halves of the มาตรา 33 contribution and stores them on
every payslip. There is no way to get them out.

Runs alongside the ภ.ง.ด. chain rather than after it — it shares the export seam
and nothing else.

**Acceptance**
- The seeded demo company's export matches hand-computed employee and employer
  totals.
- The contribution ceiling is applied per employee per month, tested at the
  boundary.
- An employee with no social security number is reported as an error naming
  them, not silently omitted or exported blank.

**Files** `backend/src/modules/payroll/`

---



### CW-052 · Say where Cwork sits in the ecosystem
`P3` · docs · **S** · 🌱 · phase E

The README describes a product with no neighbours. Add an Ecosystem section
linking PaynEat POS and PaynEat ERP and naming SherWhyve **without a link** — it
is private. Say plainly that none of it is a dependency and that installing
Cwork alone gives the whole product.

*(Already written into `README.md` alongside ADR-0006; this ticket covers the
Thai README and anything the pass missed.)*

**Acceptance** `README.th.md` carries the same section, and no document implies
Cwork needs another system to be useful.

**Files** `README.md`, `README.th.md`

---

### CW-051 · Publish labour aggregates to the ecosystem
`P3` · payroll · attendance · **L** · phase E

Implements [labour-data-contract.md](./labour-data-contract.md), whose every
decision was settled on 2026-09-25. Read it first; this ticket does not restate
it.

**Nothing is waiting on this.** The consuming ERP feature is Enterprise-edition
work scheduled after ERP v1. It is written now because the decisions are fresh,
not because there is a date.

**Scope**
- A `costCentre → locationCode` mapping, maintained in Cwork, many-to-one.
- `labour.cost.period_closed`, emitted when a payroll run closes; and
  `labour.hours.day_locked`, emitted when attendance for a day is locked.
- Suppression at `LABOUR_MIN_GROUP` (5), merging into `UNALLOCATED`, pulling the
  next-smallest group in when that bucket would come from fewer than two.
- Revisions: `revision`, `previousRevision`, and **the revision inside the
  idempotency key** — without it a restatement is discarded as a duplicate by
  the mechanism meant to make delivery safe.
- Emission through the existing outbox (CW-006), to a consumer holding a
  scoped, revocable machine credential whose every call is audited.
- A replay endpoint by period, not a cursor: these aggregates are recomputed
  from stored payroll and attendance, so replay is idempotent and cheap.
- Versioned `labour-data/1.0`, independently of Cwork's 0.x.

**Acceptance**
- **No employee identity and no individual pay appears in any emission** — a
  test puts distinctive names, ids and salaries in the fixture and asserts none
  of them reaches an event.
- A cost centre of four people is suppressed, and the totals still reconcile:
  published plus `UNALLOCATED` equals the period.
- `UNALLOCATED` never represents a single group.
- Re-closing a period emits revision 2 carrying full figures, and a consumer
  that never saw revision 1 can still use it as an opening position.
- An unmapped cost centre is emitted with `locationCode: null`, not dropped.
- Replaying a period twice changes nothing on the consumer's side.

**Files** `backend/src/modules/payroll/`, `backend/src/modules/attendance/`,
`backend/src/core/outbox/`, `backend/src/modules/organization/`

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



### CW-037 · Register the employee app for push
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



### CW-031 · A public demo instance, on Render
`P2` · project · **M** · first in phase 3

Evaluating Cwork means cloning it, writing an `.env`, running compose, migrating
and seeding. The README's screenshots help, but nobody can try an approval flow
from a picture. The landing page's only button is a download, and the people it
is written for (HR managers and owners) cannot act on that on their own.

**Decided 2026-09-25: no budget for the demo's LLM usage, so the assistant is
off in the demo.** Asking visitors for their own API key was never an option.
It trains people to paste credentials into unfamiliar sites, and would make this
project the holder of other people's keys. The recorded walkthrough, already
shipped in Thai and English, is what shows the assistant.

**Decided 2026-09-26: hosted on Render, and first in phase 3.** The owner
creates the Render account and services; everything else is in the repository,
so the demo can be rebuilt from the repository alone and nobody has to remember
how it was set up.

**Scope**
- A hosted instance, writable, so an approval flow can be tried end to end.
- Sign-in as employee, manager or HR in one click. Nobody types a password or a
  two-factor code, and no working password appears on the page, in the
  repository or in the landing page. The demo accounts' password is generated
  at deploy time and never shown.
- **Demo mode cannot be turned on by one mistaken variable.** Whatever enables
  the one-click sign-in and the reset must refuse to run on a database holding
  an organisation the demo seed did not create. It should refuse rather than
  wipe, and refuse rather than open. The seed's `assertDemoDatabase` is the
  precedent.
- The data resets to the seed at least hourly. A banner says when the next reset
  is, and a visitor who arrives mid-reset sees a message rather than an error.
- Nothing a visitor does can lock the next visitor out before the reset. The
  obvious routes are changing a demo account's password or 2FA, deactivating
  it, revoking its sessions, changing its role, and tripping the lockout.
- Off in the demo: the assistant (CW-027 already hides it), email and push, and
  file uploads. Uploads are unscanned without ClamAV, and a public demo would
  serve whatever anybody uploads to the next visitor.
- The demo links to the recorded walkthrough, for the assistant.
- **Landing page (`landing/`, both languages):** the main button becomes
  "ลองใช้ทันที" / "Try it now", which opens the demo for HR. Download moves to a
  second path, "ติดตั้งเอง" / "Install it yourself", which points IT at GitHub
  and `#install`.
- A runbook in `docs/` covering how the demo is deployed, where its secrets
  live, and what to do when something on Render expires.

**To check against Render before building.** render.com could not be reached
from the PO session, so these are assumptions, not facts. Each one changes the
design if it holds:

| Assumption about the free tier | If true, the ticket needs |
|---|---|
| Web services sleep when idle, and the first request waits about a minute | The one-minute acceptance below is measured from a sleeping instance, or the landing page wakes it. Pinging it to keep it awake is not an answer; see the hours row. |
| Free instance hours per month are capped | Two services that sleep fit; two kept awake may not. |
| Free Postgres expires after about a month, one per account | Replacing it is a runbook step that needs no code change. Only `DATABASE_URL` changes. |
| Cron jobs are not free | The reset cannot be a Render cron job. It also cannot be an endpoint anyone on the internet can call. |
| Free services cannot receive private-network traffic, and pre-deploy commands are paid | `web/nginx.conf` proxies to a fixed `api:3000`, and the runtime image ships no Prisma CLI, so it cannot migrate or seed by itself. |
| Render Postgres offers `pgvector` | The init migration runs `CREATE EXTENSION "vector"` unconditionally. |
| A free instance has about 512 MB of memory | The seed boots the whole application to create history (`db:demo`), and has only ever run on a developer machine. |

Record what was found in the runbook. If the free tier cannot meet the
acceptance, say which part and what it would cost, and bring it back to the PO
rather than trimming the acceptance.

**Acceptance**
- Someone with no local setup can approve a leave request within a minute of
  opening the link.
- Each of the three roles signs in with one click, and no working password
  exists anywhere a visitor can read.
- Pointing the demo configuration at a database that holds a real organisation
  makes it refuse to start, with a message. Nothing is wiped. A test proves it.
- After any sequence of actions available in the console, all three one-click
  sign-ins still work. A test covers each route listed in the scope.
- The data returns to the seed on schedule without anyone doing anything.
- The landing page's first button opens the demo, in both languages.
- The demo can be rebuilt from the repository and the runbook, by someone who
  has not seen it before.

**Files** `landing/`, `docs/`, `README.md`, `web/`, `backend/`, deployment
configuration

---



### CW-054 · Measure the counts the gate only declares
`P2` · platform · **S** · 🌱

`npm run verify:docs` exists, in its own words, because *"counts in prose are
the one claim nothing else checks."* It measures two of the five: domain tests
and backend unit tests are counted by running the suites. **The web, mobile and
e2e counts are typed into the script by hand**, and the gate checks the prose
against the typed number — never against the suites.

So it drifts exactly as it was written to prevent. The declared e2e count stood
at 211 while main ran 224; thirteen checks landed across three tickets and CI
stayed green throughout. It surfaced only because a security fix added three
more and someone counted by hand.

**Scope** Measure e2e the way the unit suites are measured — or have the e2e job
assert its own total against the declared figure, and the same for web and
mobile in their jobs. Either way, no count in the gate is a number someone has
to remember to change.

**Acceptance** Adding an e2e test without touching the declared count fails CI,
and so does the same for web and mobile.

**Files** `backend/scripts/verify-doc-counts.ts`, `.github/workflows/ci.yml`

---

## P3 — nice to have


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
`P1` · payroll · **M** · blocked by CW-044

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
| **CW-001** · Privileged accounts could sign in with a password alone | TOTP (RFC 6238), implemented against the RFC's own test vectors rather than pulled in as a dependency, and required — not offered — for any account holding `employee:read:sensitive`, `payroll:run`, `payroll:approve` or `role:manage`. A correct password for such an account now yields a challenge token, not a session; that token carries a `typ` claim the access-token strategy rejects, which is the only thing separating it from a full session since both are signed with the same secret. Codes cannot be replayed inside their own window, recovery codes are single-use, a wrong code counts towards the password lockout, and disabling is refused for an account that must have one. Recovery codes are stored as SHA-256 digests rather than argon2 as the ticket originally said: at 100 bits of entropy a slow KDF buys nothing and only gives a half-authenticated endpoint a way to burn CPU, and refresh tokens already use the same treatment for the same reason. Mobile can present a code but not yet enrol — see CW-021. **Superseded in part by GHSA-3cgw-73cr-r8c6 (0.3.1).** The claim above held for `POST /auth/login` and not for the flow as a whole: `POST /auth/mfa/complete-enrolment` exchanged a challenge token for a session on any account already enrolled, with no code, and a correct password reset the lockout counter the second factor depended on. Both shipped in three releases. |
| **CW-002** · Uploads were never scanned | `FileObject.scanStatus` existed and nothing ever set it, on a system that takes résumés from a public careers page. Uploads now stream to clamd *before* anything is written to storage, so malware is never stored for a later change to expose. The clamd INSTREAM protocol is implemented directly against its specification rather than pulled in as a dependency, and unit-tested. The rule throughout is that a scanner which is not working is never a pass: unreachable, timed out, or a reply that cannot be parsed all land the file at `PENDING`, which is refused on download and retried hourly. A detection is refused at upload with the signature named, audited and notified; quarantine destroys the bytes and keeps the record. Off by default, with a `clamav` compose profile to turn it on, and the API states which mode it is in at every boot. |
| **CW-003** · Rate limiting was per-instance | `@nestjs/throttler` keeps counters in memory, so two replicas behind a load balancer handed out twice the budget and a restart forgot every counter. `THROTTLE_STORAGE=postgres` now shares them through the database that is already there — no Redis, nothing extra to run or back up — as one `INSERT … ON CONFLICT DO UPDATE` so two instances racing on a key cannot both decide they were first. In-memory stays the default for a single instance, and the API says which store it is using at boot. If the store is unreachable the limiter fails open and logs an error: a rate limiter is not worth locking everyone out of a healthy system for. **The ticket’s premise was wrong** and the fix is worth recording: it said the in-memory throttler made "the sign-in lockout per-instance". It never did. The account lockout lives in `users.failedLoginCount` / `users.lockedUntil` and has always been shared. What was per-instance is the per-client *request budget* — which is what catches the caller no single lockout would notice, one wrong password each against a hundred accounts. The e2e suite proves both halves by booting two applications against one database. |
| **CW-007** · Every replica ran every scheduled job | CW-003 made more than one instance a supported configuration and left the cron schedule running on all of them. Each task now takes a **transaction-scoped Postgres advisory lock** before it does anything and the instances that do not get it stand down — no table, no migration, no lease, nothing to switch on, and nothing to clean up: an instance killed mid-job loses its connection and Postgres releases the lock by itself. Lock ids are written out by hand in `domain/job-locks.ts` rather than hashed from the job name, because a hash is one collision away from two unrelated jobs blocking each other for ever and a literal is what you can look for in `pg_locks`. **Two things in the ticket were wrong.** It said a double run would grant leave quota twice: it would not — `rolloverYear` *assigns* the carried balance rather than adding to it, separations are filtered by status, and the purges are `deleteMany`, so every task was already idempotent. What a double run actually costs is the work itself, the duplicated audit and notification rows, and write-write races between instances doing identical work at the same instant. It also asked for a heartbeat "so a crashed holder does not block the next run" — a transaction-scoped lock has nothing to heartbeat, and that is precisely the argument for it over a lease table. The cost, stated in [operations.md](./operations.md): the job runs with a transaction open, so `JOB_LOCK_TIMEOUT_MS` bounds it at fifteen minutes by default and an open transaction holds back vacuum meanwhile. The e2e suite boots three complete applications against one database and never relies on timing to decide the winner — where a race would be the point, the test takes the lock itself and holds it. |
| **CW-006** · The outbox table had no producer and no consumer | The ticket said `outbox_events` "is written transactionally and nothing reads it". Half right: nothing read it, and **nothing wrote it either** — the table had been in the schema since the first migration with no reference to it anywhere in `src`, so the work was both halves rather than one. `OutboxService.record` takes the caller's transaction client and will not work without one, because an event written on the ordinary client is a plain dual write with extra steps and nothing at the call site would show the difference. `OutboxDispatcher` claims a batch with `SELECT … FOR UPDATE SKIP LOCKED`, dispatches to whoever registered for the type, backs off from 30 seconds doubling to a 30-minute cap, and parks an event as a dead letter after `OUTBOX_MAX_ATTEMPTS`. Dead letters are never purged — only delivered events are — because that row is the only record that somebody was owed a message and did not get it. Unlike the scheduled tasks of CW-007, **every instance polls**: `SKIP LOCKED` means each dispatcher takes rows nobody else holds, so three replicas drain three times faster rather than fighting. Delivery is at least once and says so. The producer shipped with it is notifications: the in-app row and the event that will carry it out by email or push are written in one transaction, so no message is ever sent for a notification that does not exist. Nobody is listening yet — an event with no handler is marked delivered rather than queued for ever, and the API warns at boot when no handlers are registered at all — which is exactly the seam CW-005 plugs into. Closed straight afterwards, in the same branch: every call site now passes its own transaction client, so the change and the message about it commit together. `notifyIn`/`notifyManyIn` take the caller's `tx` and throw rather than swallow — inside a transaction there is nothing else they could do, since PostgreSQL has already aborted and catching would only move the failure to the commit. Four of the call sites had no transaction to join and now have one: approving a resignation writes the request, the employee and the employment event together, which was three separate writes that could always have disagreed with each other. The best-effort `notify` survives for exactly one caller — an upload the scanner refused, where nothing was stored and there is nothing to be atomic with — and a unit test fails if a second one appears without being added to the list with a reason. |
| **CW-005** · Notifications never left the database | In-app rows and nothing else, so nobody learned a leave request was waiting unless they opened the console. SMTP is now written out against RFC 5321 and FCM's HTTP v1 API against its own two requests — the same trade as the clamd client and the TOTP implementation, because what is actually needed is one well-specified conversation and the alternative is a transport abstraction and a dependency tree. Both register as outbox handlers, so a failed send retries on the backoff CW-006 already built and never blocks the request that caused it. **The retry rule is the part worth arguing about**: the ticket asked for a bounce to be "retried with backoff and then recorded as failed", but eight attempts over an hour at a mailbox refused for not existing teaches nothing and buries the one message somebody should have looked at. A new `PermanentDeliveryError` lets a handler say so, and the dispatcher dead-letters it at once: SMTP 5xx and FCM 401/403 immediately, SMTP 4xx and FCM 5xx on the backoff. `starttls` refuses to send if the server does not offer STARTTLS rather than putting the relay password on the wire, and a device FCM calls `UNREGISTERED` has its row deleted instead of retried. Preferences are a rule per notification type with `*` as the catch-all; the unsubscribe link in every footer is public and signed, because nobody should have to sign in to stop receiving email, and it turns off email only — the click happened in an email, and in-app notifications are the record rather than a message. Both fakes speak the real protocols, and the FCM one verifies the service-account assertion against the key pair it generated, so a client that signs the wrong bytes fails in CI rather than at three in the morning. **Not done, and it is not backend work**: the employee app does not register an FCM token yet, so push has nowhere to go until it does. |
| **CW-023** · Notifications had no mail transport | The same work as CW-005 above, written up separately while that one was still open, and delivered with it. Two requirements of this ticket shaped the result and are worth keeping: the handler goes through `OutboxRegistry` rather than round it, so retry, backoff and dead-lettering come from CW-006 rather than being reinvented; and a channel switched on with incomplete configuration now **refuses to boot**, the rule `ASSISTANT_ENABLED` already follows — because the symptom otherwise is an outbox filling with dead letters days later, over a setting the operator believes they already made. The variable is `EMAIL_ENABLED` rather than the `MAIL_ENABLED` proposed here; it was already shipped, documented and tested under that name by the time the two tickets were reconciled, and a rename would have been churn for its own sake. |
| **CW-020** · Nine high-severity advisories in shipped dependencies | Two root causes, not nine: multer below 2.3.0 (four advisories) and deepmerge-ts below 8.0.0 reached through `@prisma/config`. Everything else was npm reporting the parents. Both are fixed upstream but neither parent has picked the fix up — the latest NestJS 11 still pins multer 2.2.0, and Prisma 7 still pins deepmerge-ts 7 — so the fixed versions are pinned through npm `overrides` rather than by taking two major upgrades for a security patch. `npm audit --omit=dev` is clean, and a CI job re-checks it weekly as well as on every push, because an advisory is published against code that has not changed. The upload endpoint also now states its whole contract as multer limits (one part, named `file`, no text fields), which is what actually neutralises the two field-name advisories: they need a text part, and there is no longer one to send. **The ticket's premise was wrong** in a way worth recording: it called multer "reachable from the public careers page". It is not. `POST /careers/:orgCode/jobs/:slug/apply` takes JSON, and the only multipart route in the system, `POST /files/upload`, sits behind the global auth guard — so this was an authenticated denial of service, not an anonymous one. Still worth fixing; not the emergency the ticket described. The upgrade also broke something on the way in, which is the argument for the tests: Nest maps multer errors by matching their *message*, multer 2.4 reworded `LIMIT_UNEXPECTED_FILE`, and a file sent under the wrong field name started returning 500 with a stack trace. The exception filter now reads `err.code`, as multer's own documentation asks. |
| **CW-035** · The README was Thai only | A reviewer who does not read Thai could not assess the project at all, which for something that wants contributors is a hard stop. `README.md` is now English with `README.th.md` alongside it and a switcher at the top of both. This is not CW-016: the *interface* is still Thai-only, and the translation layer for both clients remains open. |
| **CW-034** · The README described the system and showed none of it | Seeing any screen cost a clone, an `.env`, a compose run, a migration and a seed — minutes of commitment from someone who had not yet decided the project was worth any. Twenty-one console screenshots and eight from the app now sit in `docs/screenshots/`, fourteen of them in the README itself. The cross-client recording the ticket also asked for — submit leave on the phone, approve it in the console — was not done; open a new ticket if it is wanted. |
| **CW-022** · A clean install had no way to create an organisation | The only `organization.upsert` was in `prisma/seed.ts`, which the README itself labels demo data, so anyone installing Cwork for a real organisation had to load fake rows and then clean up after them. `npm run db:init` now creates the organisation, the default roles and the first administrator; the web wizard behind a one-time token covers operators with no shell access. 22c746f. |
| **CW-026** · The pilot would have collected real location data with nothing written down | Leave and attendance for real employees means real GPS and real sick-leave records, and full retention and purge (CW-015) was too large to precede it. Two documents instead — one for whoever is accountable, one for the employees themselves — stating what is held, that **location is recorded only at the instant of a punch and never continuously**, how long it is kept, and how to have it removed. bf74102. |
| **CW-027** · The standard install offered an assistant that could not work | `ASSISTANT_ENABLED=false` is the default, so every out-of-the-box deployment showed an entry point that failed when pressed — which reads as a broken product rather than a disabled option. Both clients now read the flag and hide it. 75e3184. |
| **CW-028** · No tags, no changelog, no way to say which version you were running | Anyone installing Cwork ran whatever `main` happened to be that day. `CHANGELOG.md` in Keep a Changelog form, the 0.x contract stated in the README, releases cut from a workflow rather than by hand, and 0.2.0 tagged. 8ad1f41, 0186861, 14ecc0e — and 14894e5, which stopped the docs telling people to clone a tag that did not exist yet. |
| **CW-029** · Contributions had no provenance | Apache-2.0 with no CLA and no sign-off meant no record that a contributor had the right to submit what they submitted. DCO is now enforced in CI. Worth restating rather than discovering later: with no CLA the licence cannot realistically be changed, which is an accepted consequence and not an oversight. d73a589. |
| **CW-030** · Three claims in the documentation were not true | Multi-tenancy the product does not offer, Thai payroll rules nobody qualified has reviewed, and a privacy property that was real but unstated. Each corrected where a reader meets it rather than in a footnote. 419d1e2. |
| **CW-036** · `git log` told the story before the README did | Almost every commit here was written by an AI agent under direction, several of them adding thousands of lines at once. Saying so costs less credibility than having it inferred, and the existing history was left exactly as it stands — rewriting it to look more human would have been the actual dishonesty. c9ba70a. |
| **CW-008** · Issued documents ended in a manual step nobody could audit | `DocumentRequest` resolved to merge data — the fields, not a document — so HR still produced every certificate by hand and the approval trail stopped short of the thing it approved. Rendered server-side now, with Thai text intact. 2a5867d. |
| **CW-009** · Benefits existed in the API and nowhere a person could reach | Models, endpoints and permissions were all there; the console had no screen, so enrolment meant calling the API by hand — and enrolments feed payroll. bf08a8d. |
| **CW-010** · Attendance was computing lateness against shifts nobody could define | `Shift`, `WorkSchedule` and `ScheduleAssignment` drove the late and early-leave minutes, and the only way to create one was the seed script. Until this landed, attendance could not be used by a real organisation at all. 6fd24f4. |
| **CW-015** · Employees had no retention or erasure path | Candidates had a PDPA retention date and were purged; employees had nothing, so a leaver asking for erasure had nowhere to go. CW-026 covered the pilot's minimum; this is the mechanism. a962449. |
| **CW-016** · Every interface string was hard-coded Thai | Nineteen commits: an i18n foundation, then the console screen by screen, the employee app, and both landing pages. Keys are English, Thai is a translation file and stays the default, organisation-entered content is not translated, and the database keeps Gregorian years. c3b3399 … 7c28419. |
| **CW-017** · The console had never been tested with a screen reader | HR software is used all day by people who may not use a mouse. Audited to WCAG 2.2 AA with an axe check in CI. 21a5335 — and 4e7a73f, which found the menu and theme buttons had no name a screen reader could read. |
| **CW-024** · Any device with a valid token could punch | The app generated a stable `deviceId` and every punch recorded it, but nothing authorised it — clocking in for an absent colleague needed only their password. Binding on first sign-in, re-binding behind HR approval and audited, and a punch from an unbound device flagged rather than refused. f30f910. |
| **CW-032** · Nothing proved an existing installation survived an upgrade | CI only ever migrated an empty database. It now checks out the previous release, migrates and seeds, then migrates up and asserts the data is still readable. 80c0216. |
| **CW-033** · A column nothing wrote misled whoever read the schema next | `selfieFileId` was never written and selfie capture was considered and not adopted. Dropped rather than left as decoration. 6411850. |
| **CW-038** · The assistant's configuration accepted values that changed nothing | `ASSISTANT_PROVIDER=openai-compatible` validated, booted clean, reported the assistant as enabled and handed back the disabled provider. Reproducing it turned up two more configurations doing the same thing — `none` with the assistant enabled, and Anthropic with no key outside production — neither of which the ticket named. `ASSISTANT_EMBEDDING_PROVIDER=openai` was the same lie one field down and went the same way. 1872048, 7999e40. **The other half of this ticket did not ship and that is a fault in the ticket, not the work:** the decision was changed to implement a self-hostable provider while the acceptance criteria still described removing the option, and the criteria were met exactly as written. CW-043 carries it with criteria of its own. |
| **CW-039** · Managers saw flag lists and had to guess what they meant | `OUTSIDE_GEOFENCE`, `IMPOSSIBLE_TRAVEL` and the rest told a manager something happened, not whether they were looking at a dishonest employee or a badly drawn geofence. Explained now, scoped to the caller's reports through the same visibility filter the console uses. f77d1df. |
| **CW-040** · Payroll approval was a control on paper | Separation of duties means the approver did not prepare the run; what they saw was a total they had no practical way to interrogate. The variance is narrated against the previous period, from the components the payslip already stores. 2445ad3. |
| **CW-042** · ADR-0004 forbade the features that were about to be built | Its title said assistant tools take no employee id, and it named "lets a manager ask about their team" as the signature it rejected — which read as forbidding CW-039 and CW-040. Amended to the rule it was reaching for: no tool parameter may extend the caller's reach. f849688. |
| **CW-025** · An offline punch could be forged on a rooted phone | The server credits the instant a punch was captured, which is right for someone clocking in at a warehouse with no signal — but the queue sat in `SharedPreferences`, which a rooted device's owner can edit, and the `isRootedDevice` the API accepted was never sent. The queue moved to the keystore, root is detected and reported, and a punch held beyond the ceiling is flagged for a manager to acknowledge — never rewritten, because `attendance_punches` is append-only. The ceiling's real value is still the pilot's to decide. 2af6a71. **Closed phase 2: the pilot can run.** |
| **CW-044** · Every payroll filing would have reconciled its own figures | Five formatters were queued behind this — ภ.ง.ด.1, 1ก, 50 ทวิ, ประกันสังคม, the bank file — and each would otherwise have gathered a period and checked it adds up in its own way, which on these outputs means filing wrong numbers with the Revenue Department. Built once: reconciliation is a pure domain module with its own unit tests, and a period is refused, naming the run or the difference, when a run is not `APPROVED` or its payslips do not add up. It also refuses when the payslip count disagrees with the recorded headcount — a check the ticket did not ask for and should have. 1073152. |
| **CW-049** · A location's code was free text anyone could edit | The ecosystem's location code (ADR-0006): a fixed format, correctable until first use — a punch, a schedule, an export — and superseded rather than renamed afterwards, with the old location keeping its history. A breaking change for existing installs, with a migration that reports before it changes anything. 34cb1ae. |
| **CW-050** · Cwork could not be investigated from its logs | Conforms to telemetry contract **v1.2**, which moved on from the v1.1 the ticket named while the work was under way. String `severity`, a plain `labels` object, `app.log`, and five metrics on a port of their own so `/metrics` is never published with the API. Two acceptance criteria were added mid-ticket from notes written for other systems, and both have tests by their own names: the outbox gauges read from the database, so two instances agree and a restart does not reset them; and a request refused by the auth guard or the throttler still gets its log line. **The ticket's premise was wrong:** it said Cwork emitted a numeric pino `level`. The dependency was installed and never wired in; it was removed, with a `LOG_PRETTY` nothing read. 783171f. |
| **CW-053** · Nothing proved the security headers were served | A fix to nginx's `add_header` inheritance had put CSP and `X-Frame-Options` back on `/assets/` and `index.html`; nothing stopped the next `location` from dropping them again. CI now runs the image as shipped and asserts the headers on the paths that broke. b160cbb. |
