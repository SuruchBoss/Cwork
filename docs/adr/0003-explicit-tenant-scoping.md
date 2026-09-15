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

**Mitigation to consider:** Postgres row-level security as a second layer, so the
database enforces isolation even if the application forgets. Not implemented —
it complicates migrations and connection pooling, and the explicit filter has
held so far.
