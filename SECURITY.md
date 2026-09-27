# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security bug.**

Report it privately through
[GitHub's private vulnerability reporting](https://github.com/SuruchBoss/Cwork/security/advisories/new)
(Security → Report a vulnerability).

Useful things to include:

- what the issue is and why it matters;
- steps to reproduce, or a proof of concept;
- affected version or commit;
- any suggested fix.

We aim to acknowledge within 3 working days and to have an assessment within 10.
If you would like credit in the advisory, say so.

Please give us reasonable time to ship a fix before disclosing publicly.

## Supported versions

Cwork is pre-1.0, and during 0.x **only the latest release receives security
fixes**:

| Version | Security fixes |
|---|---|
| The latest [release](https://github.com/SuruchBoss/Cwork/releases) | Yes |
| Any earlier release | No: upgrade to the latest |

A fix lands on `main` and is released as soon as it is ready, as the next
version after the latest. There are no backports to older versions and no
long-term support branch until 1.0 (see
[Versioning](./README.md#versioning)); the next version carries whatever else
`main` holds by then, and the changelog says what that is. The advisory names
the affected versions and the one that fixes them, as
[GHSA-3cgw-73cr-r8c6](https://github.com/SuruchBoss/Cwork/security/advisories/GHSA-3cgw-73cr-r8c6)
did: 0.1.0 to 0.3.0 affected, fixed in 0.3.1.

## Scope

In scope: the API, the admin console, the mobile app, the database schema, the
default Docker configuration, and the public demo's code
([`backend/src/modules/demo`](./backend/src/modules/demo)).

A problem that needs one of Cwork's own roles to reach — HR, payroll, an
administrator — is still a security problem, not an ordinary bug: it is rated
as needing a signed-in user, however senior the role (ADR-0022, decision 4).
Cwork has exactly those roles.

Out of scope: vulnerabilities in third-party dependencies (report those
upstream), issues that require a compromised host or physical device access,
anything that only affects a deliberately-documented gap below, and what the
public demo does on purpose — signing visitors in without a password and
putting its data back every hour ([docs/demo.md](./docs/demo.md)). A way out of
the demo — into a database it did not create, or past its refusals — is in
scope.

## Across the ecosystem

Cwork is one of four projects that report vulnerabilities the same way:

| Project | Private channel |
|---|---|
| Cwork | [Report a vulnerability](https://github.com/SuruchBoss/Cwork/security/advisories/new) |
| PaynEat-ERP | [Report a vulnerability](https://github.com/SuruchBoss/PaynEat-ERP/security/advisories/new) |
| PaynEat | [Report a vulnerability](https://github.com/SuruchBoss/PaynEat/security/advisories/new) |
| ExcelToGo | [Report a vulnerability](https://github.com/SuruchBoss/ExcelToGo/security/advisories/new) |

The rule they share is
[ADR-0022](https://github.com/SuruchBoss/PaynEat-ERP/blob/main/docs/adr/0022-vulnerability-disclosure-across-the-ecosystem.md),
kept in PaynEat-ERP; Cwork adopted it on 2026-09-27. What it means here:

- **A problem found in another project goes to that project,** privately,
  through its own channel above — never to a Cwork issue, commit or changelog.
- **Cwork names another project's weakness only by its fixed version and its
  advisory, and only once that advisory is published.**
- **Code adapted from one project into another is checked in each of them.**
  The owner of every project that adapted it is told privately and checks their
  own copy. No advisory is published until each of those projects has a fixed
  release, or its owner has said it is not affected.

ADR-0022 is the rule itself; where this summary and it differ, the ADR is right.

## Known gaps

These are documented rather than hidden. They are not accepted reports, but they
are things you should know before deploying:

| Gap | Mitigation |
|---|---|
| Malware scanning is off by default: it needs a clamd, and without one uploads are recorded as `SKIPPED` and served unscanned | `docker compose --profile av up -d clamav`, then `MALWARE_SCAN_ENABLED=true`. The API says which mode it is in at every boot |
| Only specific columns are encrypted at rest | Enable volume or managed-database encryption |
| `organizationId` is not a tenant boundary: nothing tests two organisations sharing a database | Run one deployment per organisation |
| This code has not been penetration tested | Get an assessment before handling real payroll |

Full detail, and the gaps that are not about security: [docs/security.md](./docs/security.md#what-this-does-not-do).

## What the system does protect

Argon2id password hashing · a TOTP second factor, required for every role that
can read national IDs, run or approve payroll, or grant permissions · for such
an account, a session issued only in answer to a code verified in the same
request (the public demo's one-click sign-in is the one path without one, and
exists only in the demo) · refresh-token rotation with reuse detection · account
lockout, and rate limits that replicas can share (`THROTTLE_STORAGE=postgres`) ·
AES-256-GCM field encryption for national IDs, bank accounts and MFA secrets ·
permission-based RBAC with row-level scoping · uploads checked by type,
extension and magic bytes, and scanned by ClamAV when it is switched on · an
audit trail that is append-only at the database level · fail-fast configuration
validation that refuses to boot on weak secrets or a wildcard CORS origin in
production.
