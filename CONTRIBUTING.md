# Contributing

Thanks for considering it. This is an HRIS: bugs here cost people their salary
or leak their national ID, so the bar for correctness is higher than the size of
the codebase suggests. That is the only reason any of the rules below exist.

## Getting set up

```bash
git clone https://github.com/SuruchBoss/Cwork.git
cd Cwork

# API
cd backend
cp .env.example .env         # set DATABASE_URL and the secrets
npm install
npx prisma migrate deploy && npm run db:seed
npm run start:dev

# Console
cd ../web && npm install && npm run dev

# Mobile
cd ../mobile && flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

You need Node 22+, PostgreSQL 16, and Flutter 3.24+ for mobile work. pgvector is
optional — only semantic search uses it.

`db:seed` is the demo company, which is what you want for development: known
passwords, a published two-factor secret, eight employees to work against. The
path a real installation takes is `npm run db:init` instead — see
[Operations](./docs/operations.md#first-run-setup). The two refuse to share a
database, so you cannot end up with demo accounts sitting next to real ones.

## Before you open a PR

```bash
cd backend && npm run typecheck && npm run lint && npm test && npm run db:verify
cd ../web  && npm run typecheck && npm run lint && npm test && npm run build
cd ../mobile && dart format --line-length 100 lib test && flutter analyze && flutter test
cd .. && node scripts/license-headers.mjs
```

CI runs all of it. `flutter analyze` must be **completely clean** — infos
included.

### End-to-end tests

Anything touching auth, leave, attendance, payroll or approvals should also run
the e2e suite, which drives the real application over HTTP:

```bash
cd backend
E2E_DATABASE_URL=postgresql://cwork:cwork@localhost:5432/cwork_test npm run test:e2e
```

It migrates, **truncates** and seeds the database it is pointed at, so give it a
throwaway one. It refuses to run against a database whose name does not look
like a test database — that guard is there to save your local data, so set
`E2E_DATABASE_URL` rather than reaching for `E2E_ALLOW_NON_TEST_DB=1`.

## Where code goes

```
backend/src/modules/<feature>/
├── domain/                 Pure functions. No Prisma client, no Nest, no I/O.
├── dto/                    Request and response shapes, with validation.
├── <feature>.service.ts    Orchestration, transactions, permissions.
├── <feature>.controller.ts HTTP only: route, guard, delegate.
└── <feature>.module.ts
```

Only `domain/` is a boundary; the rest are files named after what they are.
There is no `application/` or `api/` directory — one service file and one
controller file per module is unambiguous at this size. Add a second service
when one grows broad enough to be two subjects (`payroll.service.ts` and
`compensation.service.ts`), not because a layer diagram said to.

**Business rules belong in `domain/`.** If it computes leave days, tax, a KPI
score or an attendance status, it is a pure function of its inputs and it has a
unit test. This is not stylistic — it is what makes the rules cheap to test and
possible to explain to someone disputing a number.

A `domain/` file may import **types and enums** from `@prisma/client` and
nothing else from it: those enums are the vocabulary the rules are written in,
and a second copy of `LeaveAccrualMethod` is a second thing to keep in step.
What it must never touch is the client — no query, no transaction, no `await`
on anything that leaves the process.

Modules call each other's **services**, never each other's repositories.

## Things that will get a PR sent back

- **A business rule with no test.** Especially payroll and leave.
- **A query without `organizationId`.** Explicit tenant scoping is deliberate
  ([ADR-0003](./docs/adr/0003-explicit-tenant-scoping.md)).
- **A new endpoint without `@RequirePermissions`.** Authentication is global;
  authorisation is not automatic.
- **A swallowed error.** `catch {}` around something that matters will hide a
  real failure. We shipped exactly this bug during development: a `.catch()`
  silently discarded all twelve public holidays, which would have mis-charged
  every leave request in the system. If failure is acceptable, say so in a
  comment and log it.
- **A float for money.** `Decimal(18,4)`, always.
- **An assistant tool that takes an employee id.**
  See [ADR-0004](./docs/adr/0004-assistant-tool-scoping.md).

## Database changes

Prisma does not know about the hand-written SQL in
`prisma/migrations/*_search_and_integrity/` — the search indexes, CHECK
constraints and append-only triggers. `prisma migrate dev` will generate DROP
statements for all of them as if they were drift.

So:

1. `npx prisma migrate dev --create-only --name your_change`
2. Open the generated migration and **delete any DROP that targets an object
   from that file.**
3. `npx prisma migrate deploy && npm run db:verify`

`db:verify` fails loudly if an object went missing. It runs in CI for exactly
this reason.

## Commits and PRs

Conventional commits: `feat(leave): …`, `fix(payroll): …`, `docs: …`.

**One change per commit.** Some of the early history does not follow this — the
code was written by an AI agent under direction and several commits land
thousands of lines at once, which the README
[says plainly](./README.md#how-this-was-built). It is not the standard going
forward: a commit that does one thing is a commit that can be read, reverted and
bisected, and none of those work on a commit that does four.

That history stays as it is. It is accurate, and rewriting it to look more
conventional would be the actual dishonesty.

In the PR description, say what changed and **why** — the reasoning is the part
that is hard to recover later. If you made a non-obvious trade-off, an
[ADR](./docs/adr/) is welcome.

Anything a person installing Cwork would notice goes in
[CHANGELOG.md](./CHANGELOG.md) under `## [Unreleased]`, in the section that
fits — Added, Changed, Fixed, Security. A refactor nobody can see from outside
does not need an entry.

## Cutting a release

Rename `## [Unreleased]` to `## [x.y.z] — YYYY-MM-DD`, add a fresh empty
`Unreleased` above it, and push to `main`. The
[Release workflow](./.github/workflows/release.yml) reads the top entry, creates
an annotated tag and publishes a GitHub release with that section as the notes.

It is idempotent: a tag that already exists is left alone, so editing the
changelog for any other reason does nothing. Versions below 1.0 are published as
pre-releases, which is what the rest of the documentation says about them.

## Signing off your work

Every commit in a pull request from a fork needs a `Signed-off-by` line.
`git commit -s` adds it:

```
Signed-off-by: Somchai Jaidee <somchai@example.com>
```

It is the [Developer Certificate of Origin](./DCO) — a statement that you wrote
the change, or that you have the right to submit it under this project's
licence. It is not a copyright assignment and it takes nothing from you.

Forgot it? Fix the last commit with `git commit --amend -s`, or a whole branch
with:

```bash
git rebase --signoff origin/main
git push --force-with-lease
```

CI checks every non-merge commit in a pull request from a fork and names the
ones that are missing it.

**There is no CLA**, deliberately. A contributor licence agreement is a barrier
in front of a one-line fix, and the DCO covers the question a CLA is usually
reached for: whether the contributor had the right to contribute. The accepted
consequence is that the licence cannot realistically be changed later — doing so
would need every contributor's agreement — and Apache-2.0 is the answer, for
good.

## Developer Certificate of Origin (DCO)

Contributions are accepted under the project's license (see [LICENSE](LICENSE) and, where a
directory has its own, that directory's license). So that the origin of every change is clear,
**each commit in a pull request from a fork must be signed off** under the Developer Certificate
of Origin 1.1. CI checks it (`.github/workflows/license-check.yml`).

Sign off with `git commit -s`. It adds a line with the name and email of the commit's author:

```
Signed-off-by: Your Name <you@example.com>
```

By signing off you certify the following (the full text of the DCO, from
<https://developercertificate.org/>):

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

A sign-off is a statement made by a person. Automated tools and AI agents do not sign off on
anyone's behalf; the person who submits their work does.

## File headers

Every source file starts with its copyright and license identifier, for example:

```ts
// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0
```

`node scripts/license-headers.mjs --fix` adds it to new files; CI fails a file without it.
Applied database migrations are exempt, because editing one changes its recorded checksum.

## Tests

- **Backend**: unit-test every `domain/` function. Verify payroll and tax
  against hand-worked examples, not against what the code currently returns.
- **Web**: test formatters and anything that decides what the user sees.
- **Mobile**: test the offline punch queue and permission-driven navigation.

Write the test that would have caught the bug, not the test that passes.

## Adding a jurisdiction

The most useful contribution right now. Thai rules are data, not structure:

- Tax: copy `THAI_TAX_RULES_2026` into a new `TaxRuleSet` and pass it to
  `computeAnnualTax`.
- Leave: seed different `LeaveType` rows; accrual methods are already
  configurable.
- Overtime: multipliers live in `organization.settings.overtime`.

Bring worked examples from the relevant tax authority so the tests mean
something.

## Reporting bugs

Include the **request id** from the error response — it ties the error to the
server log and the audit trail.

For a security issue, please do not open a public issue.
See [SECURITY.md](./SECURITY.md).

## Code of conduct

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
