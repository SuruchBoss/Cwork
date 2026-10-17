# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are

- **Dev queue (2026-10-17, owner: do what can be done while documents are
  awaited):** CW-065 (#68, add one employee, with the dev) → CW-073
  (#78, foreign workers' expiry list and notices). CW-090 closed 2026-10-17. CW-062 (#62) is done on the cloud side and stays open for the
  pilot's real NAS, which nothing touches until the owner approves.
- **QA (owner approved 2026-10-17):** plan and results table in
  `docs/qa/pilot-a-2026-10.md`, room state in `docs/handoff/QA.md`. The Asuna
  Bot room opens the QA room. CW-087 (#90) stays open for its support page. CW-085 (#88) waits on a
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

## Waiting on the owner

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
- A sample สปส.1-10 upload file from SSO e-Services, names and ID numbers
  blanked, for CW-085's file format.
- After CW-088 (closed): how the pilot pays a remainder under 25 satang, its
  blank paper form to compare with the printout, and what its accountant
  keeps as proof of a cash payday (the owner is asking). How Pilot B pays
  wages (bank files stay Pro until then).
- CW-087: the support channel, hours and response time.
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
