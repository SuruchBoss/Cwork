# The public demo — runbook

A hosted Cwork that anyone can try without installing anything: pick
employee, manager or HR, and every page works for real on a fictional company.
It lives on Render's free tier, and it is rebuilt from this repository alone —
this page, [`render.yaml`](../render.yaml) and
[`deploy/demo/Dockerfile`](../deploy/demo/Dockerfile) are everything anyone needs.
CW-031 in the backlog is the ticket it answers.

- **Address:** `https://cwork-demo.onrender.com` — see [If Render gives it a
  different address](#if-render-gives-it-a-different-address).
- **What opens it:** the landing page's first button, “ลองใช้ทันที” / “Try it now”,
  which goes to `/login?as=hr&lang=th` (or `lang=en`) and signs the visitor in as
  HR.

## What it is

One Docker web service and one Postgres database, both on Render's free plan.

- **One service, not two.** The API serves the console itself
  (`CONSOLE_DIR`, `src/core/http/serve-console.ts`): the free tier has no private
  network for a separate console to reach the API over, and one service uses
  half the instance hours two would.
- **`DEMO_MODE=true`** adds the demo module (`backend/src/modules/demo`). On any
  other deployment it is not loaded at all — no routes, no schedule, no code
  that could empty a table.
- **One-click sign-in** (`POST /api/v1/demo/sign-in`) for three shared accounts:
  `dev1@cwork.example` (employee), `eng.manager@cwork.example` (manager) and
  `hr.manager@cwork.example` (HR). There is no password anybody knows: each reset
  hashes one generated for that reset and throws it away. It is not in the
  repository, in Render's settings or in any log.
- **Resets** put the data back to the demo seed — the same seed as
  `npm run db:seed` — inside the running API:
  - on the hour, every hour, when anything changed (or the seed's “today” is
    yesterday);
  - after ten quiet minutes following a change, so the instance goes to sleep
    clean;
  - at boot, when the database is empty, was changed before the instance
    stopped, or was written with an encryption key that has since changed.

  While a reset runs, every API request is answered `503 DEMO_RESETTING` and the
  console shows one message over the whole screen, then signs the visitor back
  in as the role they had. A banner shows when the next reset is.
- **Off in the demo:** the AI assistant (no budget for visitors' model usage,
  decided 2026-09-25), email and push (`DEMO_MODE` refuses to start with any of
  the three switched on), and file uploads — refused outright, because nothing
  scans them without ClamAV and one visitor's upload would be served to the next.
- **Visitors' addresses are not stored.** Triggers in the `cwork_demo` schema
  blank every `ipAddress` and `userAgent` column before a row is written, so the
  audit trail and the session list never show one visitor another's address.

### Nothing a visitor does locks out the next

| Route | What the demo does |
|---|---|
| Sign in with a password or a code (`/auth/login`, `/auth/mfa/*`) | Refused (`DEMO_SIGN_IN_ONLY`) — so the lockout cannot be tripped by guessing |
| Change a demo account's password or two-factor settings | Refused (`DEMO_SHARED_ACCOUNT`) |
| Revoke another session, or sign out everywhere | Refused (`DEMO_SHARED_ACCOUNT`) — on a shared account the other sessions are other people. Signing yourself out works |
| Deactivate the account (delete the employee, finish their offboarding) | Allowed; the one-click sign-in puts the account and employee record back |
| Change the account's roles | No console route does this today; the one-click sign-in puts back the grants the last reset left, whichever route is added later |
| A lockout that happened anyway | Lifted by the one-click sign-in |

`backend/test/demo.e2e-spec.ts` covers each row, then checks all three
sign-ins still work.

### It will not open a real database

The one variable that turns the demo on is not trusted by itself. The database
has to prove it belongs to the demo: the `cwork_demo` schema, which only the
demo creates, and only on a database with no organisation in it. Pointed at
anything else, it refuses — before the migrations, again before the API boots,
and a third time inside the transaction that truncates — with this message, and
changes nothing:

```
DEMO_MODE is on, but this database holds "<name>" (<code>), which the demo did not create.
…
Point DATABASE_URL at an empty database made for the demo, or set
DEMO_MODE=false to run this database as the installation it is.
```

A database seeded with `npm run db:seed` is refused too: same company, but the
demo did not make it, and it cannot tell that database from somebody's
evaluation install with real edits in it.

## What was found about Render's free tier

render.com could not be reached from the sessions that built this, so each of
these was checked against Render's documentation as search results quote it,
in September 2026. **Confirm the ones marked on the first deploy**, and update
this table if any is wrong.

| The ticket's assumption | Found | What the demo does about it |
|---|---|---|
| Idle services sleep; the first request waits about a minute | True: after 15 minutes without inbound traffic; waking takes up to a minute | The landing page knocks on `/health/live` once as it opens, so the demo is usually awake by the time somebody clicks. No keep-alive |
| Free instance hours are capped | True: 750 per workspace per month | One service: even awake all month it is 744 hours. **Other free services in the same workspace share the 750** |
| Free Postgres expires, one per account | True: 30 days, then 14 days' grace, then deleted | [A runbook step](#when-the-free-database-expires), no code change |
| Cron jobs are not free | True (from $1/month) | The reset runs inside the API on its own schedule. There is no reset endpoint |
| No private network for free services; pre-deploy commands are paid | True | One service; migrations run in the entrypoint, and only when one is pending |
| Render Postgres offers pgvector | True (`CREATE EXTENSION vector`) | The init migration runs unchanged. **Confirm on first deploy** |
| About 512 MB of memory | True: 512 MB and 0.1 CPU. The free database has 0.1 CPU as well | Measured below |

### Measured on a tenth of a CPU and 512 MB

A Linux cgroup set to what the free instance offers (`cpu.cfs_quota_us=10000`
of 100000, `memory.limit_in_bytes=512M`), the database outside it:

| Step | Time | Memory (peak, incl. page cache) |
|---|---|---|
| API boot, production build | 14 s | ~390 MB |
| `prisma migrate deploy`, nothing pending | 16 s | ~350 MB — so the entrypoint checks first and skips it |
| `prisma migrate deploy`, empty database | 24 s | |
| Reset in the running API (truncate + seed + history) | 21 s | ~280 MB |
| The same seed run the old way, through ts-node | 169 s — 67 s of it compiling | 465 MB |
| One-click sign-in | 0.27 s | |
| Restart after a visitor's change, until the console signs them back in | 20.5 s | |

On Render the database has 0.1 CPU too, so expect a reset to take longer than
21 s — the banner and the reset message cover it either way.

### The one-minute acceptance

“Someone with no local setup can approve a leave request within a minute of
opening the link” — the path is: Try it now → signed in as HR → **View as:
Manager** in the banner → Approvals → approve. When the instance is awake that
takes seconds. From asleep, it is Render's wake-up plus the 14 s boot, which is
why the landing page wakes it as it opens.

**Check this on the first deploy**, from a sleeping instance (leave it 20
minutes untouched) and from the landing page. If it does not fit in a minute,
the part that misses is the free tier's wake-up, and what fixes it is an
instance that never sleeps: Render's Starter plan, US$7 a month at the time of
writing. That is the product owner's call — do not add a keep-alive ping; the
ticket rules it out.

## Deploying it from nothing

You need a Render account with access to this GitHub repository. Nothing else.

1. Render dashboard → **New → Blueprint** → pick this repository and the `main`
   branch. Render reads `render.yaml` and proposes `cwork-demo` (web service) and
   `cwork-demo-db` (Postgres), both free, in Singapore.
2. **Apply.** Render creates the database, generates the three secrets, builds
   `deploy/demo/Dockerfile` (several minutes the first time) and starts it.
3. Watch the service's logs. A healthy first boot says, in order:
   `Applying 12 migration(s)` (or however many there are), the Prisma migration
   output, `Cwork API listening`, then `[Demo] Demo data reset (first boot) in …s`.
4. Open the service's address. The sign-in page offers three roles; the banner
   says when the next reset is.
5. Check the address against the landing page's links (below), and run the
   [one-minute check](#the-one-minute-acceptance).

### Redeploying

Auto-deploy is off (`autoDeployTrigger: off`): every push to `main` would
otherwise rebuild the image, and the free build minutes do not stretch that far.
After changes worth showing land on `main`: dashboard → `cwork-demo` → **Manual
Deploy → Deploy latest commit**. The data survives a deploy; the demo resets it
at boot if a visitor had changed anything.

### If Render gives it a different address

Service names are global on `onrender.com`; if `cwork-demo` was taken, Render
adds a suffix. The address appears in three links in `landing/index.html`, each
marked `data-demo`. Change them, run `node landing/build-en.mjs` for the English
page, and push. Nothing else refers to it.

## Where the secrets live

All three are generated by Render (`generateValue: true`) and kept in the
service's environment. Nobody needs to know them:

| Variable | What it is | To rotate |
|---|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Sign sessions | Generate new values in the dashboard. Everyone signed in is signed out, which on the demo costs one click |
| `FIELD_ENCRYPTION_KEY` | Encrypts national IDs and the demo accounts' two-factor secret | Generate a new value (`openssl rand -base64 32` if doing it by hand) and save; the service restarts. The demo remembers a fingerprint of the key it seeded with, sees it changed, and seeds again at boot — the old ciphertext is never shown |
| `DATABASE_URL` | From the database, by Render | Follows the database; see below |

There is no demo password to keep: it is generated inside each reset and
discarded. The privileged demo accounts are enrolled on the published demo
two-factor secret (`DEMO_MFA_SECRET` in the seed), which opens nothing without
that password.

## When the free database expires

Render deletes a free database 30 days after creation, after 14 days' grace.
Only one free database is allowed per workspace, so the old one has to go
before the new one exists. Put a reminder in a calendar at four weeks.

1. Dashboard → `cwork-demo-db` → **Delete Database**. The demo starts refusing
   requests (it cannot reach a database) — expected.
2. Dashboard → the Blueprint → **Manual Sync**. Render recreates `cwork-demo-db`
   from `render.yaml`, and points the web service's `DATABASE_URL` at it.
   (Or: **New → Postgres**, same name, free, Singapore; then set `DATABASE_URL` on
   the service to its internal connection string.)
3. The service restarts on the new `DATABASE_URL`, finds an empty database,
   migrates it and seeds it — the same log lines as a first deploy.

No code changes, and nothing to copy across: everything in the old database was
demo data.

## When something is wrong

| Symptom | Where to look |
|---|---|
| Service will not start; log says `which the demo did not create` | `DATABASE_URL` points at a database that is not the demo's. Nothing was changed in it. Point it back at `cwork-demo-db` |
| Log says `The public demo runs with the assistant, email and push off` | Someone set `ASSISTANT_ENABLED`, `EMAIL_ENABLED` or `PUSH_ENABLED`. Remove it |
| Log says `This entrypoint runs the public demo` | `DEMO_MODE` is missing from the service's environment |
| The reset message never goes away | Log lines `Demo reset (…) failed; trying again in 60s` say why; it retries every minute |
| Sign-in page shows a password form | The console cannot reach `/api/v1/config`, or `DEMO_MODE` is off |
| “Instance hours exhausted” email from Render | Another free service in the workspace is using the shared 750 hours |

## Running it locally

The same image, against any empty Postgres:

```bash
docker build -f deploy/demo/Dockerfile -t cwork-demo .
docker run --rm -p 3000:3000 \
  -e DEMO_MODE=true -e CORS_ORIGINS=http://localhost:3000 \
  -e DATABASE_URL=postgresql://…/an_empty_database \
  -e JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  -e JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
  -e FIELD_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  cwork-demo
```

Then open `http://localhost:3000`. On Render, `CORS_ORIGINS` is filled in from
the service's own address (`RENDER_EXTERNAL_URL`).
