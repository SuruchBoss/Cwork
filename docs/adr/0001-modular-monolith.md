# 1. Modular monolith over microservices

**Status:** Accepted

## Context

An HRIS has recognisable bounded contexts — recruitment, people, leave,
attendance, payroll — and the obvious move is a service per context.

But those contexts are not independent at the point that matters. A payroll run
reads approved overtime, unpaid leave days and locked attendance records, and it
must see a consistent snapshot of all three. Splitting them turns that into a
distributed transaction.

There is also a deployment constraint: this is meant to be self-hostable by an
organisation with one person running it. Every service is another thing to
deploy, monitor and upgrade.

## Decision

One NestJS process, organised as modules with real boundaries:

- each module owns its tables;
- modules call each other's **services**, never each other's repositories;
- the approval engine dispatches outcomes through a handler registry, so it does
  not import the modules it serves.

## Consequences

**Good.** Payroll consistency is a database transaction. `docker compose up`
runs the whole system. Refactoring across a boundary is a compile error, not a
production incident.

**Bad.** The whole app scales as a unit. A runaway payroll calculation competes
with clock-ins for the same process. Module boundaries are a convention the
compiler only partly enforces — a determined contributor can import across them.

**Revisit if:** one module's load genuinely diverges from the rest (most likely
attendance, at high headcount), or separate teams need independent release
cycles. The service boundaries are already drawn; extraction would be mechanical.
