# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #117 (CW-096: the cash-sheet note and column, dark primary buttons,
  Thai scanner errors, the error icon and the guide's pay-card words).
- **On branch `claude/new-session-syszvt`, restarted from main `4b78ff0` (CW-097, pushed, the PO
  opens the PR):**
  1. README picture: `docs/screenshots/28-cash-sheet.png` and `en/28-cash-sheet.png` retaken with
     `capture-office.mjs` on a freshly seeded throwaway database (synthetic data, no red note,
     "ลำดับ" on one line, checked by eye); the red-line sentence is out of both alt texts. The
     script also rewrote the expiring-documents pictures and the landing's webp files; those were
     put back, so only the two cash-sheet files changed.
  2. Dark theme red: `.btn--danger` and `.nav-link__badge` take `--text-inverse` (6.7:1 on the dark
     red); light unchanged. `styles/__tests__/theme.test.ts` checks the ratio for the red too and
     that both rules use the token.
  3. The four payroll warnings now say "การ์ดค่าจ้าง" (`messages.th.ts`); an i18n test finds them by
     their English key and fails if a Thai one drops the card's title or says "ค่าตอบแทน" again.
- Counts: web 321 (README, README.th, `docs/spec.md`, `verify-doc-counts.ts`); backend unit 788.
- **Not touched, for the PO:** the landing still shows the old cash-sheet picture
  (`landing/assets/shots/cash-sheet.{th,en}.webp`) and its two alt texts still mention the red line.
  The picture is stale, the alt texts are public wording, so both wait for the owner. The English
  versions of the four warnings still say "under Compensation" (the English card is titled "Pay").
- **Not built, by the PO's decision:** pinned footer / 36 px rows of CW-091 and the "Report a
  problem" icon of CW-092 (direction B removes the left menu, built after the Pilot A install).
- Waiting on others: CW-066's two owner items (a real HR person doing the four jobs before
  31 October; a second person who may approve a payroll run); CW-085 upload file needs the
  e-Services layout; CW-080 and CW-086 (#89) are not queued.

## Next

- PO opens the CW-097 PR, reviews and merges. Do not start CW-094 (direction B, after the Pilot A
  install), CW-085's upload file, CW-080 or CW-086, nor the support-scope page. Do not touch the
  real NAS until the owner approves.
