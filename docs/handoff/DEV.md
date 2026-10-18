# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #118 (CW-096 and CW-097: the cash-sheet note, dark primary and red
  buttons, Thai scanner errors, the error icon, the README picture, "การ์ดค่าจ้าง" in the warnings).
- **On branch `claude/new-session-syszvt`, restarted from main `31bf0a8` (CW-098, pushed, the PO
  opens the PR):**
  1. #119: `ErrorState` (`components/ui/index.tsx`) now builds an API error's text with
     `describeApiError`, so a failed list shows the mapped Thai sentence with the details filled in
     (the scanner days page: "เลือกช่วงวันที่ตั้งแต่ 1 ถึง 93 วัน"); English and unknown codes are
     unchanged. A page-level test makes the list fail with `RANGE_NOT_SUPPORTED` and fails if the
     server's sentence comes back.
  2. The four English payroll warnings say "in the Pay card" (keys in `PayrollRunPage.tsx` and
     `messages.th.ts`); the i18n test finds them by what they say and fails if English says
     "Compensation" or Thai drops the card's title.
- Counts: web 322 (README, README.th, `docs/spec.md`, `verify-doc-counts.ts`); backend unit 788.
- **Not touched, for the owner:** the landing still shows the old cash-sheet picture
  (`landing/assets/shots/cash-sheet.{th,en}.webp`) and its two alt texts still mention the red line.
  The new picture from CW-097 can make the webp files the moment the owner says so.
- **Not built, by the PO's decision:** pinned footer / 36 px rows of CW-091 and the "Report a
  problem" icon of CW-092 (direction B removes the left menu, built after the Pilot A install).
- Waiting on others: CW-066's two owner items (a real HR person doing the four jobs before
  31 October; a second person who may approve a payroll run); CW-085 upload file needs the
  e-Services layout; CW-080 and CW-086 (#89) are not queued.

## Next

- PO opens the CW-098 PR, reviews and merges. Do not start CW-094 (direction B, after the Pilot A
  install), CW-085's upload file, CW-080 or CW-086, nor the support-scope page. Do not touch the
  real NAS until the owner approves.
