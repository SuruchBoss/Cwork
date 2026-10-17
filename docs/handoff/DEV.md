# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- CW-061 (#61) and CW-089 (#92) passed review. Code and guides are as listed in
  the CHANGELOG; nothing open on them for the dev room.
- **CW-062 (#62), the NAS install, is built and pushed; waiting on review.** It is
  all in `deploy/nas/` (README there): `check.sh` (reads the machine: path A,
  B or C), `install.sh`, `backup.sh`, `restore.sh`, `update.sh`, `rollback.sh`,
  `make-bundle.sh`, `uninstall.sh`, one compose file with profiles `db`/`app`/`tools`
  and a Caddy HTTPS front door. Docs: `docs/operations.md` "Running on a NAS
  (Synology)", Thai checklist `docs/guide/nas-install.th.md`, rehearsal record
  `docs/nas-rehearsal-2026-10.md` (read it for what was and was not tried).
  - Rehearsed on a clean Docker host with Odoo 17 beside it, not on a Synology.
    Not tried: every DSM screen and DSM's shell, a Windows PC trusting the
    certificate authority, a port scan from outside, two real machines for path C,
    the real `apt-get` Dockerfile builds (the room's containers have no internet).
  - Edits to `backend/Dockerfile`: `/app/uploads` is created owned by the API's
    user (uploads failed with a 500 in the existing image, root compose included);
    the tools image carries `verify-db-objects.sql` and, in its stage only, `psql`.
  - `docker compose run --rm migrate npm run db:verify` (operations.md) had never
    worked from the tools image: no SQL file and no `psql`. Fixed: `psql` in the
    Dockerfile's tools stage only, plus CI job "Tools image runs db:verify"
    (`backend/scripts/verify-tools-image.sh`), green on `main` at `368c303`.
  - **Open for the owner:** approval to run `./check.sh` and then the install on
    the pilot's NAS; the real result goes at the bottom of the rehearsal record.
    Backups need a USB drive or another machine (a same-disk folder is refused).
- Waiting on others, nothing for the dev room to start: the owner (what HR sends
  the accountant today, whether the first payroll runs beside HR's method, the
  support channel for CW-087's page, the pilot's blank paper form, the
  accountant's answer on proof of cash payment); CW-085 (#88) needs the owner's
  sample file; CW-080 and CW-086 (#89) are not queued.

## Next

- Nothing queued. Do not start CW-085, CW-080 or CW-086, nor the support-scope
  page. Do not touch the real NAS until the owner approves.
