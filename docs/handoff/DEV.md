# Dev room — current state

Overwritten at the end of each unit of work. Git history keeps the past.
Tickets, their scope and acceptance live in [`docs/backlog.md`](../backlog.md);
this file only says where the dev room stands.

## Where things are

- CW-088 (the cash-preparation sheet) is built and is with the PO for review:
  `GET /payroll/runs/:id/print/cash?smallestUnit=`, the pure model in
  `documents/cash-sheet.ts`, the A4 landscape renderer in
  `documents/cash-sheet-renderer.ts`, the button and the smallest-unit select on
  the run page, a section in `docs/guide/printing-payslips.th.md`.
- Choices the PO may want to change: the smallest unit is chosen at print time
  (one of 1,000 … 1 baht, one baht by default) rather than stored as an
  organisation setting, so no migration; the printed page says the layout still
  awaits the pilot's paper form (`CASH_SHEET_LAYOUT_NOTICE`).
- Waiting on others, nothing for the dev room to start:
  - The owner: how the pilot pays the satang, which notes and coins it avoids,
    and the pilot's blank paper form to compare with the printout (CW-088
    acceptance, last point). The accountant's answer on proof of cash payment.
  - CW-085 (#88, the e-Services upload file): the owner's sample file.
  - CW-061 and CW-062: files from the pilot company.
  - CW-080, CW-086 (#89), CW-087 (#90): not queued, the owner has not given a
    time.

## Next

- Nothing until the PO reviews CW-088 or sends a ticket. When the pilot's form
  arrives, compare it with the printout and fix or explain every difference.
  Do not start CW-085, CW-080, CW-086 or CW-087.
