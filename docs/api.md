# API reference

Base URL: `/api/v1`. Interactive docs (non-production): `/api/docs`.

All endpoints require `Authorization: Bearer <accessToken>` unless marked
**public**.

## Conventions

**Errors** always have the same shape. Branch on `code`, never on `message` —
messages are Thai prose meant for humans and will change.

```json
{
  "statusCode": 422,
  "code": "INSUFFICIENT_LEAVE_BALANCE",
  "message": "Not enough ลาพักร้อน: 2.0 days available, 3.0 requested",
  "details": { "available": 2, "requested": 3 },
  "path": "/api/v1/leave/requests",
  "requestId": "7c59…",
  "timestamp": "2026-09-15T03:44:16.527Z"
}
```

`requestId` is echoed in the `x-request-id` response header and appears in the
server logs and audit trail — quote it in a bug report.

**Pagination** is `?page=&limit=` and returns `{ data, meta }`:

```json
{ "data": [], "meta": { "page": 1, "limit": 25, "total": 8, "totalPages": 1, "hasNext": false } }
```

**Decimals are strings** (`"42900.00"`), to avoid float drift in transit. Parse
to display; never compute on the client.

**Dates**: calendar values are `yyyy-MM-dd`; instants are ISO-8601 UTC.

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | **public**, 10/min |
| POST | `/auth/refresh` | **public**, rotates the token |
| POST | `/auth/logout` | omit the body to revoke every session |
| GET | `/auth/me` | current user, roles, effective permissions |
| POST | `/auth/change-password` | signs out every other device |
| GET | `/auth/sessions` | active sessions for this user |
| DELETE | `/auth/sessions/:id` | revoke one |

## Employees

| Method | Path | Permission |
|---|---|---|
| GET | `/employees` | `employee:read` / `:team` / `:self` |
| GET | `/employees/me` | `employee:read:self` |
| PATCH | `/employees/me` | `employee:update:self` (contact details only) |
| GET | `/employees/me/team` | `employee:read:team` |
| GET | `/employees/:id` | scoped by visibility |
| GET | `/employees/:id/employment-events` | `employee:read` |
| POST | `/employees` | `employee:create` |
| PATCH | `/employees/:id` | `employee:update` |
| DELETE | `/employees/:id` | `employee:delete` (soft, disables login) |

Decrypted national ID and bank details require `employee:read:sensitive`, and
that read is audited. Without it you get `nationalIdMasked`.

## Leave

| Method | Path | Notes |
|---|---|---|
| GET | `/leave/types` | |
| POST/PATCH | `/leave/types[/:id]` | `leave:type:manage` |
| GET | `/leave/balances/me` | |
| GET | `/leave/balances/:employeeId` | `leave:read` / `:team` |
| POST | `/leave/balances/adjust` | `leave:balance:adjust`, requires a reason |
| POST | `/leave/balances/rollover/:year` | year-end carry-over |
| **POST** | **`/leave/requests/preview`** | cost before submitting — see below |
| POST | `/leave/requests` | |
| GET | `/leave/requests` | scoped |
| GET | `/leave/requests/:id` | includes the approval trail |
| POST | `/leave/requests/:id/submit` | submit a draft |
| POST | `/leave/requests/:id/cancel` | returns the days |
| GET | `/leave/calendar?from=&to=` | who is away |

`preview` is the one to know. It runs the same calculation the real submission
does, so the employee sees exactly which days are charged before committing:

```jsonc
// POST /leave/requests/preview  { leaveTypeId, startDate: "2026-04-13", endDate: "2026-04-17" }
{
  "totalDays": 2,                                   // Songkran: 3 of the 5 days are holidays
  "days": [{ "date": "2026-04-16", "dayValue": 1 }, { "date": "2026-04-17", "dayValue": 1 }],
  "balanceBefore": 8, "balanceAfter": 6,
  "warnings": []
}
```

Error codes: `INSUFFICIENT_LEAVE_BALANCE`, `OVERLAPPING_LEAVE`,
`LEAVE_NOTICE_TOO_SHORT`, `LEAVE_ATTACHMENT_REQUIRED`, `NO_WORKING_DAYS_SELECTED`.

## Attendance

| Method | Path | Notes |
|---|---|---|
| POST | `/attendance/punch` | any punch type |
| POST | `/attendance/clock-in` · `/clock-out` | shorthands |
| GET | `/attendance/today` | |
| GET | `/attendance/days/:date` | |
| GET | `/attendance/records` | scoped; `anomaliesOnly=true` |
| GET | `/attendance/summary/me?year=&month=` | |
| POST | `/attendance/corrections` | |
| POST | `/attendance/corrections/:id/decide` | `attendance:manage` |

**Send `clientPunchId`.** It makes retries safe: a replay of the same id returns
the original result instead of creating a second punch. This is what lets the
mobile app queue punches offline.

```jsonc
// POST /attendance/punch
{
  "type": "CLOCK_IN", "method": "MOBILE_GPS",
  "latitude": 13.7212, "longitude": 100.5286, "accuracyM": 12,
  "clientPunchId": "p-mf3k2a",          // idempotency key
  "clientTime": "2026-09-15T02:00:00Z"  // compared with server time to detect drift
}
```

A punch outside the geofence is **accepted and flagged**, not rejected — an
employee must be able to prove they turned up. Flags: `OUTSIDE_GEOFENCE`,
`MOCK_LOCATION`, `ROOTED_DEVICE`, `NO_LOCATION`, `LOW_GPS_ACCURACY`,
`CLOCK_DRIFT`, `IMPOSSIBLE_TRAVEL`.

Error codes: `ALREADY_CLOCKED_IN`, `NOT_CLOCKED_IN`, `DUPLICATE_PUNCH`,
`ATTENDANCE_LOCKED`.

## Overtime, expenses, documents

| Method | Path |
|---|---|
| POST/GET | `/overtime/requests` |
| POST | `/overtime/requests/:id/decide` · `/cancel` |
| POST/GET | `/expenses/claims` |
| POST | `/expenses/claims/:id/decide` · `/cancel` |
| POST/GET | `/documents/requests` |
| GET | `/documents/requests/:id/certificate-data` |
| POST | `/documents/requests/:id/issue` · `/reject` |

## Payroll

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/payroll/periods` | `payroll:read` / `payroll:run` |
| PATCH | `/payroll/periods/:id/lock` | `payroll:run` |
| GET/POST | `/payroll/runs` | |
| POST | `/payroll/runs/:id/calculate` | `payroll:run` |
| POST | `/payroll/runs/:id/approve` | `payroll:approve` |
| POST | `/payroll/runs/:id/pay` | publishes payslips, locks attendance |
| GET | `/payroll/payslips/me` · `/:id` | |
| POST | `/payroll/compensation` | `compensation:manage` |
| POST | `/payroll/tax-profile` | own, or `compensation:manage` |

**Separation of duties:** the account that calculated a run cannot approve it —
`SELF_APPROVAL_NOT_ALLOWED`.

Lifecycle: `DRAFT → CALCULATED → APPROVED → PAID`. Marking a run paid publishes
its payslips, consumes the overtime and expense claims it paid, and locks the
attendance days it was based on.

## Approvals

| Method | Path |
|---|---|
| GET | `/approvals/tasks?status=PENDING` |
| POST | `/approvals/tasks/:id/decide` |
| GET | `/approvals/instances/:entityType/:entityId` |
| GET/POST | `/approvals/policies` |

A policy routes one entity type, selected by the highest `priority` whose
`conditions` match:

```jsonc
{
  "entityType": "LEAVE_REQUEST",
  "name": "Leave over 2 days — manager then HR",
  "conditions": { "totalDays": { "gt": 2 } },
  "priority": 20,
  "steps": [
    { "orderIndex": 0, "approverType": "LINE_MANAGER", "levelsUp": 1, "slaHours": 48 },
    { "orderIndex": 1, "approverType": "ROLE", "roleId": "…" }
  ]
}
```

If no policy matches, or every resolved approver is the submitter, the request
is auto-approved — a chain that resolves to nobody must not park a request in
limbo.

## Recruitment

Authenticated: `/recruitment/requisitions`, `/postings`, `/applications`,
`/assessment-templates`, `/assessments/invite`, `/interviews`, `/offers`,
`/offers/:id/convert` (creates the employee record).

**Public** (rate-limited, no auth):

| Method | Path | Limit |
|---|---|---|
| GET | `/careers/:orgCode/jobs` | 60/min |
| GET | `/careers/:orgCode/jobs/:slug` | 60/min |
| POST | `/careers/:orgCode/jobs/:slug/apply` | 5/hour |
| GET | `/careers/assessments/:token` | 20/min |
| POST | `/careers/assessments/submit` | 10/min |

Applying requires `consent: true` (PDPA); consent is timestamped with a
retention deadline, after which a scheduled job scrubs the PII.

The assessment token is single-use and only its SHA-256 hash is stored. Correct
answers are never serialised to the candidate, and the time limit is enforced
server-side, so a tampered client clock cannot extend it.

## Assistant

| Method | Path |
|---|---|
| GET | `/assistant/status` |
| POST | `/assistant/chat` (20/min) |
| GET | `/assistant/conversations[/:id]` |
| POST | `/assistant/messages/:id/feedback` |
| GET | `/assistant/flagged` |
| CRUD | `/assistant/knowledge` |
| GET | `/assistant/knowledge/search?q=` |

## Health

`/health/live` and `/health/ready` — outside the API prefix and version-neutral,
so orchestrator probes point at a path that never moves.
