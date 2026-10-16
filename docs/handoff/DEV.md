# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- CW-087, the problem-report form only (#90), is built and is with the PO for
  review. **Help → Report a problem** (`/support/report`, everyone signed in):
  the page is `web/src/features/support/ReportProblemPage.tsx`, the text it
  builds is `problem-report.ts`, and what is kept of a failed request is decided
  in `web/src/lib/failure-log.ts`, fed by `lib/api-client.ts`. The page makes no
  request and has no send button; where to send the report shows as "not decided
  yet". Web only, no backend change. Guide: `docs/guide/report-a-problem.th.md`;
  `docs/security.md` has a short section.
- Not built, on purpose: the page of what support covers, the channel, hours and
  response time (the owner), and any README link (an Editions change the owner
  confirms in the PO room).
- CW-088 (the cash sheet) passed review and is closed.
- Waiting on others, nothing for the dev room to start:
  - The owner: the support channel, hours and response time (CW-087's page);
    the pilot's blank paper form for CW-088's comparison; how the pilot pays a
    remainder under 25 satang; the accountant's answer on proof of cash payment.
  - CW-085 (#88, the e-Services upload file): the owner's sample file.
  - CW-061 and CW-062: files from the pilot company.
  - CW-080, CW-086 (#89): not queued, the owner has not given a time.

## Next

- Nothing until the PO reviews CW-087's form or sends a ticket. Do not start
  CW-085, CW-080 or CW-086, nor the support-scope page.
