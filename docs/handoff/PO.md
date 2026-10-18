# PO room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Every ticket, its scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the PO room stands.

## Where things are (2026-10-18, evening)

- **Dev:** CW-095 sent 20:1x (a manager's pages ask for departments and get
  403). Direction: no new permission; the web does not call `/departments`
  without `ORG_READ`, and the manager's department filter comes from the
  employees the manager can see. The dev room may push back once. PO reviews
  and merges when CI is green.
- **QA:** pass 2 sent 20:1x on `9baa043`: the 41 cases of
  `docs/qa/pilot-a-2026-10.md` again, plus cases for what merged today
  (#103 CW-066, #104 CW-031, #109 CW-093/CW-091, #110 CW-092). Results go in a
  "Pass 2" section of that file, by PR.
- **Scanner number on the employee page:** already done, CW-090 (closed
  2026-10-17). Not a new ticket.
- **Standing permissions:** on `main` in `CLAUDE.md` (`9baa043`, pasted by the
  owner on the web after the auto-mode classifier refused the push). Merging
  a reviewed PR with green CI no longer needs asking; public wording still does.
- **Storytelling draft:** `docs/drafts/storytelling-2026-10-18.th.md` on
  branch `claude/serene-carson-fr7k0k` (`e89a850`), not on `main`. Waiting on
  the owner, typed in this room: hero A or B, whether the six-problems heading
  changes now or with CW-094, and the post. Then one PR for
  `landing/index.html`, the COPY map in `landing/build-en.mjs` and both READMEs.
- **CW-031 (#29):** fixes merged (#104, #109). Waiting on the owner: redeploy
  at `8e1b32d` or later, then time a cold start with HR → manager inside 30 s
  (64 s at 13:52; one-minute target; the Starter plan is his call). Close #29
  when that passes.
- **CW-094:** direction B, top menu, earth tones, olive main colour, after the
  Pilot A install. Not started.
- **Pilot A (by 31 October):** HR files social security itself; an outside
  accounting firm files ภ.ง.ด.1. Real personal data never goes into a cloud
  session. CW-062 (#62) stays open for the pilot's real NAS, untouched until
  the owner approves.

## Waiting on the owner

- #69: the pilot's HR doing the four tasks in `docs/guide/hr-daily-tasks.th.md`
  unaided before 31 October, and a second person to approve payroll runs.
- CW-062: approval to run the read-only `./check.sh` on the pilot's NAS, a
  backup drive, a password store for the key, the HR import file.
- CW-085: the e-Services upload template HR uses, blanked.
- After CW-088 and CW-089: remainders under 25 satang, the blank paper form,
  proof of a cash payday, what HR sends the accountant, the e-Filing income
  code, whether the first payroll runs beside HR's method.
- #36: a qualified reviewer for the payroll rules.
- CW-087: the support channel and response time (hours 18:00–24:00, temporary).
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
