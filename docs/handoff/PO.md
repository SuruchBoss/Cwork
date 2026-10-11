# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are

- **Dev queue:** empty after CW-048. CW-085 (the e-Services upload file and
  the November check, Pilot B) waits on the owner's sample file and on the
  pilot's November month. CW-082 (#85) and CW-083 (#86) are P1, not queued;
  CW-082 is the PO's next pick for the dev room. Closed on 2026-10-11:
  CW-079, CW-078, CW-076, CW-081, CW-071, CW-084 and CW-048.
- **Pilot A (by 31 October):** waits on the pilot company's files, not on
  code. CW-061 needs one real month exported from the TA-001EX scanner;
  CW-062 needs the NAS make, model, CPU, memory, what runs on it and how the
  office reaches the internet. Employee records come from HR's paper or Excel
  into the CW-059 import template (the pilot's Odoo holds accounting files
  only). Real personal data never goes into a cloud session.
- **Pro edition:** decided and on `main` (`a6b0c88`): `ee/` under Elastic-2.0,
  an annual self-hosted subscription, remote help only. Follow-ups are listed
  in CW-077; CW-080 covers installation by a customer's own IT. Neither is
  queued; the owner decides when. The landing page still says Apache-2.0 and
  ฿0, which stays true of the free edition.

## Waiting on the owner

- The pilot company's files for CW-061 and CW-062, and the HR import file.
- A qualified reviewer for the payroll rules on #36, including the two
  section 76 questions and question 4 (overtime in the SSO wage). Until it
  is answered, carried advances should not be taken from a later payday
  without the employee's signed consent.
- A sample สปส.1-10 upload file from SSO e-Services, names and ID numbers
  blanked, for CW-085's file format.
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
