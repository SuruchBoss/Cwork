# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are

- **Dev queue:** CW-061 (#61, scanner import with HR's review page; the
  export's layout and the owner's rules are in the ticket) is with the dev
  room, then CW-089 (#92, the accountant's export and a comparison page for
  e-Filing totals and a parallel run), then CW-062 (#62, three install paths
  on the pilot's Synology; nothing touches the real NAS until the owner
  approves). CW-087 (#90) stays open for its support page. CW-085 (#88)
  waits on a sample file and November. Not queued: CW-080, CW-086 (#89).
  Closed on 2026-10-16: CW-088.
- **Pilot A (by 31 October):** the scanner's layout, the NAS model and how
  filing is done are known (2026-10-17, relayed from the Asuna Bot room; no
  real file in any cloud session). HR files social security itself, keying
  each person into one file and uploading it; an outside accounting firm
  files ภ.ง.ด.1 through e-Filing. Employee records still come from HR into
  the CW-059 template. Real personal data never goes into a cloud session.
- **Pro edition:** decided and on `main` (`a6b0c88`): `ee/` under Elastic-2.0,
  an annual self-hosted subscription, remote help only. Follow-ups are listed
  in CW-077; CW-080 covers installation by a customer's own IT. Neither is
  queued; the owner decides when. The landing page still says Apache-2.0 and
  ฿0, which stays true of the free edition.

## Waiting on the owner

- For CW-062: the NAS's DSM version, whether Container Manager is
  installed, and its free space. The HR import file.
- For CW-089: what HR sends the accountant today, and whether the first
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
- CW-087: the support channel, hours and response time. Once known, the
  form's "ยังไม่กำหนด" line changes and the support page can be written.
- Prices and timing for the CW-077 items.

## How the PO room works

- Reviews each ticket the dev room reports (`session_01A6A6oX85qwkQqRwjcjFy48`):
  reads the diff against the acceptance, reproduces a red CI step locally,
  and waits for all nine CI jobs on `main` to be green before closing the
  issue with a comment.
- Records the outcome in `docs/backlog.md` (Done row, phase table) and sends
  the next ticket to the dev room. CI cancels an in-progress run on a new
  push, so backlog commits go to `main` only while the dev room's CI is idle.
- Changes to licences or public promises need the owner's own confirmation
  typed in this room; a decision relayed from another room is not enough.
- A vulnerability is never described in a public issue: draft an advisory for
  the owner to file under Security → Report a vulnerability.
