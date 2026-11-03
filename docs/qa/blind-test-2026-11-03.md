# Blind test: a first-time HR runs the four daily jobs (3 Nov 2026)

Requested by the PO room before the Pilot A install date is set. Run by the UX/UI
room. No code was changed.

## How it was run

- **App:** `main` at `b6e9e5d`, run locally at 1366×768. Thai UI, light theme.
- **Data:** synthetic only.
  - The database comes from `db:seed`. It was seeded with the clock set to
    1 Oct 2026, so the demo's payroll is paid for January to September and
    October is still open. That is the position Pilot A will be in when it starts
    its parallel run.
  - Scanner numbers and daily rates come from the same `prepare()` step as
    `docs/guide/capture-hr-tasks.mjs`.
  - The scanner file was built the same way for 1-15 October.
- **Tester:** a fresh agent with no context. It played a non-technical HR officer.
  - It was given only the guide `docs/guide/hr-daily-tasks.th.md` with its
    pictures, the scanner file and the two accounts (HR and owner).
  - It could not read code, handoffs or the API. It clicked only on what it could
    see on screen.
- **Runs:**
  - **Run 1** did all four jobs, but its data had October already paid. That
    blocked jobs 1 and 3, and those blocks are left out of this report.
  - **Run 2** started from clean data and repeated jobs 1, 3 and 4 with a new
    tester.
  - Job 2 findings come from run 1. Job 2 does not depend on the paid month.

## Result per job

| Job | Result |
|---|---|
| 1. Import the scanner file and settle the days | Finished with the guide, about 10 attempts. The tester guessed on two decisions. |
| 2. Record leave | Finished on its own, 2 attempts. |
| 3. Parallel payroll (15-day and month) and compare | Finished with the guide, about 15 attempts. The compare page was found by guessing. |
| 4. Print payslips, receipt sheet and cash sheet | Finished with the guide, 5 attempts. |

Nothing blocked in run 2. The guide's pictures hr-01, 02, 03, 12 and 13 matched
the screen to the figure: 9,404.00 for the 15-day run and 360,529.28 for the
month. Nothing was cut off at 1366×768, apart from item 13.

## Friction, most serious first

### Heavy: finished only after a long search or a guess

1. **The guide never says where to compare the numbers.**
   - Job 3 is called a parallel run "to compare the numbers", but no step says
     how or where.
   - The tester guessed the button "เทียบกับที่ยื่นไปแล้ว" from the six buttons at
     the top of Payroll ([14](blind-test-2026-11-03/14-payroll-buttons.png),
     [01](blind-test-2026-11-03/01-compare-page.png)).
   - The label reads like comparing with a tax or social-security filing, not
     with the HR's own spreadsheet.
2. **The compare page asks for one column name and then rejects it.**
   - Part 2 of the page tells HR the file needs a column for net pay
     ("เงินสุทธิ").
   - A file with that header is rejected with `ไฟล์ไม่มีคอลัมน์ "สุทธิ / Net" ซึ่งต้องมี`.
     Renaming the header to "สุทธิ" makes it pass
     ([02](blind-test-2026-11-03/02-compare-net-column.png)).
   - There is no template file to download, so HR has to guess every header.
3. **Nothing on screen warns against recording payment during the parallel run.**
   - After the owner approves, the most prominent button is
     "บันทึกการจ่ายและเผยแพร่สลิป" ([03](blind-test-2026-11-03/03-pay-button-after-approve.png)).
   - Only the guide says not to press it.
   - The printed payslips look exactly like real ones, with no "trial" mark.
4. **A day with a single scan cannot be given a real clock-out time.**
   - The clock-out list offers only "ไม่มีเวลาออก" or the time already scanned
     ([04](blind-test-2026-11-03/04-single-scan-choices.png)).
   - The guide does not say what to do when someone forgot to scan out.
   - The tester counted the clock-in only. Nothing in the payroll check then
     showed whether that day was paid in full.
   - Whether HR should be able to type a time is a product decision. At minimum,
     the guide needs a line on it.
5. **An unknown scanner number with no owner.**
   - Number 777 is named "ชั่วคราว" in the scanner.
   - The guide explains how to match a number to a person. It does not explain
     how to find out whose number it is, whether it can be left unmatched, or what
     that means for pay.
   - The tester went to the employee list and guessed
     ([05](blind-test-2026-11-03/05-unknown-number-count.png)).

### Light: a short pause or unclear wording

6. **When HR tries to approve their own run, the error is in English.**
   - The error reads "A payroll run must be approved by someone other than the
     person who prepared it" ([06](blind-test-2026-11-03/06-self-approve-english.png)).
   - The "อนุมัติรอบ" button looks clickable for the preparer.
7. **The unmatched-scanner card counts days, not numbers.**
   - "เลขสแกนยังไม่มีเจ้าของ 2" counts days.
   - The table under it has one number, and the result after import says "1 เลข".
8. **The confirmation after deciding a day is easy to miss.**
   - It appears at the top of the page.
   - When HR works on a lower row, they do not see it without scrolling up
     ([07](blind-test-2026-11-03/07-toast-at-top.png)).
9. **Matching a scanner number takes an extra step.**
   - After typing a name, HR picks from a separate "เลือก…" list. A drop-down under
     the field was expected.
   - The guide says "ผูก" but the screen says "จับคู่".
10. **Payroll runs are hard to find.**
    - To reach "รอบการคำนวณ", HR scrolls past every closed period of the year
      ([08](blind-test-2026-11-03/08-run-list.png)).
    - A period that already has a run still offers "สร้างรอบคำนวณ", with no way to
      open the run from that row.
    - The guide says a new period appears at the top. October came second, under
      1-15 October.
11. **The owner's dashboard does not show the run that is waiting.**
    - Its approval list has expense and leave requests, but not the payroll run
      waiting for them ([12](blind-test-2026-11-03/12-owner-dashboard.png)).
    - The owner has to know the way: Payroll, then the run.
    - The owner sees the same blue note as HR ("ผู้ที่คำนวณรอบนี้อนุมัติเองไม่ได้..."),
      not "you can approve this".
    - The run is approved with no confirmation step.
    - The dashboard card "รอบเงินเดือนล่าสุด" already shows the unapproved trial
      run for October.
12. **The compare page uses terms that do not fit the 15-day period.**
    - **e-Filing:** the 15-day period asks for the e-Filing filed totals, which are
      monthly.
    - **Social security:** Cwork used 875 per person and the screen does not say
      why. An HR whose sheet uses 750 cannot tell which is right.
    - **Provident fund:** tax differs while net pay matches, because of a provident
      fund the compare page does not show. The tester only found it on the payslip.
13. **Recording leave (job 2).**
    - **Second date field:** when HR clicks the "ถึงวันที่" field to overwrite it,
      the old text is not selected. The typing is appended ("18 พ.ย. 256918/11/2569")
      and the field turns red ([09](blind-test-2026-11-03/09-leave-second-date.png)).
      The first date field does select its text, as the guide says.
    - **Summary cut off:** at 1366×768 the summary before saving is cut off, and HR
      scrolls inside the panel to reach the save buttons
      ([10](blind-test-2026-11-03/10-leave-summary-cut.png)).
    - **Two save buttons:** "บันทึก และบันทึกคนต่อไป" is blue and catches the eye
      first, but the guide says "บันทึก".
    - **"Leave today" card:** "ลาวันนี้ 1 รวมที่รออนุมัติ" suggests someone on
      leave today is still pending, but that leave was already approved
      ([11](blind-test-2026-11-03/11-leave-today-card.png)).
    - **Not in the guide:** half-day options and "นำเข้าวันลาที่ใช้ไปแล้ว".
14. **The monthly run gives no warning about missing scan data.** The month was
    calculated in full, although the scanner file only reached 15 October.
15. **Printing.**
    - Downloaded PDFs are named with a UUID (`5691991d-….pdf`), so the payslips,
      receipt sheet and cash sheet cannot be told apart.
    - In the test browser the print tab opened blank. That is probably the test
      browser, not the app.
16. **Wording.**
    - The Payroll page's six buttons include jargon such as สปส.1-10 and
      "ส่วนต่างประกันสังคม".
    - The cash sheet's "เศษไม่จ่าย" and its note on 25 satang needed two reads.
    - The guide does not mention the 6-digit code at sign-in.

### Only when the month was already paid in Cwork (from run 1)

These are not what Pilot A meets in its first parallel run. They will matter if
HR re-imports a month after recording payment.

17. **The import result has no next step.** It says
    "เพิ่มรายการลงเวลา 0 รายการ" and "55 วันไม่ถูกแก้ เพราะเงินเดือนใช้ไปแล้ว", with
    nothing on what to do next ([13](blind-test-2026-11-03/13-import-paid-month.png)).
    - "เงินเดือนใช้ไปแล้ว" does not say whether that means calculated, approved or
      paid.
18. **The counts on the import and review pages disagree.**
    - The import summary says 2 days wait for HR. The review page says 0.
    - The locked days only show under one of the eight "แสดง" filters.
    - The scanner page says "นับแล้ว" for days the attendance page has no record
      of.

## What worked well

- **Scanner import:** the preview says plainly that nothing is saved yet. After
  the decisions every card reads 0, so the job feels finished.
- **Periods and runs:** creating them follows the guide step by step. The dates
  are filled in for HR, and the separation-of-duties note is clear Thai.
- **Compare page:** once found and given the right headers, it reads well. It
  shows Cwork, yours and the difference per person and per column.
- **Recording leave:** smooth. Employee search, remaining days, the second date
  following the first, a confirmation, and "บันทึกโดย".
- **PDFs:** the payslips (2 or 4 per page with cut lines), the receipt sheet with
  a signature column and the cash sheet are all correct Thai, and the totals match
  the run.

## Not findings

- **The seed accounts hint on the sign-in page.** It shows only in a dev build
  (`env.isDev` in `LoginPage.tsx`), so a Pilot A install does not show it.
- **Run 1's zero-baht run and blocked October month.** They came from the
  test's own data and were left out.
