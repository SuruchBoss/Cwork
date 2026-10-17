# Cwork on a NAS

Install, back up, restore and update Cwork on a small office's NAS (a Synology,
for the first pilot) beside whatever it already runs. Everything is free and tied
to no key.

Start with `./check.sh` (it only reads), then see
[`docs/operations.md`](../../docs/operations.md#running-on-a-nas-synology) and, for
the person doing the install, the Thai checklist
[`docs/guide/nas-install.th.md`](../../docs/guide/nas-install.th.md). What was and
was not rehearsed: [`docs/nas-rehearsal-2026-10.md`](../../docs/nas-rehearsal-2026-10.md).

| File | What it does |
|---|---|
| `check.sh` | Reads the machine; says which path (A, B or C) applies. Changes nothing |
| `install.sh` | Writes `.env` with new secrets, loads or builds the images, migrates, starts |
| `first-admin.sh`, `show-key.sh`, `export-ca.sh`, `status.sh` | First administrator; print the encryption key; hand over the HTTPS authority; what is running |
| `backup.sh`, `restore.sh` | Database and uploaded files to another disk; put a backup back (tries the key first) |
| `update.sh`, `rollback.sh` | Backs up, then updates; returns to the old programs and data |
| `make-bundle.sh` | On a machine with Docker and internet: builds `images.tar.gz` for a NAS with none |
| `uninstall.sh` | Removes Cwork **and its data** from this machine |
| `docker-compose.yml`, `docker-compose.lan-db.yml`, `Caddyfile`, `lib.sh` | The stack (profiles `db`, `app`, `tools`), path C's database exposure, the HTTPS front door, shared shell functions |

`.env`, `images.tar.gz`, `images.version` and the exported authority file are
machine-local and ignored by git. Run the scripts as root from this folder.
