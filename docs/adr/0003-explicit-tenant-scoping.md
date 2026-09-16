# 3. Explicit tenant scoping, no global middleware

**Status:** Accepted

## Context

Every tenant-owned row carries `organizationId`. The tempting approach is Prisma
middleware that injects the filter automatically, so no developer can forget it.

## Decision

Every repository query passes `organizationId` explicitly. No middleware.

## Rationale

Automatic injection fails silently in exactly the places that matter:
`$queryRaw`, nested writes, `createMany`, and any query shape the middleware did
not anticipate. When it stops applying, nothing breaks visibly — data simply
starts leaking across tenants, and it may be months before anyone notices.

An explicit filter is code review can see, grep can find, and a missing one
usually shows up as an empty result in testing rather than as someone else's
payroll.

## Consequences

**Good.** Isolation is visible at every call site and greppable. No hidden
behaviour to reason about when debugging a query.

**Bad.** It is repetitive, and a forgotten filter is a real bug rather than an
impossible one. Employee visibility is centralised in
`employeeVisibilityFilter()` to reduce the surface; other modules repeat
`organizationId` by hand.

**Raw SQL is where "greppable" stopped being enough.** Prisma's builder makes
the ordinary case hard to get wrong: the filter is a typed argument and its
absence is visible in the call. `$queryRaw` takes a string, and a `WHERE`
clause twenty lines below the call site is what a reviewer skims past — this
review nearly cleared one on the strength of the first dozen lines.

So `npm run verify:sql` requires every raw statement in `src/` to be listed,
with a reason, in `backend/scripts/verify-raw-sql.ts`, and runs in CI. It is a
tripwire rather than a proof: it cannot tell a real predicate from the word
`organizationId` sitting in a SELECT list — `outbox.dispatcher.ts` does exactly
that and is right to. What it can do is stop a new raw statement appearing
without somebody reading it, and stop an entry outliving the query it
describes. Nine statements today: three tenant-scoped, six that touch no tenant
row at all (two advisory locks, the catalogue read and truncate behind the test
helper, and the rate-limit counters, which are keyed by client and route and
run before sign-in).

**Mitigation to consider:** Postgres row-level security as a second layer, so the
database enforces isolation even if the application forgets. Not implemented —
it complicates migrations and connection pooling, and the explicit filter has
held so far.
