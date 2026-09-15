<div align="center">

# Cwork

**Open-source HR information system — people, hiring, leave, attendance, payroll,
and an HR assistant that actually knows your policies.**

Built for Thai labour practice, designed to be self-hosted.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Backend](https://img.shields.io/badge/backend-NestJS%2011-e0234e.svg)](./backend)
[![Web](https://img.shields.io/badge/web-React%2019-61dafb.svg)](./web)
[![Mobile](https://img.shields.io/badge/mobile-Flutter-02569b.svg)](./mobile)

</div>

---

## What it does

| | |
|---|---|
| **People** | Employee records with encrypted identifiers, org chart, employment history, resignation with a clearance checklist and exit interview |
| **Hiring** | Requisitions, a public careers page, PDPA-consented applications, auto-graded assessments, interviews with scorecards, offers that convert into employee records |
| **Leave** | Thai statutory leave types, seniority-tiered accrual, half and hourly days, a balance ledger that reserves pending days, carry-over |
| **Attendance** | Clock in/out with geofencing and anti-fraud flags, shift rosters, corrections, overtime at Labour Protection Act rates |
| **Payroll** | Effective-dated salary, Thai withholding tax and social security, benefits, expense reimbursement, payslips you can still explain a year later |
| **Performance** | Review cycles, weighted KPIs with check-ins, self and manager reviews, calibration |
| **Assistant** | Answers policy questions from your own documents, checks balances, files leave and document requests — scoped so it can only ever see the asker's own data |

Three deployables: a **NestJS API**, a **React admin console**, and a **Flutter
app** for employees.

## Quick start

```bash
git clone https://github.com/SuruchBoss/Cwork.git
cd Cwork
cp .env.example .env
# Fill in POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
# FIELD_ENCRYPTION_KEY — compose refuses to start without them:
#   openssl rand -base64 48   # JWT secrets
#   openssl rand -base64 32   # FIELD_ENCRYPTION_KEY

docker compose up -d --build
docker compose run --rm --build migrate              # apply migrations
docker compose run --rm migrate npm run db:seed      # demo data — evaluation only
```

Migrations run through the one-off `migrate` service rather than `exec api`,
because the API image is pruned to production dependencies and ships no Prisma
CLI. It is behind a compose profile, so `up` never starts it.

| | |
|---|---|
| Admin console | http://localhost:8080 |
| Demo login | `hr.manager@cwork.example` / `Cwork2026!` — an admin account, so it also needs a 2FA code; `db:seed` prints the demo secret to add to an authenticator app once. `dev2@cwork.example` signs in with the password alone. |
| API docs | http://localhost:3000/api/docs — only when `NODE_ENV` is not `production`, which compose defaults it to. Set `NODE_ENV=development` in `.env` to mount them. |

The seed creates a company with eight employees, Thai statutory leave types,
approval policies, a public-holiday calendar and eight HR policy documents for
the assistant.

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
</details>

## Repository layout

```
backend/     NestJS API — modular monolith over PostgreSQL
web/         React 19 + Vite admin console
mobile/      Flutter employee app
docs/        Spec, architecture, security, data model, API, ADRs, backlog
.github/     CI workflow, issue and pull-request templates
```

## A few decisions worth knowing about

**Business rules are pure functions.** Leave arithmetic, attendance derivation,
Thai tax, KPI scoring and assessment grading live in `domain/` directories with
no database, no framework and no I/O. That is why 158 backend tests run in ten
seconds — and why "why was I charged 2.5 days?" is answered by reading one
function instead of a query plan.

**Salary is never prorated by attendance coverage.** A monthly-salaried employee
is paid the full month minus *explicit* unpaid leave and absence. Days that
simply have not been closed out yet — future dates, or a clock-in rollout still
in progress — must not reduce pay. Getting this wrong silently shorts people,
which is the worst class of payroll bug.

**A punch outside the geofence is flagged, not rejected.** An employee must be
able to prove they turned up. The same applies when GPS is off or times out: the
punch is recorded with a note and surfaced to HR, rather than refused.

**The audit trail is append-only in the database.** A trigger raises an exception
on `UPDATE` or `DELETE` against `audit_logs` and `attendance_punches`. A
compromised application account can add entries but cannot rewrite history.

**Whoever calculates payroll cannot approve it.** Separation of duties is
enforced by the API, not by policy.

**The assistant's tools take no employee id.** Every one resolves the subject
from the authenticated principal, so there is no parameter a prompt injection
could set to read someone else's payslip. The blast radius of a fully
compromised model is bounded by what that user could already see.
See [ADR-0004](./docs/adr/0004-assistant-tool-scoping.md).

**The AI is optional.** `ASSISTANT_ENABLED=false` is the default and everything
else works unchanged. Policy search falls back to Postgres full-text plus
trigram matching, which needs no embeddings and handles Thai's lack of word
boundaries.

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

The UI is Thai, and payroll implements Thai rules (PIT withholding, social
security, Labour Protection Act overtime). Nothing in the architecture is
Thailand-specific: the tax rule set is data (`THAI_TAX_RULES_2026`), leave types
are configuration, and overtime multipliers are per-organisation settings.
Adding another jurisdiction means a new rule set and a translation pass, not a
rewrite.

## Status

Working and verified end to end — sign-in through payroll. 158 backend unit
tests, 17 web, 30 mobile, plus a 49-check end-to-end suite that drives the real
API over HTTP in CI, and the admin console exercised in a real browser against
the live API.

**Not production-ready without work.** Before running real payroll, read
[the gaps in docs/security.md](./docs/security.md#what-this-does-not-do). In
short: no malware scanning on uploads, no ภ.ง.ด.1 filing export, no penetration
test.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). The
[backlog](./docs/backlog.md) is the list of open work, with the ones marked
*good first issue* called out; they tend to be leave-policy variants, payroll
edge cases, or a jurisdiction other than Thailand.

## Licence

[Apache 2.0](./LICENSE).
