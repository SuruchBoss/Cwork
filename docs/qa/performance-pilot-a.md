# Performance before the Pilot A install

Measured 2026-11-03 on synthetic data, for the question the PO asked: does a small
NAS (a Synology of the kind the pilot has) run the pay month and the files HR makes
from it in a reasonable time, and does it stay inside its memory? This only measures;
nothing was changed to make a number better.

## What was measured, and on what

- The stack of `deploy/nas/docker-compose.yml`, all four containers (PostgreSQL 16 with
  pgvector, API, console, HTTPS proxy), with the limits the file itself sets
  (database 1 GB, API 768 MB), **and the whole stack inside one parent cgroup of
  2 CPUs (a quota of 200 ms per 100 ms, on CPUs 0 and 1) and 2 GB**. The load script ran
  outside that cgroup, so it cost the stack nothing.
- Peak memory is the high-water mark of that parent cgroup (`memory.max_usage_in_bytes`,
  reset before every step), so it counts all four containers and the page cache they
  use. The memory limit was never hit (`memory.failcnt` stayed 0).
- Two sizes: **50 people** (42 monthly, 8 daily-wage) in March 2037 and **200 people**
  (171 monthly, 29 daily-wage) in May 2037, in a database that held the 50 already.
  Everyone has attendance for every weekday of the month except an absence now and then.
  The scanner file is a UTF-16 export of the layout the pilot's scanner writes: one line
  for each person and weekday, two times a day.
- The month is three periods, as Cwork pays it: the monthly one, and the two halves for
  the daily-wage staff. Each step is one HTTP call (with the call's own work), timed by
  the script.

### Where this differs from a real NAS and from the install

- **The CPU is faster than a small NAS's.** The cloud machine is a 4-vCPU Xeon; the
  2-CPU quota limits how many cores are used, not how fast each one is. A low-end
  Synology core is slower, so read every time below as a floor, not a promise.
- The images were built from the repository's own Dockerfiles with two changes made in a
  scratch copy, not in the repository: the proxy's CA certificate for `npm`, and the three
  `apt-get install` steps (openssl, curl, postgresql-client) left out, because the
  environment's egress policy refuses `deb.debian.org`. Prisma uses the OpenSSL library
  the base image already has, and the image's health check (which uses curl) was dropped.
  The same node, nginx and caddy versions as the install.
- The tools image (`prisma migrate deploy`) could not be built: Docker Hub answered 429
  to the anonymous pull. The schema was made by applying the 22 SQL migrations in order
  with `psql`, which is what `migrate deploy` runs, and the organisation and first
  administrator by the image's own `setup.cli.js`. `_prisma_migrations` is therefore empty.
- Runs were put into APPROVED (and the first half into PAID, which the second half needs)
  with a single SQL update, because the script signs in as the one administrator and a run
  cannot be approved by whoever prepared it. The approve call itself is not timed.
- The API's own request throttle (429) stopped the script after about 170 people were
  added in a minute; it waited the throttle out. That wait is not in any number below.
- Otherwise the compose file's own settings: no email, push, malware scan or assistant,
  and `THROTTLE_STORAGE=memory`.

## Results

| Step | 50 people | 200 people |
|---|---|---|
| Import the scanner file for a whole month | **10.0 s** (1,051 lines) | **41.5 s** (4,017 lines) |
| Calculate the monthly run | 0.54 s (42 payslips) | 1.85 s (171) |
| Calculate the first half (daily wage) | 0.18 s (8) | 0.60 s (29) |
| Calculate the second half | 0.18 s | 0.65 s |
| Export for the accountant (CSV) | 0.02 s | 0.05 s |
| Export the payroll register (Excel, the whole month) | 0.03 s | 0.07 s |
| Payslips of the monthly run, one PDF | 0.17 s (21 pages) | 0.28 s |
| Payslips of a half, one PDF | 0.06 s | 0.07–0.08 s |
| Peak memory of the whole stack, at the end of the run | 300 MB | 507 MB (during the import) |

Cold start of the whole stack (`docker compose up` after a stop, page cache dropped, 200
people in the database):

| Moment | Time after `up` | Peak memory |
|---|---|---|
| The console's HTML over HTTPS through the proxy | 1.0 s | |
| `/health/ready` of the API answers | 2.0 s | 319 MB |
| First sign-in (password and 2FA code) | 0.19 s | |
| First employee list (50 of 200), payroll periods | 0.02 s, 0.01 s | |
| First scanner days list | 0.40 s | 417 MB |

Idle, with everything up and 200 people: API about 170 MB, database about 56 MB, console
and proxy together about 19 MB. The database is 31 MB.

## What to look at

1. **The scanner import is the one slow step, and it grows in a straight line**: about
   10 ms for each line in both sizes. A month of 200 people is 41 s here, over the 30 s
   the PO named, on a faster core than a NAS has. It is the only step that used more than
   a few seconds or more than a few hundred MB (it took the peak from about 400 to
   507 MB). The 50-person month, 10 s, is fine. Everything else, including the three
   payroll runs, the register and 200 payslips in a PDF, is well under 2 s.
2. Memory has room: 507 MB of 2 GB at the worst moment, with the API at 768 MB by its own
   limit and nowhere near it.
3. A cold boot gets to a working console in about 2 s; the first screens are quick. The
   first screen of the scanner days took 0.4 s, the slowest first use.

Not measured: more than 200 people; two people at once; the 14-day cycle (CW-101 is not
built); a real Synology; the full-year scanner history.
