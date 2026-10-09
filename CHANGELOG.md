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

- **Both clients speak English as well as Thai** (CW-016). The web console and
  the employee mobile app were Thai-only, which shut out a director or auditor
  who cannot read Thai. Each now has a dependency-free i18n layer where the
  message key *is* the English source string: the web uses a `useT()` hook over
  the UI store, the Flutter app a `languageProvider` and `ref.tr`, and both flip
  the whole interface — navigation, forms, table headers, the enum status and
  type labels, validation messages and the formatters' units — from one switch
  (a header control on the web, the profile screen on mobile). Thai stays the
  default, so a Thai user sees no change; server-entered content (people's names,
  plan names) is left as entered, and the Gregorian calendar and Baht formatting
  are untouched. The chosen language persists per browser and per device, and an
  explicit choice wins over the account locale.

- **The console is checked for accessibility** (CW-017). The web console had
  never been tested with a screen reader or axe, and the shared `Field`
  primitive left its `<label>` unbound to the control — so every form field
  routed through it was announced as unnamed and clicking a label did not focus
  its input. `Field` now binds the label (and points `aria-describedby` at the
  hint or error) once, for every form in the app; the `--text-subtle` text
  colour, which fell below the WCAG AA 4.5:1 contrast ratio in both themes, was
  darkened to meet it; and opening the reject-reason box on the approvals screen
  now moves focus to it. Rendered screens are asserted to have no axe violations
  and a reviewer can approve a request with the keyboard alone, both enforced by
  the web test suite in CI. Contrast is validated numerically against the theme
  tokens, since jsdom applies no stylesheets for axe to measure.

- **CI upgrades a database from the previous release** (CW-032). CI only ever
  ran `prisma migrate deploy` against an empty database, so nothing proved that
  an existing installation survives an upgrade — a migration that adds a NOT
  NULL column with no default, or drops a column that still holds data, runs
  cleanly on empty tables and only destroys real data. A new job checks out the
  most recent release tag, lets its own migrations and seed populate a database,
  then migrates that populated database up to the current commit and reads the
  seed back through the current Prisma client. A migration that drops a
  populated column the code still reads, or that fails on a non-empty table, now
  fails CI here rather than in someone's production. Alongside it,
  `verify:migrations` guards the mirror-image mistake — a change to
  `schema.prisma` with no matching migration — by replaying the migration
  history into a scratch database and diffing it against the schema, so in a
  healthy tree the only difference is the two hand-written search indexes Prisma
  cannot model and anything else fails the build; the two can no longer quietly
  describe different databases.

- **Employee data retention and purge** (CW-015). Candidate records already
  expire under PDPA, but employee records had no equivalent, and a leaver who
  asked to be forgotten had no path. Once a leaver is far enough past their last
  working day (five years by default), their personal identifiers — name,
  national id, contact details, bank accounts — are redacted while the employee
  row and the payroll history that references it stay intact, the record the law
  says to keep minus the personal data it no longer needs. A dry run lists the
  leavers a purge would redact and changes nothing, so HR can see the effect
  first; the purge audits every record it touches and runs nightly as well as on
  demand. A leaver still inside the retention window is left untouched.

- **Attendance is bound to a device** (CW-024). The app records a device id on
  every punch, but nothing authorised it — any device holding a valid token
  could clock in for an absent colleague. The first device an employee punches
  from now binds to them automatically; a punch from any other device is
  accepted and flagged `NEW_DEVICE`, never refused, because an employee must
  always be able to prove they turned up. Moving the binding to a new device is
  a re-bind, which only HR can do (`attendance:manage`) and which is audited —
  there is no self-service path, so a lost or replaced phone goes through HR.
  A punch never changes the binding on its own.

- **Issued documents render as PDFs** (CW-008). A `DocumentRequest` used to
  resolve to *merge data* — the fields, not a document — and HR produced the
  certificate by hand, so the approval trail ended in a manual step nobody could
  audit. Issuing an approved request now renders the actual PDF server-side, with
  the Thai-capable Sarabun font embedded (SIL OFL) so the text survives rather
  than turning to tofu boxes, the organisation's name and a signature block, and
  a verification code. The rendered file is stored and linked to the request, and
  is reachable only by the requester and a `document:issue` holder — narrower
  than the organisation-wide file download, which is too wide for a salary
  certificate. Re-issuing renders a fresh PDF and supersedes rather than
  overwrites: the previous file is left in place and both issuances are audited.
  A new public endpoint confirms a document is genuine from its reference number
  and printed code, disclosing only enough to verify authenticity — never salary.

- **Benefits administration in the console** (CW-009). The benefits API,
  `BenefitPlan` / `BenefitEnrollment` models and permissions existed, but the
  console had no benefits screen, so enrolment was only possible by calling the
  API directly — yet enrolments feed payroll. This adds a benefits area: define
  and edit plans with their employee/employer cost split, enrol and un-enrol
  employees with effective dates, and a per-plan view of how many active
  enrolments it carries and what it therefore adds to the next run. An enrolment
  a `benefit:manage` holder makes is picked up by the next payroll calculation —
  proven end to end — a duplicate enrolment is refused, and a `benefit:read`
  viewer sees the plans but no mutating control.

- **Shift and roster management in the console** (CW-010). The `Shift`,
  `WorkSchedule`, `ScheduleAssignment` and `ShiftAssignment` models existed and
  attendance already measured late and early-leave minutes against them — but
  there was no way to define a shift or assign one, so those numbers came from
  seeded data alone and attendance could not really be used. This adds the write
  side: define shifts and weekly schedules, assign a schedule to an employee, a
  department or a location (with a bulk path), edit a single day's roster, and a
  calendar view of who is on which shift, resolved with the same precedence as
  the punch-time calculation. A schedule assignment that would overlap another
  for the same employee is refused with a clear error rather than leaving the
  roster ambiguous, and a shift created here is what a late punch is then
  measured against — both proven end to end. Writing requires `shift:manage`;
  reading the roster is open to anyone who can already read team attendance.

- **Explain flagged attendance to a manager** (CW-039). A manager reviewing
  attendance sees a flat list of flags — `OUTSIDE_GEOFENCE`, `LOW_GPS_ACCURACY`,
  `MOCK_LOCATION` and the rest — with no way to tell a badly-drawn geofence from
  something worth a look. The assistant now groups the team's flagged punches by
  location and flag, with the distances and counts that tell the two apart:
  forty punches a median 45 m outside one site reads as a fence set too tight;
  one punch 8 km out is worth a question. Manager-facing, so it takes no
  employee — the scope is the caller's own team, resolved server-side — and it
  requires a team-or-wider attendance read, so an employee who can see only
  their own punches is refused (proven in an e2e test). Every figure comes from
  a pure function (`summariseAttendanceFlags`); the model narrates the groups
  and computes nothing, and a test fails on any figure it invents. Renders only
  when the assistant is switched on, and the model is not called until the
  manager asks.
- **Explain a payroll run before it is approved** (CW-040). Separation of duties
  means the approver did not prepare the run, and what they are shown is a total
  with no way to interrogate it. On the approval screen the assistant now
  narrates the run's variance against the previous period — net movement,
  joiners and leavers, overtime, unpaid leave, employer cost — so the approver
  can see *why* the net moved before signing. Every figure comes from a pure
  function (`computePayrollVariance`); the model states the numbers, it does not
  work them out, and a test fails on any figure in the narration that the tool
  did not produce. The tool requires `payroll:approve` and treats a run from
  another organisation as absent, both proven in an e2e test. It is the first
  assistant tool to take an id, which CW-042 amended ADR-0004 to allow. With the
  assistant switched off the approval screen is unchanged.

- **Structured logs and Prometheus metrics** (CW-050). The API wrote Nest's
  plain-text console lines and served no metrics. It now writes one JSON object
  per line in the shape of the PaynEat ecosystem's telemetry contract v1.1: a
  string `severity`, and a `labels` object carrying `app=cwork-api`, the
  `event` and the request's `correlation_id` (its `x-request-id`). Every request
  writes `http.request.completed`, including one a guard refuses before any
  controller runs — a 401 or a 429 — so a lockout storm leaves a trace; refused
  sign-ins also write `auth.sign_in.failed`, and failed outbox deliveries
  `outbox.delivery.failed`. `GET /metrics` serves request counts and durations
  by route template, sign-in failures, and the outbox backlog and its age — the
  last two read from the database, so every replica agrees and a deploy does not
  reset them. It is served on its own `METRICS_PORT` (9464), which
  `docker-compose.yml` does not publish. `LOG_FORMAT=gcp` moves the labels and
  the trace to Google Cloud Logging's keys; nothing else changes and nothing
  else needs it. No salary, national ID, bank account, name, email, token or
  query string reaches a line or a label, and an end-to-end test puts each
  through the API to prove it. See
  [operations](./docs/operations.md#observability).

- **Every screenshot is retaken by a script, in both languages** —
  [`docs/screenshots/capture.mjs`](./docs/screenshots/capture.mjs) signs in to the
  seeded demo with a real second factor and captures each console screen, and
  [`capture-mobile.mjs`](./docs/screenshots/capture-mobile.mjs) builds the
  employee app for the web in a throwaway copy and drives it at phone size by
  the labels its screen-reader tree announces. Each takes every screen in Thai
  and in English, in the organisation's time zone, on the API's clock. The
  English README and overview page now show the English interface throughout,
  the app included; the Thai README shows Thai throughout and gets a Thai
  walkthrough GIF of its own. The screenshots gain the dashboard, the shift
  roster, benefits and a manager's approvals on the phone; the app's assistant
  screen goes, since a default install does not show that tab.

- **A product film, in Thai and in English** — three and a half minutes on the
  landing page's six problems, each told by people doing the work on camera: a
  payroll officer opens September and calculates it and the HR manager
  approves it, an employee clocks in on a site with no signal, files leave
  from their phone and watches the weekend and a public holiday drop out of
  the count, their manager approves it from the console, a certificate is
  requested and issued, and the PDPA controls are shown by who may see a
  national ID. Every field is typed and every button pressed against the
  seeded demo, by [`docs/film/film.mjs`](./docs/film/film.mjs), recorded as one
  take of a stage holding the real console for five people at once and the
  real app in a phone — framed with a status bar and home strip, so the
  camera island and rounded corners fall outside the app's screen rather than
  over it (CW-055). It opens the overview page in each language, and both
  READMEs link to it.
- **A public demo, one click from the landing page** (CW-031). “ลองใช้ทันที” /
  “Try it now” is now the landing page's first button, in both languages: it
  opens a hosted Cwork signed in as HR at the demo company, and “ติดตั้งเอง” /
  “Install it yourself” leads IT to the install steps and GitHub. Employee,
  manager and HR each sign in with one click — there is no password to know;
  the demo's is generated at each reset and never shown. The data goes back
  to the demo seed on the hour, and before the free instance sleeps; a banner
  says when, and a visitor who arrives mid-reset sees a message and is signed
  back in afterwards. Nothing a visitor does can keep the next one out:
  password and code sign-in, credential changes and revoking other sessions
  are refused, and deactivation, role changes and the lockout are undone at
  the one-click door. Uploads, the assistant, email and push are off, and no
  visitor's address is stored. `DEMO_MODE=true` refuses to start on any
  database the demo did not create — it changes nothing and says why. It runs
  as one Docker service on Render's free tier from [`render.yaml`](./render.yaml);
  [`docs/demo.md`](./docs/demo.md) is the runbook, with what was found about the
  free tier and the timings measured on a tenth of a CPU. `CONSOLE_DIR` lets
  the API serve the built console itself, which is how one service is enough.
- **Employees can install the app** (CW-060). There was no release build, and
  the API address was compiled into the app, so every company would have needed
  its own. Now one Android app serves every company. Each GitHub release carries
  `cwork-android.apk`, built from the tag by the release workflow and signed
  with one release key. Its version code rises with every release, so a new
  version installs over the old one. The employee stays signed in to the same
  company, and a punch queued offline is still sent. The workflow refuses to
  publish an APK without the release key, and CI builds and checks the same APK
  on every commit. On first launch the app asks which company. The employee
  scans the QR code on the console's new **Employees → Mobile app** page, types
  the address, or taps *Open the app* on the public install page, `/app`, which
  the QR code opens on a phone. The app accepts only an HTTPS server that
  answers as Cwork. A link never connects on its own: the app shows where it
  points and asks first. Changing company signs out of the old one, and is
  refused while punches are still queued for it. iPhone is not supported yet,
  pending the owner's decision on the Apple Developer Program, and both READMEs
  say so. Maintainers set up the signing key once, as described in
  [`docs/mobile-release.md`](./docs/mobile-release.md).
- **Employees, and the leave they took before Cwork, come in from a
  spreadsheet** (CW-059, the employee and leave half). A company moving to
  Cwork had to enter each person through the API; the console could not add
  anyone at all. HR now downloads a template from **Employees → Import from a
  spreadsheet**, fills it in or pastes an export into it, and uploads it. The
  upload can be `.xlsx`, or CSV as Thai Excel saves it (Windows-874), and Thai
  names come through intact. Every problem is listed by row and column before
  anything is written. Nothing is written until the whole file is clean, and then
  every employee is created in one step, through the same validation and
  encryption as the API's create. Importing the same file again adds nobody,
  and names each code already present. Dates may be Buddhist-era or Excel day
  numbers. A long number that Excel has shortened to `1.23457E+12` is caught
  rather than stored. Managers may be further down the same file. Employees
  gain `scannerId`, their user number on the fingerprint scanner, for CW-061. It
  is unique in the organisation, and it can also be set by hand through
  `PATCH /employees/:id`.

  Then **Leave → Import leave taken** records the days each person took this
  year before Cwork. Its template already lists every current employee and
  every leave type, and the preview shows the balance each person is left with.
  The figure is set, not added, so importing the same file twice changes
  nothing. A figure more than the entitlement, unless the leave type allows it,
  is refused. It is stored apart from what Cwork itself approved, as
  `LeaveEntitlement.priorUsed`, and every balance counts it: HR's view, the
  employee's own in the app, the check a new request is held to, adjustments
  and the year-end rollover. The balance API's `used` now includes it, and
  `usedBeforeCwork` says how much of it came from before. Each import is
  audited as one event naming the file.

- **The pay a company gave before Cwork counts in its withholding** (CW-059,
  the payroll half). A company that starts in September paid January to August
  elsewhere, and withholding projects the year from the year so far, so its
  first run withheld far too little and the employee got a bill the next
  March. **Payroll → Import pay before Cwork** now takes each employee's
  taxable income, tax withheld and social security from January to the last
  month paid elsewhere, from the same kinds of file as the employee import. The
  template lists everyone employed in those months with any figures already on
  file, the preview totals the file to check against the old system's report,
  and figures are set rather than added, so importing twice changes nothing.
  September then withholds exactly what it would have if all nine months had
  run in Cwork: an end-to-end test runs nine months in one year, imports the
  same eight months into another, and compares September to the baht. The
  months are stored as this employer's own (`PayrollOpeningBalance`), not as
  the tax profile's previous-employer income, so the annual filings can count
  them as such, and each payslip's `snapshot.yearToDate` records the split.
  A month the figures cover cannot then be calculated in Cwork
  (`PAID_BEFORE_CWORK`), and a file cannot cover a month Cwork has already paid.
  A run already calculated without the figures is named, to be calculated
  again before it is approved. Amount columns in the templates stay numbers, so
  Excel can add them up.
- **Departments, positions and work locations can be added from the console**
  (CW-072). A fresh install had none, and the Organisation page could only
  read, so an employee file from Odoo that named its departments got one
  `NOT_FOUND` per row. Someone with `org:manage` can now add and rename
  departments and positions, and add work locations, from Organisation
  structure, through the endpoints that were already there. A work location's
  code follows ADR-0006 as the API enforces it, and the form never offers to
  change a code once it is set. The form refuses a name already in use, because
  the employee import matches by name as well as code and calls two records
  with one name ambiguous. Refusals are worded in Thai and say what to change.
  The page also lists positions and work locations, which it did not show
  before, and `db:init`'s closing steps and the Thai import guide now point
  here. The "Save" button had no Thai translation anywhere in the console; it
  has one now.
- **HR records leave for an employee** (CW-067). Leave could be filed only by
  the employee it was for, so at a company where nobody but HR uses Cwork it
  could not enter at all. Someone with the new `leave:record` permission
  (HR officer and above; existing installations get it from a migration) opens
  "บันทึกการลาให้พนักงาน" on the Leave page, finds the employee by name,
  nickname or code, and records the leave as approved, the default when the
  manager was told in person, or sends it to the manager. The employee needs no
  account. The same rules refuse it with the same code as the employee's own
  request, worded in Thai with the employee named, and the preview refuses it
  before saving. Two rules apply only when it goes to the manager: notice,
  which a sick day recorded the next morning always breaks, and the supporting
  document, which a medical certificate can still be attached as. Recorded as
  approved, the days are used at once and attendance for days already closed
  out as absent becomes leave, so payroll no longer deducts them; the request
  keeps who entered it (`recordedByUserId`), shown as "บันทึกโดย …" in the leave
  list, and the audit entry names both HR and the employee. HR cannot record
  their own leave as approved. "Save and record another" keeps the leave type
  and status for the next person.
- **A Thai guide for HR to the three spreadsheet imports** (CW-059, CW-066):
  `docs/guide/import-from-excel.th.md` walks employees, leave taken and pay
  before Cwork step by step, with a screenshot of each step and a table of the
  problems an import reports, what each means and how to fix it in the file.
  `docs/guide/capture-imports.mjs` retakes the screenshots against a fresh
  `db:seed` company, importing for real, so the guide can follow the pages
  when they change.

### Removed

- **The unused `selfieFileId` column** (CW-033). `AttendancePunch.selfieFileId`
  was never written to — there is no camera capture anywhere in the app, and
  selfie capture was considered and not adopted, partly because biometric data
  drags consent and retention obligations along with it. A column nothing writes
  misleads whoever reads the schema next, so it is dropped along with the API
  field that fed it. Every column in `attendance.prisma` is now written by some
  code path.

- **`LOG_PRETTY`** (CW-050). It was validated and never read — the logger it
  was meant for was never wired — and pretty-printed output is not the
  contract's shape. An `.env` that still sets it is ignored. The unused
  `nestjs-pino`, `pino-http` and `pino-pretty` dependencies went with it.

### Changed

- **Dates in the Thai console show the Buddhist-era year** (CW-058, first
  part). `formatDate` wrote "28 ก.ย. 2026": a Thai month with a Gregorian year.
  In Thai it now writes "28 ก.ย. 2569", in every table and detail page that goes
  through it. New helpers write a calendar month or a pay-period code as words,
  so "2026-08" can read "สิงหาคม 2569". English is unchanged, and stored values
  and the API stay Gregorian ISO dates. Still to come under the same ticket: the
  date input fields, the period labels on the payroll pages, the mobile app and
  the certificate PDF, which all still show Gregorian years.
- **Filing and approving leave in the app, done by someone who has never seen
  it** (CW-066). One day off was a trap: the range picker keeps "Save" disabled
  until an end date is tapped, so tapping the one day left a dead button. The
  form now asks for the first day, and "until" starts as the same day, so one
  day off is one tap. Half days are offered only for one day of a type that
  allows them. The submit button, any error, and a line saying what is still
  missing ("เลือกประเภทการลาก่อน") stay at the foot of the sheet instead of
  below the fold. Errors the leave and approval flows can meet (not enough
  leave, overlapping dates, too little notice, a document required, already
  decided) are worded in Thai from the error code instead of showing the
  server's English. Rejecting keeps its button disabled until a reason is
  typed, where it used to do nothing when tapped with the field empty.
- **The console reads as words, not system codes.** Pay periods, review cycles,
  expense claims, resignations, offboarding tasks, document requests and
  knowledge documents showed their status as the raw code (`CLOSED`, `DRAFT`),
  the activity log showed `LOGIN` about a `User`, and the sidebar named the
  person's role `HR_ADMIN`. Each is now a translated label, and the activity log
  filters by a list of record kinds instead of asking for a type name such as
  `PayrollRun`. A test fails if any status label has no Thai translation.
- **Easier to tap and to read.** The menu's Unicode symbols, which rendered as a
  dot or a sliver on computers without the right fonts, are drawn icons; text,
  fields and buttons are a size larger; on a touch screen every button and field
  is at least 44px tall, and fields no longer make iPhone Safari zoom in. The
  phone menu button says “เมนู” / “Menu”, the desktop no longer repeats the page
  title in a bar above it, and sidebar headings drop the letter-spacing that
  pulled Thai marks apart. Motion stops for people who ask their system for less.
- **Numbers lead to their lists.** The dashboard's tiles open the approvals,
  employees, leave or payroll behind them; an employee, whose work is in the
  phone app, is shown how to install it; the no-access page has a way home;
  closing a benefit plan asks first; and the roster keeps one line per day with
  the names pinned while the fortnight scrolls.
- **Leave, approvals and the employee directory are cards on a phone**
  (CW-063). Below 640px each leave request, approval and employee is a card
  headed by the person, with every
  other field on a labelled line and Approve / Reject full width at the foot,
  instead of a table row scrolled sideways. The desktop table is unchanged.
  Any table can take it with a class and a `data-label` per cell.
- **The mobile app's colours mean something.** Approved, present and paid were
  pink, because the chips took the theme's third colour; they are green now,
  pending is amber and rejected red, in both themes. Clocking out is orange
  rather than purple, and both clock buttons are taller.
- **The mobile app no longer has a built-in server address** (CW-060).
  `API_BASE_URL` used to default to `http://10.0.2.2:3000/api/v1`. It now has no
  default: a build without it opens on the connect screen, where a debug build
  also accepts plain HTTP. Pass `--dart-define=API_BASE_URL=…` as before to skip
  that screen during development.

- **`SECURITY.md` describes the system as it is** (CW-057). Three of its five
  known gaps had closed in 0.1.0 — second factors are required for privileged
  roles, uploads are scanned by ClamAV when it is switched on, and rate-limit
  counters can be shared across replicas — and are gone from the list; what
  remains is true of the current release, including that scanning is off by
  default. "Supported versions" now says which versions receive security fixes
  during 0.x: the latest release only, with no backports. A new section covers
  the other projects of the ecosystem: a problem found in one goes privately to
  that project; when code was adapted between projects, the owner of every
  project that adapted it is told privately and checks their own copy, and no
  advisory is published until each of those projects has a fixed release or its
  owner has said it is not affected; and
  [ADR-0022](https://github.com/SuruchBoss/PaynEat-ERP/blob/main/docs/adr/0022-vulnerability-disclosure-across-the-ecosystem.md)
  is linked as the rule rather than restated. "Scope" adds that a problem only
  HR, payroll or an administrator can reach is still a security problem, rated
  as needing a signed-in user (ADR-0022, decision 4). `docs/security.md` carries
  the same corrections, and names the public demo's one-click sign-in as the one
  path that opens a session without a code.
- **ADR-0004 is amended, not superseded** (CW-042): the rule is stated as its
  intended "no tool parameter may extend the caller's reach", rather than the
  literal "no employee id" that read as forbidding every manager-facing tool.
- **The copyright holder is named: Suruch Chakrapeesirisuk.** The LICENSE
  appendix said "Cwork contributors"; it now names the owner, a new `NOTICE`
  file carries the attribution Apache-2.0 section 4(d) asks derivative works to
  keep, and every source file starts with its copyright line and
  `SPDX-License-Identifier: Apache-2.0` (applied migrations and Flutter's
  platform scaffolding excepted). `node scripts/license-headers.mjs` checks it
  in CI and `--fix` adds it. The licence itself is unchanged.
- **Only pull requests from a fork need a DCO sign-off.** The check moved from
  `ci.yml` to `license-check.yml` and now also requires the sign-off to name the
  commit's author.
- **`LOG_LEVEL` takes the contract's severities** (CW-050): `DEBUG`, `INFO`,
  `NOTICE`, `WARNING`, `ERROR`, `CRITICAL`, in any case. The old names
  (`info`, `warn`, `debug`, `fatal`, …) still work, so no `.env` needs to
  change. The default is `INFO`.
- **The overview page is rebuilt around six problems it solves** — an HR bill
  that grows with headcount, payroll you hold your breath over, buddy punching and
  sites with no signal, requests waiting for a signature, PDPA exposure, and
  systems that do not talk to each other — each answered by the several features
  that close it, in a modern Japanese design. The English page now shows the
  English console, and each page has a link-preview card in its own language. Both READMEs
  open with the same six problems.
- **The walkthrough's English take is recorded on the English console**, in the
  organisation's time zone; it had shown the Thai interface under English
  captions, ending on a line that the English locale was still on the backlog.

### Fixed

- **Leave approved or cancelled after its days had passed left attendance
  wrong.** The nightly close-out marks a working day with no punch absent, and
  approving leave for that day afterwards left it absent, so payroll deducted a
  day of paid leave. Cancelling approved leave that had begun did the opposite
  and left the day as leave. Both now derive those days again, closing them out
  by the same rule, so attendance and payroll follow the leave; a day payroll
  has already locked is left as it was paid (CW-067).
- **The leave import took figures Cwork could never have recorded** (#59). It
  refused a fraction only for a leave type without half days, so `0.3` days of
  annual leave went through. A figure must now be one Cwork could have written
  itself for that type: any two decimals for leave taken by the hour (an hour
  of an eight-hour day is 0.13), multiples of 0.5 for half days, and whole days
  otherwise. A half-day type refuses `0.3` with its own message, "ลาพักร้อน
  กรอกได้ทีละครึ่งวัน เช่น 1 หรือ 1.5".
- **Approvals said `ANNUAL` instead of the leave type's name.** A leave request
  waiting for a decision was described by the code its approval keeps, in the
  console and in the app. Both now show the name HR gave the type (ลาพักร้อน),
  and the console names overtime and document request kinds too.
- **The API's Docker image could not start.** The certificate renderer reads
  the Thai font from `assets/fonts` when the API boots, and `backend/Dockerfile`
  never copied `assets/` into the runtime image, so the container stopped with
  `ENOENT` before it listened. It copies them now. Found while building the
  public demo's image, which had the same gap.
- **The demo company withheld almost no income tax.** Its only payroll run was
  last month's, and withholding is the year's projected tax less what has
  been withheld so far — so with nothing on record for January to July, a
  ฿45,000 salary withheld ฿0 and every screenshot of a payslip showed it. The
  seed now pays every month of the year so far through the real payroll code
  (prepared by the payroll officer, approved by the HR manager), and the same
  salary withholds ฿1,082 a month, as it should. The demo's leave requests are
  also dated in working days now: counted in calendar days, one of them fell
  on a weekend when the seed ran on a Monday and was refused, and the demo
  lost the one request waiting on a decision. The screenshots and the
  walkthrough are retaken on the corrected data.

## [0.3.1] — 2026-09-26

A security release. It fixes
[GHSA-3cgw-73cr-r8c6](https://github.com/SuruchBoss/Cwork/security/advisories/GHSA-3cgw-73cr-r8c6),
and every installation running 0.1.0 through 0.3.0 should upgrade.

### Security

- **A session could be issued without a verified second-factor code.** A session
  is now issued only in answer to a code verified in the same request.
- **Failed second-factor attempts did not reliably lead to a lockout.** The
  failed-attempt count was cleared as soon as the password was correct, before
  the second factor had been checked. It is now cleared only when a sign-in
  completes.
- **The demo seed no longer has a default password.** `db:seed` gave every demo
  account a password printed in the README, including the accounts it marks as
  requiring two-factor authentication. It now takes `SEED_PASSWORD`, or
  generates a password for the run and prints it once. On an installation that
  was seeded without `SEED_PASSWORD`, re-run the seed with it set, or change
  those accounts' passwords.

### Removed

- **`POST /auth/mfa/complete-enrolment`.** An account that has to enrol while it
  signs in now receives its session from `POST /auth/mfa/activate`, in a new
  `session` field beside the recovery codes: the code that switches the factor
  on is the one that finishes the sign-in. An account that is already enrolled
  signs in through `POST /auth/mfa/verify`, as before. The web console is
  updated; the mobile app never called the endpoint.

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

[Unreleased]: https://github.com/SuruchBoss/Cwork/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/SuruchBoss/Cwork/releases/tag/v0.3.1
[0.3.0]: https://github.com/SuruchBoss/Cwork/releases/tag/v0.3.0
[0.2.0]: https://github.com/SuruchBoss/Cwork/releases/tag/v0.2.0
[0.1.0]: https://github.com/SuruchBoss/Cwork/releases/tag/v0.1.0
