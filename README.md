<div align="center">

# Cwork

**Open-source HR information system — people, hiring, leave, attendance, payroll,
and an HR assistant that actually knows your policies.**

Built for Thai labour practice. Designed to be self-hosted.

**English** · [ภาษาไทย](./README.th.md)

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Backend](https://img.shields.io/badge/backend-NestJS%2011-e0234e.svg)](./backend)
[![Web](https://img.shields.io/badge/web-React%2019-61dafb.svg)](./web)
[![Mobile](https://img.shields.io/badge/mobile-Flutter-02569b.svg)](./mobile)

<img src="./docs/screenshots/03-dashboard.png" alt="Cwork dashboard" width="860">

</div>

---

## What you get

Three deployables, one database:

| | |
|---|---|
| **Admin console** | React 19 + Vite. Everything HR, payroll and managers do. |
| **Employee app** | Flutter. Clock in/out, leave, payslips, approvals — offline-tolerant. |
| **API** | NestJS modular monolith over PostgreSQL 16. |

No Redis, no message broker, no Kubernetes. Running several API instances needs
one setting (`THROTTLE_STORAGE=postgres`) rather than another service to operate
— an HRIS that needs a Kafka cluster to send a leave notification is one nobody
can self-host.

## Try it in five minutes

```bash
git clone https://github.com/SuruchBoss/Cwork.git
cd Cwork
cp .env.example .env
```

Fill in the secrets `.env` asks for — compose refuses to start without them:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
openssl rand -base64 32   # FIELD_ENCRYPTION_KEY
                          # plus POSTGRES_PASSWORD, anything you like
```

Then:

```bash
docker compose up -d --build
docker compose run --rm --build migrate            # apply migrations
docker compose run --rm migrate npm run db:seed    # demo data — evaluation only
```

Open **http://localhost:8080**.

| | |
|---|---|
| **As an employee** | `dev2@cwork.example` / `Cwork2026!` — password only |
| **As HR** | `hr.manager@cwork.example` / `Cwork2026!` — **plus a 2FA code** |

Admin accounts genuinely require a second factor, so `db:seed` prints a demo
TOTP secret and a QR link. Add it to any authenticator app once and every admin
account works.

> **Migrations run through the `migrate` service, not `exec api`.** The API image
> is pruned to production dependencies and ships no Prisma CLI. That service sits
> behind a compose profile, so `up` never starts it.

<details>
<summary><b>Running without Docker</b></summary>

```bash
# API — needs PostgreSQL 16 (pgvector optional)
cd backend
cp .env.example .env    # set DATABASE_URL and the secrets
npm install
npx prisma migrate deploy && npm run db:seed
npm run start:dev       # → http://localhost:3000

# Console
cd ../web
npm install && npm run dev    # → http://localhost:5173, proxies /api

# Mobile
cd ../mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

The interactive API docs live at `/api/docs` whenever `NODE_ENV` is not
`production` — which is what compose defaults it to, so set
`NODE_ENV=development` in `.env` if you want them.

</details>

---

## What it does

> **The interface is Thai.** An English locale is on the
> [backlog](./docs/backlog.md) as CW-016. Every image below is a real screenshot
> of the seeded demo company — the console in a browser, the employee app on a
> 390×844 phone.

### People

Employee records with encrypted national IDs and bank accounts, an org chart,
employment history, and resignation with a clearance checklist and exit
interview.

<img src="./docs/screenshots/04-employees.png" alt="Employee register" width="49%"> <img src="./docs/screenshots/18-employee-detail.png" alt="Employee record" width="49%">

### Leave

Thai statutory leave types, seniority-tiered accrual, half and hourly days, and
a balance ledger that reserves pending days — so two overlapping requests cannot
both fit inside one remaining day.

**Friday to Monday costs two days, not four.** Weekends and public holidays are
excluded, not charged.

<img src="./docs/screenshots/05-leave.png" alt="Leave" width="860">

### Attendance

Clock in/out with geofencing and anti-fraud flags, shift rosters, corrections,
and overtime at Labour Protection Act rates.

**A punch outside the fence is flagged, never rejected.** An employee must always
be able to prove they turned up; HR reviews the flag afterwards.

<img src="./docs/screenshots/06-attendance.png" alt="Attendance" width="860">

### Payroll

Effective-dated salary, Thai withholding tax and social security, benefits,
expense reimbursement — and payslips you can still explain a year later.

**Whoever calculates a run cannot approve it**, enforced by the API rather than
by policy.

<img src="./docs/screenshots/07-payroll.png" alt="Payroll periods and runs" width="49%"> <img src="./docs/screenshots/19-payroll-run.png" alt="Payroll run" width="49%">

### Approvals

One declarative engine serves leave, overtime, expenses, attendance corrections,
resignations, requisitions, offers, payroll runs and document requests. Policies
resolve approvers by line manager, department head, role or named user, and carry
conditions such as amount thresholds.

<img src="./docs/screenshots/09-approvals.png" alt="Approval queue" width="860">

### Hiring, performance, documents

Requisitions through a public careers page, PDPA-consented applications,
auto-graded assessments, interviews with scorecards, and offers that convert into
employee records. Review cycles with weighted KPIs and calibration. Certificates
and letters employees can request for themselves.

<img src="./docs/screenshots/11-recruitment.png" alt="Recruitment" width="32%"> <img src="./docs/screenshots/10-performance.png" alt="Performance" width="32%"> <img src="./docs/screenshots/13-documents.png" alt="Document requests" width="32%">

### The HR assistant

Answers policy questions from your own documents, checks balances, and files leave
and document requests — scoped so it can only ever see the asker's own data.

**It is optional and off by default.** Policy search falls back to PostgreSQL
full-text plus trigram matching, which needs no embeddings and copes with Thai's
lack of word boundaries.

<img src="./docs/screenshots/14-knowledge.png" alt="HR knowledge base" width="49%"> <img src="./docs/screenshots/15-assistant.png" alt="Assistant, disabled by default" width="49%">


### The employee app

Flutter, for everyone who never opens the console. Clock in and out with
geofencing, request leave, read a payslip, approve what is waiting, ask the
assistant.

Built for a phone that loses signal: punches queue in durable storage and replay
on reconnect, carrying a client-generated id so a retry cannot become a second
punch.

<img src="./docs/screenshots/mobile/01-login.png" alt="Mobile sign-in" width="23%"> <img src="./docs/screenshots/mobile/02-home.png" alt="Clock in and out" width="23%"> <img src="./docs/screenshots/mobile/03-leave.png" alt="Leave balances and requests" width="23%"> <img src="./docs/screenshots/mobile/05-payslip-detail.png" alt="Payslip breakdown" width="23%">

That payslip is the "explain it a year later" claim in practice: earnings,
deductions, and employer contributions kept visibly separate from what came out
of the employee's pay.

<details>
<summary><b>More screenshots</b> — sign-in and 2FA, expenses, offboarding, org chart, audit, dark theme, phone width</summary>

<br>

**Sign-in, and the second factor an admin account cannot skip**

<img src="./docs/screenshots/01-login.png" alt="Sign in" width="49%"> <img src="./docs/screenshots/02-mfa-code.png" alt="Two-factor code" width="49%">

**Expenses and offboarding**

<img src="./docs/screenshots/08-expenses.png" alt="Expense claims" width="49%"> <img src="./docs/screenshots/12-offboarding.png" alt="Offboarding" width="49%">

**Org chart and the append-only audit trail**

<img src="./docs/screenshots/16-organization.png" alt="Organisation structure" width="49%"> <img src="./docs/screenshots/17-audit.png" alt="Audit log" width="49%">

**More of the employee app** — payslips, the assistant, profile, and filing leave

<img src="./docs/screenshots/mobile/04-payslip.png" alt="Payslips" width="23%"> <img src="./docs/screenshots/mobile/06-assistant.png" alt="HR assistant on mobile" width="23%"> <img src="./docs/screenshots/mobile/07-profile.png" alt="Profile" width="23%"> <img src="./docs/screenshots/mobile/08-leave-request.png" alt="Filing a leave request" width="23%">

**Dark theme, and the console at phone width**

<img src="./docs/screenshots/20-dashboard-dark.png" alt="Dark theme" width="64%"> <img src="./docs/screenshots/21-mobile-width.png" alt="Phone width" width="20%">

</details>

---

## A few decisions worth knowing about

**Business rules are pure functions.** Leave arithmetic, attendance derivation,
Thai tax, KPI scoring and assessment grading live in `domain/` directories with
no database, no framework and no I/O. That is why 203 backend tests run in ten
seconds — and why *"why was I charged 2.5 days?"* is answered by reading one
function instead of a query plan.

**Salary is never prorated by attendance coverage.** A monthly-salaried employee
is paid the full month minus *explicit* unpaid leave and absence. Days that
simply have not been closed out — future dates, or a clock-in rollout still in
progress — must not reduce pay. Getting this wrong silently shorts people, which
is the worst class of payroll bug.

**The audit trail is append-only in the database.** A trigger raises an exception
on `UPDATE` or `DELETE` against `audit_logs` and `attendance_punches`. A
compromised application account can add entries but cannot rewrite history.

**Privileged accounts cannot sign in with a password alone.** Anyone who can read
national IDs, run payroll or hand out permissions needs a second factor. TOTP is
implemented against RFC 6238's own test vectors rather than pulled in as a
dependency, and a code cannot be spent twice even inside its validity window.

**Uploads are scanned before they are stored.** Résumés arrive from a public
careers page — the least trusted input the system takes. The bytes go to clamd
first, so malware is never written anywhere for a later change to expose. And a
scanner that is not working is never a pass: unreachable, timed out, or a reply
that cannot be parsed all leave the file held and undownloadable.

**The assistant's tools take no employee id.** Every one resolves the subject from
the authenticated principal, so there is no parameter a prompt injection could set
to read someone else's payslip. The blast radius of a fully compromised model is
bounded by what that user could already see.
See [ADR-0004](./docs/adr/0004-assistant-tool-scoping.md).

## Repository layout

```
backend/     NestJS API — modular monolith over PostgreSQL
web/         React 19 + Vite admin console
mobile/      Flutter employee app
docs/        Spec, architecture, security, data model, API, ADRs, backlog
.github/     CI workflow, issue and pull-request templates
```

## Documentation

| | |
|---|---|
| [Specification](./docs/spec.md) | What the system does, module by module — the reference for what "correct" means |
| [Backlog](./docs/backlog.md) | Open work, prioritised, with acceptance criteria |
| [Architecture](./docs/architecture.md) | How the pieces fit, and what is deliberately absent |
| [Security](./docs/security.md) | Auth, encryption, audit — and an honest list of gaps |
| [Data model](./docs/data-model.md) | Schema patterns and the hand-written SQL |
| [API reference](./docs/api.md) | Endpoints, error codes, conventions |
| [Payroll: Thai rules](./docs/payroll-thailand.md) | Tax brackets, allowances, OT multipliers |
| [The HR assistant](./docs/ai-assistant.md) | Tools, guardrails, data flow |
| [Operations](./docs/operations.md) | Deploy, backup, scheduled jobs, the Prisma drift trap |
| [ADRs](./docs/adr/) | Decisions that were not obvious |

## Localisation

The UI is Thai, and payroll implements Thai rules — PIT withholding, social
security, Labour Protection Act overtime. Nothing in the *architecture* is
Thailand-specific: the tax rule set is data (`THAI_TAX_RULES_2026`), leave types
are configuration, and overtime multipliers are per-organisation settings. Adding
another jurisdiction means a new rule set and a translation pass, not a rewrite.

## Status

Working and verified end to end — sign-in through payroll. 203 backend unit
tests, 17 web, 33 mobile, plus an 89-check end-to-end suite that drives the real
API over HTTP in CI, and the console exercised in a real browser against the live
API.

Second-factor authentication, upload scanning and shared rate limiting are in
place, so nothing is left in the backlog's P0 tier.

**Still not production-ready without work.** Before running real payroll, read
[the gaps in docs/security.md](./docs/security.md#what-this-does-not-do). In
short: no ภ.ง.ด.1 filing export, issued documents are not rendered as PDFs, no
email or push delivery, and this code has never had a penetration test.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). The
[backlog](./docs/backlog.md) is the list of open work, with the ones marked
*good first issue* called out; they tend to be leave-policy variants, payroll edge
cases, or a jurisdiction other than Thailand.

## Licence

[Apache 2.0](./LICENSE).
