# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are

- **Dev queue (2026-10-18):** CW-031 (#29) fix, sent 14:05. The demo the owner
  deployed on Render (`https://cwork-demo.onrender.com`, main `ecf5ded`)
  re-ran every migration and a "first boot" reset on waking, and its resets did
  not restore the seed. Cause, reproduced on Postgres 16: the Render database
  user is `cwork_demo`, the demo's marker schema has the same name, so once the
  marker exists `"$user", public` makes `current_schema()` the marker schema and
  every demo raw query looks in the wrong place. CI's user is `cwork`, so CI
  never saw it. Asked for: raw SQL naming the app schema, a test that boots twice
  with `cwork_demo` first on the search path. After merge the owner redeploys and
  times it again (64 s at 13:52, one-minute target).
  Closed 2026-10-17: CW-090, CW-065, CW-073 and the
  QA findings #94–#97 (a day inside a paid month is locked; fixes go in the
  next period). What remains waits on the owner or the pilot. CW-062 (#62) is done on the cloud side and stays open for the
  pilot's real NAS, which nothing touches until the owner approves.
- **QA:** first pass done 2026-10-17, 41 cases, results merged
  (`docs/qa/pilot-a-2026-10.md`). S15 re-tested and passed; its minor note
  (the import's locked-day count) fixed in `6103469`. Nothing waits on QA. CW-087 (#90) stays open for its support page. CW-085 (#88) waits on a
  sample file and November. Not queued: CW-080, CW-086 (#89), a
  scanner-number field on the employee page. Closed on 2026-10-16: CW-088;
  on 2026-10-17: CW-061 (scanner import), CW-089 (accountant export and the
  filed-total and parallel-run checks).
- **Pilot A (by 31 October):** HR files social security itself (one keyed
  file, uploaded); an outside accounting firm files ภ.ง.ด.1 via e-Filing.
  Employee records come from HR into the CW-059 template. Real personal data
  never goes into a cloud session.
- **Pro edition:** decided and on `main` (`a6b0c88`): `ee/` under Elastic-2.0,
  an annual self-hosted subscription, remote help only. Follow-ups are listed
  in CW-077; CW-080 covers installation by a customer's own IT. Neither is
  queued; the owner decides when. The landing page still says Apache-2.0 and
  ฿0, which stays true of the free edition.

## Done 2026-10-17 (evening)

- PR #98 (README and landing page for the October features, the owner's Pro
  and free-edition wording) and PR #99 (screenshots and a loop from the real
  console, `docs/screenshots/capture-office.mjs`) merged at `6393314` and
  `f93e1d7`, both green.
- PR #100 merged at `d342b87`, green: the landing clip is now a 1920x1200
  video (mp4 + webm + poster) instead of a 900px animated WebP that looked
  soft on high-density tablets; the README GIF is 1600px wide. Not yet seen
  on Safari or a real tablet.
- PR #101 merged at `f4af52b`, green: the scanner import page uses the
  English singular for a count of one (`plural()` in `web/src/lib/i18n`).
- PR #102 merged at `20fb92b`, green: the สปส.1-10 PDF follows the redacted
  sample's layout (total in Thai words, title in the name column, sheet
  numbers top right, ruled total row). Not on it, because no field exists:
  the employer's SSO account number, the six-digit branch number, the
  address. Adding organisation fields for them is an open question for the
  owner, not urgent while HR files online.

## Done 2026-10-18

- PR #103 merged at `feca645`, green: CW-066's HR half. Guide
  `docs/guide/hr-daily-tasks.th.md` (four tasks, 14 demo screenshots) and the
  screen fixes where a first-time HR user stopped; `SpreadsheetImport`'s
  "1 problems" is fixed too. PO review added what "Record payment and publish
  payslips" really does (checked in `markPaid`). #69 stays open for the real
  HR test. Dev queue empty again.

## Waiting on the owner

- For CW-066 (#69): the pilot's HR doing the four tasks in the guide unaided
  before 31 October, and whether the pilot has a second person (the owner) to
  approve payroll runs, since whoever calculates cannot approve.

- For CW-062: approval to run the read-only `./check.sh` on the pilot's NAS
  (it reports the DSM version, Container Manager and free space), a USB
  drive or another machine for backups, and a password store for the key
  `show-key.sh` prints. The HR import file.
- After CW-089 (closed): what HR sends the accountant today, whether
  e-Filing needs a finer income code than 40(1), and whether the first
  payroll runs beside HR's method once.
- A qualified reviewer for the payroll rules on #36, including the two
  section 76 questions and question 4 (overtime in the SSO wage). Until it
  is answered, carried advances should not be taken from a later payday
  without the employee's signed consent.
- For CW-085: the e-Services upload template HR uses (names, ID numbers and
  amounts blanked). The printed form arrived redacted on 2026-10-17 and is
  recorded in CW-085 as layout only; it is not the upload file. The owner
  will ask HR.
- After CW-088 (closed): how the pilot pays a remainder under 25 satang, its
  blank paper form to compare with the printout, and what its accountant
  keeps as proof of a cash payday (the owner is asking). How Pilot B pays
  wages (bank files stay Pro until then).
- CW-087: the support channel and response time (hours set 2026-10-17: 18:00–24:00 Thai time, temporary).
- Prices and timing for the CW-077 items.

## How the PO room works

- Reviews each ticket the dev room reports (`session_01A6A6oX85qwkQqRwjcjFy48`):
  reads the diff against the acceptance, reproduces a red CI step locally,
  and waits for every CI job on `main` (ten since `368c303`) to be green
  before closing the issue with a comment.
- Records the outcome in `docs/backlog.md` (Done row, phase table) and sends
  the next ticket to the dev room. CI cancels an in-progress run on a new
  push, so backlog commits go to `main` only while the dev room's CI is idle.
- Changes to licences or public promises need the owner's own confirmation
  typed in this room; a decision relayed from another room is not enough.
- A vulnerability is never described in a public issue: draft an advisory for
  the owner to file under Security → Report a vulnerability.
