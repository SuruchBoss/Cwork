# NAS install rehearsal, 17 October 2026 (CW-062)

What was run before `deploy/nas` was handed over, what it showed and, just as
important, what was **not** tried. Nothing here was run on the pilot's NAS or on
any Synology: the owner has not approved touching the real one.

## The machine used

A clean Linux x86-64 Docker host (the cloud dev room: Docker 29.6.2, Compose
v5.3.1, 16 GB). Stand-ins: a tmpfs mount as the "USB drive" (a different
filesystem from Docker's data, so the same-disk guard could be exercised), Odoo
17 with PostgreSQL 15 as the neighbour (the pilot's Odoo version is unknown;
this is a typical one), and the host's own LAN address as the NAS address.

**Images were not built from the real Dockerfiles.** Containers in that room have
no route to the internet (`deb.debian.org` is refused), so the `apt-get` and
`npm ci` steps cannot run there. The rehearsal images use the same stages
(`build` as the tools image, `runtime` as the API, the nginx stage for the console)
with the compiled output copied in from the host. So the real `backend/Dockerfile`
and `web/Dockerfile` have **not** been built in this rehearsal; the two edits made
to `backend/Dockerfile` (below) were mirrored in the stand-in. The root
`docker-compose.yml` build path is the existing, already-used one.

## Acceptance, one by one

| Acceptance | Result |
|---|---|
| Runs beside Odoo, Odoo unaffected | **Passed on the stand-in.** Odoo 17 + PostgreSQL 15 on 8069 stayed up with the same container start times, and its login page answered 200, through install, backup, update, restore and rollback of Cwork. Idle memory, measured: Cwork's four containers about 150 MB together (API 84 MB, PostgreSQL 44 MB, proxy 14 MB, web 5 MB). Not measured under load or with twelve users. |
| HR signs in over HTTPS from an office PC | **Passed in part.** `curl --cacert cwork-office-ca.crt https://<address>:8443` verified the certificate (result 0) and a headless Chromium reached the sign-in page, the API calls through the same address returned 200, and the sign-in reached the two-step screen. Chromium was told to trust the certificate's key, not the authority, because the room has no tool to add the authority to a browser. **Installing the authority on a real Windows PC has not been tried.** |
| Port scan from outside finds nothing | **Not done.** Scanned all 65,535 ports of the host's LAN address from the host itself: Cwork added 8443 and nothing else (Odoo's 8069 was the neighbour's; two other ports, 2024 and 2025, are not published by any container). `docker ps` showed PostgreSQL, the API and the console's web server with no published port. A scan from another machine outside the office has not been done. |
| Restore last night's backup onto a fresh container, that day's data is back | **Passed.** An organisation, an administrator with two-step sign-in and an uploaded file were backed up; a second file was added after the backup; everything was erased (`uninstall.sh`); a new install was made with the saved key (`--field-key`); `restore.sh` put the backup in. The first file came back byte for byte, the second was absent, and the administrator signed in with the *old* authenticator secret, which proves the key opened the restored encrypted column. |
| A NAS section another company could follow | Written: `docs/operations.md` "Running on a NAS (Synology)" and the Thai checklist `docs/guide/nas-install.th.md`. Nobody but the author has followed it. |

## The other flows

- **Path B (no Container Manager).** Simulated by running `check.sh` and
  `install.sh` with `docker` off the path: `check.sh` exits 2 and says to install
  Container Manager from Package Center; `install.sh` stops. Installing the
  package on DSM **has not been tried on a real Synology**.
- **Path C.** PostgreSQL (`--mode db`, published on the host's LAN address only,
  5432) and the app (`--mode app`, a second compose project on the same Docker
  host) installed; first administrator, sign-in, upload and download worked through
  the app; `backup.sh` saved the database on the "NAS" side and the uploaded files
  on the "PC" side; the PC's uploaded files were deleted and restored; the database
  restored on the "NAS" side. **Two separate machines were not used**, so
  nothing about a real network between them, a real PC's Docker, or a firewall
  was tested.
- **Install, update, rollback.** From a bundle (`make-bundle.sh` → `images.tar.gz`,
  825 MB for the rehearsal's non-slim images; the real ones will differ) on a folder
  with no source beside it: install 42 s, update (with a new migration added) 28 s,
  rollback 19 s. After the rollback the migration's table was gone and the old
  image tags were back. Installing by building took 1 min 26 s here with prebuilt
  output; it will take far longer from the real Dockerfiles.
- **Backup details.** Refuses a folder on Docker's own disk; refuses a missing
  parent (an unplugged drive); a cut-off dump is rejected; checksums written;
  old backups removed after the retention days (a 20-day-old pair was deleted,
  newer ones kept); the key is not in the dump or the backup folder.
- **Wrong key.** Restoring onto an install made with a fresh random key leaves a
  database whose sign-in answers 500. `restore.sh` now loads the backup into a
  scratch database and tries the key first, and stops with nothing changed; checked
  with the wrong key (refused) and the right one (went on).

## What the rehearsal found, and what was done

- **HTTPS handshake failed on the IP address.** Behind Docker's port mapping Caddy
  cannot tell which address was dialled, and a browser opening an IP sends no
  server name. Fixed with `default_sni` in the Caddyfile.
- **The API started before the migrations**, filling its log with "relation does
  not exist". Install and update now start PostgreSQL, migrate, then start the app.
- **Uploads failed with HTTP 500 in the existing production image.**
  `/app/uploads` is created root-owned when a volume is mounted, and the API runs as
  an unprivileged user. `backend/Dockerfile` now creates it owned by that user.
  This affects the root `docker-compose.yml` as well, which has the same volume.
- **`db:verify` could not run from the tools image**: its SQL file was not copied
  in and `psql`, which the script calls, was not in the image. Both are fixed in
  `backend/Dockerfile` (`psql` in the tools stage only), and a new CI job builds
  the two stages, runs `db:verify` through the tools image on a migrated database
  (and shows it fails when an index is missing), and asserts the runtime image has
  no `psql`; it passed on its first run on `main`. The commands in this file's
  "Deploying", "Upgrading" and "Restoring from backup" sections therefore work. The
  NAS scripts still pipe the SQL through the PostgreSQL container, which was what
  could be rehearsed here (the room cannot run `apt-get`, so it could not build the
  fixed image itself); it checks the same objects.
- **The "dump complete" check missed pg16's trailing `\unrestrict` line**; it now
  looks at the last ten lines.
- **A failed install could not be run again** (`.env` was left behind); an install
  that stopped before it made data now starts again, and `uninstall.sh` exists for
  starting over on purpose.
- **The backup folder default (`/volume1/backup/cwork`) was on the NAS's own disk**
  on a one-volume Synology; there is no default now, and the installer says to
  choose a USB drive or another machine.
- **The same-disk check used `stat`'s device number**, which differs per btrfs
  shared folder on a Synology though they share a disk; it now compares the
  filesystem `df` reports.
- **`check.sh` measured the system partition** for free space before Docker is
  installed (path B); on a Synology it now looks at `/volume1`.

## Not tried, and why it matters

- Every DSM screen and command: Package Center, Container Manager's version of
  Compose, Task Scheduler for the nightly backup, the firewall, a USB share's path,
  DSM's own shell and tools. The scripts are POSIX `sh` using only common tools and
  pass `dash -n`; they have not run under DSM's shell. `synopkg` and
  `/etc.defaults/VERSION` handling is untested.
- A scan from outside the office; a real office PC trusting the authority; two
  machines for path C; ARM images; a NAS with other loaded containers; a real
  month of payroll on it; the real Dockerfile builds; the first night's scheduled
  backup.
- None of this touched the pilot's data: the rehearsal used a made-up organisation
  and files written for it.

**Before the NAS is touched:** the owner approves; first `./check.sh` on it (it only
reads), then install on a copy of the folder beside the real Odoo at a quiet time
with a fresh Odoo backup, and write the real result below this line.
