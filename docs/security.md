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

### Multi-factor authentication

TOTP (RFC 6238), implemented in `modules/auth/domain/totp.ts` and verified
against the RFC's published test vectors, so it interoperates with any
authenticator app.

- **Required, not offered,** for any account holding `employee:read:sensitive`,
  `payroll:run`, `payroll:approve` or `role:manage`. Between them those
  permissions read every national ID in the organisation, move money, and hand
  out permissions. An organisation can also require it of everyone through
  `settings.security.requireMfa`.
- A correct password for such an account yields a **challenge token**, not a
  session. That token carries a `typ` claim the access-token strategy rejects,
  so it opens the MFA endpoints and nothing else — it is signed with the same
  secret, issuer and audience as an access token, and that claim is the only
  thing separating them.
- An account that is required to have a second factor but has not enrolled gets
  a challenge too, and must enrol before it can do anything.
- The secret is stored AES-256-GCM encrypted and is returned in the clear
  exactly once, during enrolment. It does not become active until a code proves
  the user actually scanned it.
- **A code cannot be spent twice.** `mfaLastUsedStep` records the newest step
  accepted, so a code observed in flight — a phishing proxy, a shoulder — is
  useless even while it is still inside its 90-second window.
- Recovery codes are 100-bit random, stored as SHA-256 digests, and removed as
  they are spent. A slow KDF would add nothing at that entropy and would only
  give a half-authenticated endpoint a way to burn CPU.
- A wrong code counts towards the same lockout a wrong password does.
- Turning it off requires a current code, and is refused outright for an account
  that is required to have one.

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
cwork=> UPDATE audit_logs SET summary='tampered' WHERE ...;
ERROR:  audit_logs is append-only (attempted UPDATE)
```

AI assistant tool calls are audited too, with their arguments, under the
`AI_TOOL_CALL` action.

### Uploads

Uploads are checked three ways before they are kept: the MIME type against an
allow-list, the extension against that type, and the leading bytes against the
type's magic number — so a `.exe` renamed to `.pdf` is refused. There is a 20 MB
ceiling and archives are not accepted at all.

On top of that, **the bytes are streamed to clamd before anything is written to
storage**, so a file that turns out to be malware was never stored anywhere for
a later change to expose. See `MalwareScannerService`.

The rule that matters: **a scanner that is not working is never a pass.**
Unreachable, timed out, or a reply we cannot parse all land the file at
`PENDING`, which is recorded but refused on download; an hourly sweep retries
it. The only way a file is served unscanned is when scanning is deliberately
switched off — and the API says so, at `WARN`, at every boot.

A detection is refused at upload with the signature named, recorded in the audit
trail, and notified to the uploader. Quarantine is destruction: the row and the
signature survive, the bytes do not. Keeping malware on disk to look at later is
not a decision an HRIS should make on its owner's behalf.

**Before any of that, there is the parser.** Three of the four multer
advisories cleared in September 2026 were denial of service, and two of those
needed only a crafted *field name* — no file at all. So the endpoint declares
its whole contract as parser limits: one part, named `file`, 20 MB, and **zero
text fields**. Anything else is refused with a 400 before a byte is read. That
last limit is the one doing the work: a field-name attack needs a text part to
put the name on.

Multer errors are mapped to HTTP status by *code*, not by message — Nest's own
mapping matches message text, and a multer release that reworded one turned
every such request into a 500. See `AllExceptionsFilter`.

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
| **Malware scanning is off by default.** It works, but needs a clamd. | `docker compose --profile av up -d clamav`, then `MALWARE_SCAN_ENABLED=true`. The API logs which mode it is in at every boot. |
| **No database-level encryption at rest.** Only specific columns are encrypted. | Enable encryption on your volume or managed database. |
| **No PII purge for employees.** Candidate records have PDPA retention; employees do not. | Employee records are usually retained by law; check your jurisdiction. |
| **No penetration test.** This code has not been audited. | Get one before handling real payroll. |

### Rate limiting

Two separate mechanisms, worth not confusing:

- **The account lockout** is per account and lives in the database
  (`users.failedLoginCount`, `users.lockedUntil`). It has always been shared
  across instances: the sixth wrong password locks the account whichever replica
  saw it.
- **The request budget** is per client address, through `@nestjs/throttler`, and
  is what catches a caller no single lockout would notice — one wrong password
  each against a hundred different accounts. The credential endpoints get their
  own tighter budget (`AUTH_THROTTLE_LIMIT`, default 10/minute).

The budget is in-process by default, which is correct for one instance and
quietly wrong for several: N replicas hand out N times the budget, and a restart
forgets every counter. `THROTTLE_STORAGE=postgres` shares the counters through
the database. The API states which one is in use at every boot.

If the store cannot be reached, the limiter **fails open** and logs an error. A
rate limiter is not worth locking everybody out of a healthy system for, and a
database that is unreachable is already a louder problem than this one.

## Dependencies

`npm audit --omit=dev` must report nothing high or critical, in the backend and
in the web console. CI enforces it on every push **and weekly on a schedule**,
because an advisory is published against code that has not changed — a gate that
only runs on commits reports the problem whenever someone next happens to push.

Dev-only advisories are deliberately not part of that gate. A build-tool
advisory is worth knowing about and is not a reason to block a release, and a
gate that cries wolf is a gate somebody eventually mutes.

When a transitive dependency is fixed upstream but its parent has not picked the
fix up yet, the fixed version is pinned with an npm `overrides` entry rather than
by taking a major framework upgrade for a security patch. That is what
`backend/package.json` does for `multer` and `deepmerge-ts` today. An override is
a claim that the new version is compatible, so it comes with the tests that
prove it — `test/upload-limits.e2e-spec.ts` exists because the multer override
did in fact change behaviour on the way in.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md). Please do not open a public issue for a
security bug.
