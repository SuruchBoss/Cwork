# Security

An HRIS holds national ID numbers, bank accounts, salaries and medical leave. It
is a high-value target with no upside for the people whose data it holds. This
document describes what the system does, and — just as important — what it does
not do, so you can decide what else your deployment needs.

## Authentication

**Passwords** are hashed with Argon2id at OWASP's recommended parameters
(19 MiB memory, t=2, p=1). The policy follows NIST SP 800-63B: length is what
matters, plus a block-list of obviously guessable values. There is deliberately
no forced character-class rotation — it pushes people toward `Password1!` and
quarterly increments.

**Login** is rate-limited to 10 attempts per minute per IP, and an account locks
for 15 minutes after 5 failed attempts. A login for an unknown email still
performs a hash, so response timing does not reveal which addresses are
registered.

**Tokens.** Access tokens are 15-minute HS256 JWTs. Refresh tokens are 30 days
and rotate on every use:

- Only the SHA-256 hash of a refresh token is stored. The raw token exists only
  in the client.
- Presenting a token that has already been rotated means it leaked. The entire
  token family is revoked and the user must sign in again.
- Both clients collapse concurrent 401s into a single refresh, so parallel
  requests cannot trip that detection by racing each other.

**Session invalidation.** `User.sessionsValidFrom` is bumped on password change
and forced logout; any access token issued before that instant is rejected
immediately, without waiting for it to expire.

**Permissions are read from the database, not the token.** Revoking a role takes
effect within 30 seconds (a small in-process cache) rather than when the access
token expires.

## Authorisation

Permissions are strings (`leave:approve`, `employee:read:sensitive`). Roles are
named bundles of them, so a customer can build a role without a code change.

- `JwtAuthGuard` is global: a route is authenticated unless it declares
  `@Public()`. Forgetting a guard fails closed.
- `PermissionsGuard` enforces `@RequirePermissions(...)` / `@RequireAnyPermission(...)`.
- Row-level scope is a composable Prisma filter (`employeeVisibilityFilter`)
  applied to every employee query. Precedence, widest first: `employee:read`
  (whole org, or scoped departments) → `employee:read:team` (direct reports plus
  self) → `employee:read:self`. An unknown principal matches nothing, not
  everything.

Verified end to end: an employee sees 1 record, their manager 3, HR all 8.

**Separation of duties on payroll.** Whoever prepares a payroll run cannot
approve it. The API rejects self-approval with `SELF_APPROVAL_NOT_ALLOWED`.

## Data protection

**Encrypted at rest, in the application.** National IDs, passport numbers, tax
IDs, social security numbers, bank account numbers and MFA secrets are encrypted
with AES-256-GCM before they reach the database, using a key that lives outside
it (`FIELD_ENCRYPTION_KEY`). Database access alone does not yield them.

Each value carries a random IV and a version prefix (`v1:iv:tag:ciphertext`) so
a future key rotation can decrypt old values while writing new ones.

> **Back up `FIELD_ENCRYPTION_KEY` separately from the database.** Losing it
> makes those columns permanently unreadable. Storing it *with* the database
> backup defeats the point.

**Decryption is a separate privilege.** Reading an employee's decrypted
identifiers requires `employee:read:sensitive`, and every such read is written
to the audit log with the actor and the record. A masked form
(`•••• 1234`) is available without it.

**Salary disclosure is opt-in per document.** A document request only includes
pay when it explicitly asks for it, and that choice is recorded on the request.

## Audit trail

Every mutating endpoint annotated with `@Audited` writes actor, action, entity,
field-level diff, IP, user agent and request id. Sensitive fields are redacted
before the diff is stored.

The trail is **append-only at the database level**: a trigger raises an
exception on `UPDATE` or `DELETE` against `audit_logs`. A compromised
application account can add entries but cannot rewrite history. The same trigger
protects `attendance_punches` — corrections add new punches rather than editing
old ones.

```
marma_hris=> UPDATE audit_logs SET summary='tampered' WHERE ...;
ERROR:  audit_logs is append-only (attempted UPDATE)
```

AI assistant tool calls are audited too, with their arguments, under the
`AI_TOOL_CALL` action.

## Input handling

- `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so a
  payload carrying an unexpected field is rejected rather than silently
  ignored. Mass assignment of `role` or `organizationId` is not possible.
- All queries go through Prisma's parameterised client. The handful of
  `$queryRaw` calls use tagged templates, which parameterise too.
- Sort fields are matched against an allow-list; a client string is never
  interpolated into an `ORDER BY`.
- Uploads are checked against a MIME allow-list, an extension match **and**
  magic bytes, so a renamed executable is rejected. Downloads are served
  `Content-Disposition: attachment` with `X-Content-Type-Options: nosniff`.
- Storage paths are resolved and verified to stay inside the storage root.

## Transport and headers

- `helmet` with HSTS in production.
- CORS lists exact origins. The API **refuses to start** in production if
  `CORS_ORIGINS` is empty or contains a wildcard.
- The web console ships a strict CSP (no third-party scripts) via nginx.
- The mobile app disables cleartext traffic on Android.
- `trust proxy` is set to one hop, so `req.ip` is the real client behind a load
  balancer without trusting arbitrary `X-Forwarded-For` chains.

## Fail-fast configuration

The API validates its entire environment on boot and refuses to start on:

- a JWT secret under 32 characters, or the two secrets being equal;
- a secret still containing the placeholder from `.env.example`;
- `CORS_ORIGINS` empty or wildcarded, in production;
- `FIELD_ENCRYPTION_KEY` that does not decode to exactly 32 bytes;
- `ASSISTANT_ENABLED=true` with no provider key.

A misconfigured deploy fails loudly rather than running insecurely.

## AI assistant

The assistant is the newest attack surface, so it is the most constrained:

- **It never queries the database.** It calls tools, and no tool accepts an
  employee id — every one resolves the subject from the authenticated principal.
  There is no parameter a prompt injection could set to read someone else's
  record. The blast radius of a fully compromised model is bounded by what that
  user could already see.
- **It cannot approve anything**, change salary, or edit employee data.
- **Write actions require confirmation.** Filing leave or requesting a document
  needs `confirmed: true`, and the prompt requires an explicit yes from the human
  first. Both are flagged `createdViaAssistant` so HR can see the provenance.
- **Policy answers must cite the knowledge base.** The prompt instructs the model
  to say it cannot find something rather than invent policy.
- **Crisis and harassment topics never reach the model.** They are screened
  before the call and answered with a fixed referral to a human and a helpline.
- **Per-user daily message and token caps** bound both cost and abuse.
- Replies are passed through a redactor that masks national IDs and bank
  accounts as defence in depth.

It is also entirely optional: `ASSISTANT_ENABLED=false` is the default, and the
rest of the HRIS works unchanged.

## What this does *not* do

Be clear-eyed about the gaps before you deploy:

| Gap | What to do |
|---|---|
| **No MFA enforcement.** The schema has the fields; the flow is not built. | Put the console behind an SSO/IdP that enforces MFA. |
| **No malware scanning.** Uploads are type-checked, not scanned. | Run ClamAV or equivalent over the bucket; `FileObject.scanStatus` exists for it. |
| **No database-level encryption at rest.** Only specific columns are encrypted. | Enable encryption on your volume or managed database. |
| **No PII purge for employees.** Candidate records have PDPA retention; employees do not. | Employee records are usually retained by law; check your jurisdiction. |
| **Rate limiting is per-instance.** In-memory. | Point `@nestjs/throttler` at a shared store for multiple replicas. |
| **No penetration test.** This code has not been audited. | Get one before handling real payroll. |

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md). Please do not open a public issue for a
security bug.
