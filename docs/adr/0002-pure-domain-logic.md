# 2. Business rules as pure functions

**Status:** Accepted

## Context

The rules that are expensive to get wrong — leave arithmetic, attendance
derivation, Thai income tax, KPI scoring — are also the ones most tangled with
database access if written naively. Tangled rules get tested with fixtures, a
running Postgres and a lot of setup, which means in practice they get tested
thinly.

Payroll has a second property: someone will eventually dispute a number, and you
have to be able to explain it.

## Decision

Every business rule lives in `modules/<name>/domain/` as a pure function: all
inputs passed in, no database, no framework, no I/O, no clock unless injected.
Services fetch data, call the domain function, and persist the result.

## Consequences

**Good.** 240 domain tests run in ten seconds with no database. Bracket
arithmetic and half-day leave rules are verified by hand against worked
examples. "Why was I charged 2.5 days?" is answered by reading one function, and
payslips are reproducible from their stored snapshot because the calculation is
deterministic.

**Bad.** Services are longer — assembling inputs is explicit work. Some data is
fetched that a clever query could have filtered. A rule that genuinely needs to
query mid-calculation has to be restructured.

**Rejected alternative:** rules as Prisma queries with the logic in SQL. Faster,
but untestable without a database and unreadable when someone disputes a number.
