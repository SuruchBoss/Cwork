# 6. A work location's code is the ecosystem's location code

**Status:** Accepted

**Date:** 2026-09-25

## Context

Cwork is one of four projects by the same maintainer that touch the same
restaurant chain from different sides: PaynEat POS sells at a branch, PaynEat
ERP moves stock between supplier, plant and branch, Cwork employs the people who
work at each of them, and a private investigator service reads all of their logs.
The ecosystem's boundaries are recorded in the ERP's ADR-0011: each system owns
one domain, no system reads another's database, and **a site has the same code
everywhere**.

`WorkLocation.code` is free text today. It is unique per organisation and
nothing else is true of it: any string, changeable at any time. That is fine
while nothing outside Cwork refers to a location, and wrong the moment anything
does — a code that can be edited is not an identifier, it is a label.

It is also weak on its own terms. Cwork's own payroll exports will carry a
location, and an export whose key changed last week is an export nobody can
reconcile.

## Decision

**A work location's code is the ecosystem's location code**, in the shape the
ERP's glossary defines:

- `^[A-Z0-9][A-Z0-9-]{1,31}$` — uppercase letters, digits and hyphens, 2 to 32
  characters.
- Correctable **until the location is first used**; after that it is fixed, and
  a wrong code is replaced by creating a new location and deactivating the old
  one with a *superseded by* link.

"First used" needs a Cwork-side meaning, since the ERP's — a posted document, a
POS master-data pull — does not apply here. In Cwork a location is first used
when any of these has happened:

1. a punch has been recorded against it;
2. a shift or schedule has been assigned to it;
3. it has appeared in an export that left the system.

Each is an event that can be pointed at, rather than a judgement. The rule is
deliberately generous at the start: a code typed wrong during setup, before
anyone has clocked in, is simply corrected.

## Consequences

**This is a breaking change for existing installations.** Codes that do not
match the format have to be corrected before the constraint applies, including
the demo seed. The migration reports what it would change before it changes
anything, and refuses rather than mangling a code it cannot mechanically fix.

**A standalone Cwork gains from this too**, which is the test the ecosystem work
has to pass: an immutable, well-shaped code is a better key for Cwork's own
payroll and attendance exports than free text, and the rule would be worth
adopting with no ERP anywhere near it. See the ecosystem principle in
[spec.md § Agreed direction](../spec.md#agreed-direction).

**Superseding is not deletion.** The old location keeps its punches, its
schedules and its history; it stops accepting new ones and points at its
replacement. Attendance history is append-only, and a renamed site must not
silently rewrite where somebody worked last year.
