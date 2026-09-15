# Cwork — API

NestJS 11 + Prisma + PostgreSQL 16. A modular monolith: one process, real module
boundaries. See [docs/architecture.md](../docs/architecture.md) for why.

## Running

```bash
cp .env.example .env    # set DATABASE_URL and the secrets it asks for
npm install
npx prisma migrate deploy
npm run db:seed         # demo company — evaluation only
npm run start:dev       # → http://localhost:3000, docs at /api/docs
```

You need PostgreSQL 16. pgvector is optional and only used for semantic search
in the assistant.

## Scripts

| Command | |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` · `start:prod` | Production build and run |
| `npm test` · `test:cov` | Unit tests (126, no database needed) |
| `npm run test:e2e` | End-to-end tests (36) — needs a throwaway database, see below |
| `npm run typecheck` · `lint` | Static checks |
| `npm run prisma:migrate` | Create a migration — **see the warning below** |
| `npm run prisma:deploy` | Apply migrations |
| `npm run db:seed` · `db:verify` | Seed demo data · verify hand-written DB objects |

## End-to-end tests

```bash
E2E_DATABASE_URL=postgresql://cwork:cwork@localhost:5432/cwork_test npm run test:e2e
```

Boots the real application in-process and drives it over HTTP. It migrates,
**truncates** and seeds the database it is given, then walks one company through
a month: sign-in, permission scoping, a leave request from submission to
approved balance, clock in and out with an offline replay, overtime, expenses,
documents, policy search, a full payroll run with separation of duties, and the
audit trail that recorded all of it.

It refuses a database whose name does not look like a test database unless you
set `E2E_ALLOW_NON_TEST_DB=1`. Point `E2E_DATABASE_URL` somewhere disposable
instead.

## Layout

```
src/
├── core/                 Config, Prisma, security, HTTP plumbing, utilities
└── modules/<domain>/
    ├── domain/           Pure functions — no Prisma, no Nest, no I/O
    ├── application/      Services: orchestration, transactions, permissions
    └── api/              Controllers and DTOs
```

`domain/` is where the rules live. Leave arithmetic, attendance derivation, Thai
tax, KPI scoring and assessment grading are all pure functions of their inputs,
which is why the test suite runs in ten seconds without a database — and why a
disputed payslip can be explained by reading one function.

## Migrations: read this before running `prisma migrate dev`

Prisma does not know about the hand-written SQL in
`prisma/migrations/*_search_and_integrity/`: search indexes, CHECK constraints,
and the append-only triggers on `audit_logs` and `attendance_punches`.

When you change `schema.prisma` and run `prisma migrate dev`, Prisma compares
the database to the Prisma schema and **generates DROP statements for all of
them as if they were drift.** This is not hypothetical — it silently dropped
every search index during development.

```bash
npx prisma migrate dev --create-only --name your_change
# Open the generated migration. Delete any DROP INDEX / DROP COLUMN /
# DROP TRIGGER targeting an object from the search_and_integrity migration.
npx prisma migrate deploy
npm run db:verify     # fails loudly if an object went missing
```

`db:verify` runs in CI for exactly this reason.

## Tests

126 unit tests over the domain layer:

| Area | Covers |
|---|---|
| `leave-calculator.spec.ts` | Half-days, weekend and holiday exclusion, accrual, carry-over |
| `attendance-calculator.spec.ts` | Lateness with grace, night shifts, breaks, geofencing, impossible travel |
| `thai-tax.spec.ts` | Bracket arithmetic (hand-verified), every allowance cap, monthly withholding |
| `payroll-calculator.spec.ts` | Proration, overtime, SSO ceilings, net = gross − deductions |
| `kpi-scoring.spec.ts` | Achievement direction, the 150% cap, weighted scoring, grade bands |
| `assessment-grader.spec.ts` | All-or-nothing multiple choice, manual-grading holdback |
| `guardrails.spec.ts` | Crisis escalation, PII redaction, system prompt |

## Configuration

Every variable is in [`.env.example`](./.env.example) and validated on boot. The
API **refuses to start** on a weak or placeholder secret, a `FIELD_ENCRYPTION_KEY`
that is not 32 bytes, or a wildcard CORS origin in production. A misconfigured
deploy should fail loudly, not run insecurely.

`ASSISTANT_ENABLED=false` is the default; everything else works unchanged
without any AI provider.
