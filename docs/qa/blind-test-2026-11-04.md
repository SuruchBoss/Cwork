# Final blind test on the installed stack (3–4 Nov 2026)

The last check the PO room asked for before the owner books the Pilot A install date.
A first-time HR officer does the four daily jobs and the parallel run, using only the
guide, on a stack installed with `deploy/nas/install.sh`. Run by the UX/UI room. No
code was changed.

## Result

All five parts finished. Nothing blocks the install. The serious items are one wrong
default on the scanner review page and two places where the owner and HR are left to
guess; they are listed first below.

| Job | Finished | Attempts | Worst friction |
|---|---|---|---|
| 0. Sign in with the 6-digit code | Yes | 1 (and 4 account switches later) | None |
| 1. Import the scanner file and settle the days | Yes | 1 | Heavy: the temporary card |
| 2. Record a leave | Yes | 1 | Light |
| 3. Parallel run: both halves and the month, approval, month compare | Yes | 1, plus one wrong click | Heavy: a second run on the wrong row; the owner's dashboard |
| 4. Print payslips, receipt sheet and cash sheet | Yes | 1 | Light |

Every figure on screen and in the files matched: 9,404.00 for the first half, 9,406.00
for the second half, 360,529.28 for the month, and the compare page found the one
person whose tax the tester had changed by 50 baht (−฿50.00 tax, +฿50.00 net)
([06](blind-test-2026-11-04/06-month-compare.png)). The payment was never recorded.

## How it was run

- **Code:** `main` at `09fc821` (#147 merged). `main` at `03969f8` differs only in the
  backlog and the PO handoff, so the result holds for it.
- **Install:** a clean copy of that commit, as if downloaded, installed with
  `./install.sh --mode full --host … --yes --backup-dir … --db-password-file …
  --field-key-file …` into Docker with the whole stack in one parent cgroup of 2 CPUs
  and 2 GB, the method of [performance-pilot-a.md](performance-pilot-a.md).
  - It took 124 s. `check.sh` reported PATH A; the database objects were verified.
  - The installer printed only where each secret came from ("database password: from
    the file …", "encryption key: from the file …"). Neither value appears in the
    install log, and both values in `.env` equal their files.
  - The rehearsal install before it was removed with `uninstall.sh`.
  - Peak memory of the parent cgroup was 1,880 MB, measured from before the image
    build, so it includes the build; the memory limit was never hit (`failcnt` 0).
    After the test the stack used 928 MB with page cache, the four containers 213 MB.
- **Data:** synthetic only.
  - The demo seed (`db:seed`) run through the install's own tools image, with the
    clock at 1 Oct 2026: January to September paid, October open.
  - Five people got scanner numbers 101–105 and two of them a daily rate of 450 baht
    paid twice a month.
  - The scanner file covers every weekday of October: one day with only a morning
    scan, one with only an evening scan (a daily-paid person, second half), one with
    three scans, one absence, and number 777 unregistered on 1–2 Oct.
- **Tester:** a fresh agent with no context, playing a non-technical HR officer at
  1366×768, Thai UI. It had the HR guide and the guides it links to, the scanner file,
  the two accounts, and a list of what a real HR officer knows about the office (777
  was a temporary card for one person, who forgot which scan). It could not read code,
  handoffs or logs, and did not call the API.

### Where this differs from a real install

These are changes to the test environment, not to the installer:

- The two Dockerfiles in the scratch copy got the cloud proxy's CA certificate, apt
  sources over HTTPS through the proxy, and npm proxy settings, because the cloud
  room reaches the internet only through that proxy. `docker-compose.yml` and the
  scripts were not changed. Docker Hub did not refuse any pull this time, so openssl,
  curl and postgresql-client were installed as in the real images.
- `db:demo` needs the fonts in `backend/assets`, which the tools image does not have;
  they were mounted read-only for the seed. A real install does not run the demo.
- The seed stands in for `first-admin.sh` and for HR entering the company's people.
- The cloud machine's CPU is faster than a small NAS's (see performance-pilot-a.md),
  and it is not a Synology, so `check.sh` read the host's memory, not the NAS's.
- The browser ignored the certificate instead of trusting `cwork-office-ca.crt` the
  way an office PC would after `export-ca.sh`.
- Excel was played by a short Python script editing a copy of the file.

## Friction, most serious first

### Heavy

1. **A scan in the evening is pre-filled as a clock-in.**
   - On the day with only 17:32, the choice is already set to "เข้า 17:32" and
     "ไม่มีเวลาออก" ([01](blind-test-2026-11-04/01-evening-scan-default.png), third row).
   - Pressing the blue "ใช้เวลาเหล่านี้" as it stands records a 17:32 arrival.
   - The tester fixed it only after re-reading the guide, which says to choose
     "ไม่มีเวลาเข้า" for an evening time.
   - The morning-only day and the three-scan day were pre-filled correctly.
2. **The owner's dashboard does not show the pay runs waiting for approval.**
   - "รออนุมัติของคุณ 2" lists one expense claim and one leave, not the two pay
     runs ([02](blind-test-2026-11-04/02-owner-dashboard.png)).
   - "รอบเงินเดือนล่าสุด" shows the second half's draft at ฿0.00.
   - The owner found the runs only by scrolling to "รอบการคำนวณ" at the bottom of
     Payroll, past every period of the year.
3. **A period that already has a run still offers "สร้างรอบคำนวณ", and the error
   is English.**
   - Meaning to start the month's run, the tester pressed the button on the
     "1–15 ตุลาคม 2569" row instead of "ตุลาคม 2569"; the two names differ by one
     prefix.
   - The red box says "A regular run (PAY-2026-00010) already exists for this
     period" ([03](blind-test-2026-11-04/03-second-run-english.png)).
   - The row has no "เปิดดู" for the run it already has.
4. **The guide has no case for a temporary scanner card.**
   - Registering 777 for the person who carried it on 1–2 Oct makes 777 her number
     for good ([07](blind-test-2026-11-04/07-temporary-card.png)).
   - The guide does not say what to do when she gets her own card, or when someone
     else carries 777 next month.

### Medium

5. **HR sees an enabled, dark-blue "อนุมัติรอบ" on a run it calculated**, under a
   note saying it cannot approve it ([04](blind-test-2026-11-04/04-hr-approve-button.png)).
   The three print buttons look enabled before approval too; only small text below
   says they wait for it.
6. **The order of the parallel run is only in a bracket in step 5.** The first half
   must be approved before the second half can be calculated, so the owner is needed
   twice and the tester switched accounts four times. The screen explains it well when
   it happens (an orange note with a link to the first half); the guide's steps 1–4 do
   not plan for it.
7. **"Create period" defaults to the current month.** The form opened on November;
   the October periods had to be changed by hand.
8. **Payslip numbers HR is likely to question, with nothing to explain them:**
   - A person on sick leave and holiday in October still shows "วันทำงาน 21".
   - Social security is ฿248 in the first half and ฿247 in the second on the same
     wage (the month adds up to ฿495).
   - Daily staff count 23 Oct (a public holiday) among their 11 paid days because the
     synthetic file has scans that day; monthly staff show 21 days with it left out.
     Whether a scan on a public holiday should pay a holiday rate is a question for the
     PO and Dev rooms, not a UX finding.
9. **The month compare result appears below the fold**, with nothing saying which
   file it compared. The tester thought nothing had happened at first.

### Light

10. **Printed PDFs have random names** (for example `654f33f0-….pdf`); the slips,
    receipt sheet and cash sheet of a period cannot be told apart in Downloads.
11. **"เลขสแกนยังไม่มีเจ้าของ 2" counts days, not numbers.** There was one number on
    two days; the page after import says "1 เลข".
12. **Registering 777 needs a second picker.** Typing a name shows a new "เลือก…" box
    underneath instead of a list under the field; the leave form does show a list.
13. **The receipt sheet says "ตามจำนวนที่ระบุไว้ข้างต้น"** above the table, where
    nothing is above it. The guide already asks the accountant to confirm the wording.
14. **Small wording:** "ประเภทการจ้าง FULL_TIME" on the employee page; the
    verification code field's grey placeholder "123456" looks filled in at a glance.

### What worked

- Sign-in with the 6-digit code matched the guide's new section exactly.
- Import, the summary's single-scan count, the review page and the decisions read as
  the guide describes. The pictures the tester held against the screen (hr-01, hr-11,
  hr-14, hr-15) matched it.
- The "ตรวจก่อนอนุมัติ" box on the second half named the one incomplete day
  ([05](blind-test-2026-11-04/05-check-before-approve.png)), as CW-106 meant.
- The compare page read the register's three-row heading and the added `รหัสพนักงาน`
  column, skipped the total row, and marked exactly the changed person.
- The orange note when the second half waits for the first, and the cash sheet's note
  of 0.53 baht left over, were clear without the guide.

## Not findings

- **A Thai file name made the compare upload do nothing.** It was the test browser:
  Playwright handed the file from a path with Thai characters and the page never
  received it, so no request was sent. The same file given to the page under the
  same Thai name, without the path, uploaded and compared normally (HTTP 200). The
  page's code does not look at the file name. Worth one try on a real office PC, not
  a defect.
- **The guide does not say to export the register from Cwork.** It is not meant to:
  step 5 compares with the register HR made the old way. The test brief asked the
  tester to export Cwork's own register as the "HR sheet" because the test has no old
  sheet, so the friction it noted (no employee codes, no formulas, blank cells against
  "ช่องว่างไม่ถือเป็น 0") is about using Cwork's file in that role. One point does carry
  over: the guide's "every cell filled, a blank is not 0" made the tester wonder
  whether to fill blank columns, and the upload accepted them.
- **The owner approving a run with his own payslip** comes from the test data (the
  owner's employee record was made a daily-paid worker for the test). Observations
  about who may decide or approve what were sent to the PO room separately.
- **Pending leave requests in October** (two from the seed) were not cleared before
  the run; the guide does not ask for it, and the run did not warn.
