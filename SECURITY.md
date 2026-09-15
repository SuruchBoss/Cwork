# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security bug.**

Report it privately through
[GitHub's private vulnerability reporting](https://github.com/suruchboss/marmaai/security/advisories/new)
(Security → Report a vulnerability).

Useful things to include:

- what the issue is and why it matters;
- steps to reproduce, or a proof of concept;
- affected version or commit;
- any suggested fix.

We aim to acknowledge within 3 working days and to have an assessment within 10.
If you would like credit in the advisory, say so.

Please give us reasonable time to ship a fix before disclosing publicly.

## Scope

In scope: the API, the admin console, the mobile app, the database schema, the
default Docker configuration.

Out of scope: vulnerabilities in third-party dependencies (report those
upstream), issues that require a compromised host or physical device access, and
anything that only affects a deliberately-documented gap below.

## Known gaps

These are documented rather than hidden. They are not accepted reports, but they
are things you should know before deploying:

| Gap | Mitigation |
|---|---|
| No MFA enforcement (the schema has the fields; the flow is not built) | Put the console behind an SSO/IdP that enforces MFA |
| No malware scanning on uploads (type-checked only) | Run a scanner over the storage bucket; `FileObject.scanStatus` exists for it |
| Rate limiting is per-instance | Use a shared store for multiple replicas |
| Only specific columns are encrypted at rest | Enable volume or managed-database encryption |
| This code has not been penetration tested | Get an assessment before handling real payroll |

Full detail: [docs/security.md](./docs/security.md).

## What the system does protect

Argon2id password hashing · refresh-token rotation with reuse detection ·
AES-256-GCM field encryption for national IDs, bank accounts and MFA secrets ·
permission-based RBAC with row-level scoping · an audit trail that is
append-only at the database level · fail-fast configuration validation that
refuses to boot on weak secrets or a wildcard CORS origin in production.

## Supported versions

The project is pre-1.0. Security fixes land on `main`. Once there is a tagged
release, this table will list supported versions.
