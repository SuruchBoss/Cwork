# Labour data contract — proposal, v1 draft

**Status: settled design. Nothing here is built yet** — CW-051 implements it.
Every decision this document once listed as open was made on 2026-09-25.

**Who consumes it.** The ERP feature that folds labour into production cost is
part of its paid Enterprise edition (the ERP's ADR-0015), scheduled after ERP
v1. **Cwork is and remains entirely Apache 2.0** — the ERP's edition split
applies to the ERP, not here, and nothing in Cwork moves behind a paywall. This
is said plainly rather than left to be discovered: a contributor to CW-051
should know from the start that the first consumer of their work is a paid
product, that Apache 2.0 has always permitted exactly that for anyone including
the maintainer, and that this contract is a documented public interface any
other consumer may implement against.

**Versioned on its own.** This contract is `labour-data/1.0`. It is *not* tied to
Cwork's 0.x, where breaking changes are allowed and expected. Cwork may reach
1.0, 2.0 or stay at 0.x for a year; a consumer of this contract is only affected
by a change to the version above. A consumer that breaks is somebody else's
outage, so the freedom Cwork keeps for itself does not extend here.

## What leaves Cwork, and what never does

Two aggregates leave. **No employee identity and no individual pay ever leaves**
— not hashed, not pseudonymous, not "just the id". A consumer that needs a
person needs a different conversation and a different contract.

| Aggregate | Grain | Emitted when |
|---|---|---|
| **Labour cost** | cost centre × closed payroll period | a payroll run is closed |
| **Attended hours** | work location × business day | attendance for that day is locked |

The second is derived from attendance alone, so it does not wait for payroll and
arrives daily rather than monthly.

**Cost, not pay.** The labour figure is what the *employer* spent: gross plus
employer social security, employer provident fund and the employer's share of
benefits. Net pay is what a person received and is none of the ERP's business.

## Restatement — revisions, because the ERP cannot amend what it posted

A closed payroll period can be reopened and closed again; a locked attendance
day can be corrected, since a correction adds punches and the day is recomputed.
Either way a figure already delivered changes.

The ERP cannot simply overwrite it. Its ledger is append-only and a posted
document is immutable (ERP ADR-0003); a correction is a new posting. So it needs
to know that a figure was restated, and by how much.

**Each aggregate carries a revision.**

- `revision` — an integer starting at 1, incremented every time the period or day
  is closed again.
- `previousRevision` — the revision this one replaces, `null` on the first.
- **The idempotency key includes the revision.** Without it a restatement looks
  like a duplicate of the figure it corrects and is discarded by the very
  mechanism meant to make delivery safe.

The consumer is idempotent on `(period, revision)` and works out the difference
itself, then posts it as an adjustment in a period it still has open.

**Every revision carries the full figures, never a delta.** A consumer that has
not seen revision *n−1* — one that started mid-stream, or lost its store — treats
revision *n* as its opening position rather than failing to apply a difference
it cannot compute.

## Suppression — the rule that matters most

A labour cost for a cost centre of two people, published monthly, is two
salaries to anyone who knows who works there. Aggregation is not anonymity on
its own; a minimum group size is what makes it so.

**Proposed rule.** Below `LABOUR_MIN_GROUP` people, a group is not published.
Suppressed groups merge into a single `UNALLOCATED` bucket for that period. If
that bucket would carry fewer than `LABOUR_MIN_GROUP` people **or** fewer than
two source groups, the next-smallest published group joins it — otherwise
"suppressed" and "published minus total" reveal the same number the rule exists
to hide.

**Settled: 5.** The common threshold in statistical disclosure control, and at
four or fewer a Thai SME's cost centre is usually nameable.

## Mapping cost centres to ERP locations — settled: an explicit mapping

The handoff offers two approaches. They are not equivalent.

`Department.costCenter` is free text on a department; `WorkLocation.code` is the
site where somebody punches. **They are different things.** A delivery team can
be one cost centre spread across six branches; one branch can host three cost
centres. Declaring `costCenter` to *be* the location code would silently
mis-attribute cost in exactly the cases a chain cares about, and would be
impossible to detect downstream because the numbers would still add up.

**Settled: an explicit `costCentre → locationCode` mapping**, maintained in
Cwork — Cwork owns the cost centre, so it owns the mapping — many-to-one, with
unmapped cost centres **reported rather than dropped**.
An event for an unmapped cost centre carries `locationCode: null` and is still
emitted, so the ERP can see that labour exists which it cannot place, instead of
quietly under-costing a site.

Attended hours need no mapping at all: they are already keyed by
`WorkLocation.code`, which [ADR-0006](./adr/0006-location-code.md) makes the
ecosystem's location code.

## Delivery — settled: outbox events, with replay by period

Cwork already has a transactional outbox with `SELECT … FOR UPDATE SKIP LOCKED`,
exponential backoff and dead-lettering (CW-006). Emitting from it costs almost
nothing and mirrors ERP ADR-0002.

- **Primary: outbox events** to a registered consumer holding a machine
  credential, with the idempotency key below. The ERP does not poll.
- **Catch-up: a replay endpoint by period**, not a cursor over a stream. These
  aggregates are recomputed from stored payroll and attendance, so replay is
  idempotent and cheap — a consumer that was down for a week asks for the week
  rather than replaying every event since.
- The machine credential is a principal like any other: scoped to this contract,
  revocable, and every call it makes is audited.

## Schemas (draft)

```jsonc
// labour.cost.period_closed
{
  "contract": "labour-data", "version": "1.0",
  "event": "labour.cost.period_closed",
  "idempotencyKey": "<org>:<periodCode>:<costCentre>:r2",
  "revision": 2, "previousRevision": 1,
  "emittedAt": "2026-10-01T03:00:00.000Z",
  "period": {
    "code": "2026-09", "start": "2026-09-01", "end": "2026-09-30",
    "payDate": "2026-09-30", "closedAt": "2026-10-01T02:58:11.000Z"
  },
  "costCentre": "KITCHEN-01",
  "locationCode": "BKK-LADPRAO",   // null when unmapped — reported, not dropped
  "currency": "THB",
  "headcount": 14,
  "employerCost": {
    "gross": "412000.0000", "overtime": "38500.0000",
    "employerSocialSecurity": "18900.0000", "employerProvidentFund": "12360.0000",
    "benefits": "9400.0000", "total": "452660.0000"
  }
}

// labour.hours.day_locked
{
  "contract": "labour-data", "version": "1.0",
  "event": "labour.hours.day_locked",
  "idempotencyKey": "<org>:<locationCode>:<workDate>:r1",
  "revision": 1, "previousRevision": null,
  "emittedAt": "2026-09-25T01:15:00.000Z",
  "locationCode": "BKK-LADPRAO",
  "workDate": "2026-09-24",
  "headcount": 9,
  "hours": { "regular": "68.50", "overtime": "6.00", "total": "74.50" }
}
```

Money and hours are **decimal strings**, never JSON numbers — the same rule
`Decimal(18,4)` enforces inside Cwork, for the same reason.

## Decisions, settled 2026-09-25

| | |
|---|---|
| `LABOUR_MIN_GROUP` | **5**, with the next-smallest group pulled into `UNALLOCATED` when that bucket would come from fewer than two groups. |
| Cost-centre mapping | **Explicit**, held in Cwork, unmapped cost centres reported. |
| Delivery | **Outbox events plus replay by period.** |
| Restatement | **Revisions**, as above. The consumer is idempotent on `(period, revision)` and computes the difference itself. |

Nothing here is urgent: the consuming ERP feature is Enterprise-edition work
scheduled after ERP v1, so no consumer is waiting.
