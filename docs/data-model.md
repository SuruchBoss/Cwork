# Data model

PostgreSQL 16. Schema in [`backend/prisma/schema/`](../backend/prisma/schema),
split by domain.

## Conventions

- **UUIDv4 primary keys.** Sequential ids leak volume and enable enumeration.
- **`organizationId` on every tenant-owned table**, filtered explicitly in every
  query (see [ADR-0003](./adr/0003-explicit-tenant-scoping.md)).
- **Money is `Decimal(18,4)`**, never float. Currency lives on the organisation.
- **Calendar values are `@db.Date`**; instants are `timestamptz` in UTC.
  Work dates, leave dates and payroll periods mean a *day*, not an instant, so
  they must never shift with a timezone.
- **`deletedAt` for soft deletes**, so payslips and org charts stay readable
  after someone leaves.

## Domains

| File | Owns |
|---|---|
| `organization.prisma` | Organization, Department, Position, WorkLocation, Holiday |
| `identity.prisma` | User, Role, UserRole, Session, AuditLog, FileObject, Notification, OutboxEvent |
| `employee.prisma` | Employee, contacts, dependents, documents, EmploymentEvent, resignation, offboarding |
| `leave.prisma` | LeaveType, LeaveEntitlement, LeaveRequest, LeaveRequestDay, adjustments |
| `attendance.prisma` | Shift, WorkSchedule, AttendancePunch, AttendanceRecord, corrections, OvertimeRequest |
| `payroll.prisma` | PayComponent, EmployeeCompensation, PayrollPeriod/Run, Payslip, tax profile, benefits, expenses |
| `recruitment.prisma` | Requisition, Posting, Candidate, Application, assessments, interviews, offers |
| `performance.prisma` | ReviewCycle, KpiGoal, KpiCheckIn, PerformanceReview |
| `workflow.prisma` | ApprovalPolicy/Instance/Task, DocumentRequest |
| `assistant.prisma` | Conversations, messages, KnowledgeDocument, KnowledgeChunk |

## Patterns worth understanding

### User and Employee are separate

A `User` is a login; an `Employee` is an HR record. They are separate because:

- recruiters, auditors and integrations need access without being on payroll;
- an employee record must survive long after its login is disabled — payslips,
  audit history and org charts all still reference it.

`Employee.userId` is nullable and unique.

### Effective-dated compensation

`EmployeeCompensation` is append-only. A raise inserts a new row and closes the
previous one (`effectiveTo = day before`). Payroll selects the row covering the
period, so a payslip from eight months ago recomputes from the salary that
actually applied then.

A CHECK constraint prevents `effectiveTo < effectiveFrom`.

### Punch stream → derived daily record

`AttendancePunch` is an append-only event log. `AttendanceRecord` is a pure
reduction over it. A correction writes new `MANUAL` punches and the day is
recomputed — history is never rewritten.

A database trigger blocks `UPDATE` and `DELETE` on `attendance_punches`, so a
compromised application account cannot edit the stream.

`clientPunchId` is unique per employee, which is what makes the mobile app's
offline retry idempotent.

### Leave: reservation ledger

`LeaveEntitlement` is a ledger per employee / leave type / year:

```
available = opening + granted + carriedOver + adjusted − used − pending − expired
```

`pending` is the important column. Submitting a request moves days into
`pending` immediately, so a second request cannot spend days the first has
already claimed. Approval moves `pending → used`; rejection releases it.

`LeaveRequestDay` explodes a request into the individual dates it charges, with
a `dayValue` of 1 or 0.5. Attendance and payroll read those rows rather than
re-deriving ranges, so half-days and holiday exclusions stay consistent
everywhere.

### Approval engine

One generic engine for leave, overtime, expenses, resignation, requisitions and
document requests.

`ApprovalPolicy` declares steps; `ApprovalInstance` is one running approval;
`ApprovalTask` is one approver's decision. A policy is chosen by the highest
`priority` whose `conditions` JSON matches the submitted entity.

`ApprovalInstance.snapshot` stores the entity as submitted — what the approver
actually saw, not what the record says today.

### Payslip snapshots

`Payslip.snapshot` freezes the compensation record, working days, payable days,
tax allowances and overtime lines used for the calculation. A disputed payslip
from a year ago can be recomputed and explained without reconstructing history.

The arithmetic is enforced in the database:

```sql
CHECK ("netPay" = "grossEarnings" - "totalDeductions")
```

### Knowledge chunks

`KnowledgeDocument` holds the policy text; `KnowledgeChunk` holds retrieval-sized
pieces with an optional pgvector `embedding`.

Prisma cannot type a `vector` column, so similarity search runs through
`$queryRaw`. Lexical search — the default path — uses expression indexes over
`to_tsvector` and `pg_trgm`, computed inline in the query, so a missing index
degrades to a sequential scan rather than breaking search.

## Hand-written database objects

These live in `prisma/migrations/*_search_and_integrity/migration.sql` because
Prisma's schema language cannot express them:

**Indexes** — GIN full-text and trigram over knowledge chunks, trigram over
employee names, HNSW/IVFFlat over embeddings, partial indexes on pending
approval tasks and unprocessed outbox events.

**CHECK constraints** — leave date ordering, overtime interval, payslip balance,
compensation effective dating, review cycle weights totalling 100.

**Triggers** — append-only enforcement on `audit_logs` and `attendance_punches`.

> `prisma migrate dev` will try to drop all of these as drift. Use
> `--create-only`, review the generated migration, and run `npm run db:verify`.
> See [operations.md](./operations.md#migrations-and-the-drift-trap).

## Entity relationships (abbreviated)

```
Organization ─┬─ Department ──── Position
              ├─ WorkLocation ── Holiday
              ├─ Role ───────── UserRole ──── User ──── Employee
              └─ Employee ─┬─ EmploymentEvent
                           ├─ EmployeeCompensation  (effective-dated)
                           ├─ LeaveEntitlement ─── LeaveRequest ─── LeaveRequestDay
                           ├─ AttendancePunch ──→  AttendanceRecord  (derived)
                           ├─ OvertimeRequest
                           ├─ Payslip ──────────── PayslipItem
                           ├─ KpiGoal ──────────── KpiCheckIn
                           └─ ResignationRequest ─ OffboardingTask
                                                 └─ ExitInterview

ApprovalInstance ──── ApprovalTask        (1:1 with the entity it approves)
       │
       └── ApprovalPolicy ──── ApprovalPolicyStep

JobPosting ──── Application ─┬─ AssessmentInvitation ─── AssessmentAnswer
                             ├─ Interview ───────────── InterviewScorecard
                             └─ JobOffer ────────────→  Employee  (on hire)
```
