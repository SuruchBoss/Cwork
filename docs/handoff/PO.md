# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are (2026-11-03)

- **Dev queue:** CW-099 (#123) the payroll register export, then the 8,556
  social security tests, then CW-100 (#124) the leaver warning. Estimates:
  CW-099 merged and QA-checked Thu 5 Nov, the rest Fri 6 Nov.
- **Pilot A, all ten HR answers in (2026-11-03).** HR keys social security on
  the web (no upload file, CW-085 updated). It sends the accounting firm a
  one-sheet payroll register, which CW-089 is not, hence CW-099. The firm sets
  the ภ.ง.ด.1 income code. The receipt sheet is optional. Cash pay is proved by
  a cash bill and certificate. The first period runs in parallel (HR pays the
  old way), and HR tries the four guide tasks then (#69). The second approver
  is called "the approver role" in the repo. The install date is ours to
  propose: PO estimate, ready to book from Mon 9 Nov. Real personal data never
  goes into a cloud session.
- **Social security, daily wages:** the sum and rounding are right (CW-084;
  372 × 23 = 8,556 gives 428). But a daily wage is paid SEMI_MONTHLY, and the
  first half already deducts. The pilot deducts once a month. Not changed
  until the owner decides (and #36 confirms the law).
- **Parked:** the petty-cash certificate (backlog § Parked ideas).
- **Storytelling draft:** `docs/drafts/storytelling-2026-10-18.th.md` on
  `claude/serene-carson-fr7k0k` (`e89a850`). Needs the owner's words: hero A
  or B, the six-problems heading now or with CW-094, and the post.
- **CW-031 (#29):** waiting on the owner to redeploy at `d08c985` or later and
  time a cold start (target 30 s; 64 s on 18 Oct).
- **CW-094:** direction B, after the Pilot A install. Not started.

## Waiting on the owner

- `./check.sh` on the pilot's NAS: the owner's own words in this room; also a
  backup drive, a password store for the key, the HR file (filled on-site).
- Social security timing for a daily worker's first half, before that payday.
- The landing cash-sheet picture and its alt text (public wording).
- Still to ask HR: whether it rounds the net, and the field order of the
  social security web form.
- #36: a qualified reviewer for the payroll rules.
- CW-087: the support channel (hours 18:00–24:00, temporary).
- Prices and timing for the CW-077 items.

## How the PO room works

- Dev room `session_01A6A6oX85qwkQqRwjcjFy48`, QA room
  `session_01FygupdPGTCw1Qe7C1BYSCg`, UX room `session_01LMneSyoUa7YYq8CstMChdg`.
- Reviews each branch against its acceptance, waits for every CI job, merges
  with a pinned sha, records the outcome in the backlog, reports once to the
  Asuna Bot room.
- CI cancels an in-progress run on a new push: docs go to `main` only while
  CI is idle, never straight after a merge.
- Licences, editions and other public wording need the owner's own words
  typed in this room. A vulnerability is never a public issue: draft an
  advisory for the owner to file.
