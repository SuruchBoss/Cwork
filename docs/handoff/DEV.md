# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- On `main`: everything up to #126 (CW-099 the payroll register, which reads the whole month;
  the three backend advisories and zod in web).
- **On branch `claude/new-session-syszvt`, restarted from main `2c47dac` (pushed, the PO opens the PR):**
  1. `2e201c8`: the e2e count is 460, what CI reported after CW-099 (`verify-doc-counts.ts`, README,
     README.th, `docs/spec.md`).
  2. `71637dd`: dev tooling with a compatible fix, lockfile only: backend handlebars (critical) and
     fast-uri; web vite and source-map-js (high), vitest, @vitest/mocker.
  3. The 8,556 test: `semi-monthly.spec.ts` pins the pilot's example (372 a day × 23 days = 8,556, 5% =
     427.80, 428 each side) through `computeSocialSecurity`, through a monthly payslip with a daily
     BASE line, and through every split of the 23 days into two halves (11 + 12 gives 205 + 223).
     It passed with no change to the calculation. Counts: backend unit 802, domain 509.
- **Audit of the whole repo (done, not all fixable):** 46 entries remain, none high or critical, all
  dev tooling (backend 34, web 12), none reaches the runtime image or the bundles
  (`audit:prod` = 0 in both). Roots: minimatch < 11.0.1 (eslint 9, typescript-eslint, jest, nest cli;
  the "fix" npm offers downgrades eslint to 4 and jest to 25), glob 13 pinned by @nestjs/cli 11
  (the fix is @nestjs/cli 12 = a NestJS major, its own PR when the PO wants it), deepmerge 4.3.1
  (latest, no fixed release), eslint-plugin-react-refresh in web (no fix). Not checked: the Flutter
  app (`mobile/pubspec.lock`, 95 packages): no flutter/dart here and the proxy blocks api.osv.dev.
- Counts: web 322; backend unit 802, domain 509; e2e 460.
- **Not touched, for the owner:** the landing still shows the old cash-sheet picture
  (`landing/assets/shots/cash-sheet.{th,en}.webp`) and its two alt texts still mention the red line.
- **Not built, by the PO's decision:** pinned footer / 36 px rows of CW-091 and the "Report a
  problem" icon of CW-092; CW-094, CW-085's upload file, CW-080, CW-086, the support-scope page.

## Next (the PO's order)

1. CW-100 (#124): the month of someone who leaves: read the Social Security Act and the Office's own
   pages first (is the leaving month deducted and filed on the wages actually paid, and when and how
   leaving is notified, the rounding rule again); stop and tell the PO if the sources differ from what
   the code does. Then the warning on the payslip of the person whose last working day falls in the
   period, Thai and English, no switch to skip their social security, one line in the customer guide
   without a company name, tests. Also find, from the sources and with no code change: does a pay
   period straddling two months count for the month paid or the month worked, and may the employee's
   share be deducted once a month at the last payment (answer in the PR or on #36).
2. A performance measurement for Pilot A on a 2 CPU / 2 GB stack from `deploy/nas/` (50 and 200
   people): measure only, write `docs/qa/performance-pilot-a.md`; tell the PO first if Docker is not
   available here.
3. CW-101 (#125): the 14-day pay cycle for daily wages. The month-counting rule goes in one function.
   No single-period deduction option until the owner approves.

Do not touch the real NAS until the owner approves. The pilot's real register and files stay on the
owner's machine: only the layout is in the repository.
