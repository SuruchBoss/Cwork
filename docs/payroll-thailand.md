# Payroll: Thai rules

> **No qualified person has reviewed these rules.**
>
> They were written from published sources — the Revenue Code, the Social
> Security Act, Revenue Department guidance — and unit-tested against
> hand-worked examples. That proves the code computes what its author believed
> the rules to be. It does not prove the belief is correct, and no accountant,
> tax agent or payroll professional has checked it.
>
> So: **this is not tax advice**, the engine implements the common
> salaried-employee case, and the figures need verifying against your own
> before a real run. Rates change; the rule set is data (`THAI_TAX_RULES_2026`)
> so a change is a config edit plus a test case, not a rewrite.
>
> If you have the standing to review this properly, please do —
> [issue #36](https://github.com/SuruchBoss/Cwork/issues/36) is open for it.

Implementation: `backend/src/modules/payroll/domain/thai-tax.ts`.
Tests: `thai-tax.spec.ts` (28 cases, hand-verified bracket arithmetic).

## Personal income tax

Order of operations, per the Revenue Code:

1. **Employment expense deduction** — 50% of income, capped at ฿100,000.
2. **Allowances** — personal, family, insurance, retirement funds, social
   security, mortgage interest.
3. **Donations** — capped at 10% of income *after* steps 1 and 2.
4. **Progressive brackets** on what remains.

### Brackets (2026)

| Net taxable income (฿) | Rate |
|---|---|
| 0 – 150,000 | exempt |
| 150,001 – 300,000 | 5% |
| 300,001 – 500,000 | 10% |
| 500,001 – 750,000 | 15% |
| 750,001 – 1,000,000 | 20% |
| 1,000,001 – 2,000,000 | 25% |
| 2,000,001 – 5,000,000 | 30% |
| over 5,000,000 | 35% |

### Allowances

| Allowance | Amount | Cap |
|---|---|---|
| Personal | ฿60,000 | — |
| Spouse (no income) | ฿60,000 | — |
| Child | ฿30,000 each | — |
| 2nd+ child born 2018 or later | ฿60,000 | applies from the second child only |
| Parent care (60+, low income) | ฿30,000 each | max 4 parents |
| Disabled/incapacitated care | ฿60,000 each | — |
| Life insurance | actual | ฿100,000 |
| Health insurance | actual | ฿25,000, inside the ฿100,000 combined insurance cap |
| Parent health insurance | actual | ฿15,000 |
| Provident fund | actual | 15% of income, ฿500,000 |
| RMF | actual | 30% of income |
| SSF | actual | 30% of income, ฿200,000 |
| PVD + RMF + SSF combined | — | ฿500,000 |
| Social security | actual | ฿9,000/year to 2025, ฿10,500 for 2026 (see below) |
| Mortgage interest | actual | ฿100,000 |
| Donations | actual | 10% of income after other deductions |
| Education donations | 2× the amount | still inside the 10% cap |

### Monthly withholding

The Revenue Department's projection method: estimate the year's income from this
month's *regular* pay, compute the annual tax, and withhold the outstanding
balance spread over the remaining months. This keeps December from carrying a
large correction.

Bonuses are added to the projection **once**, not annualised — otherwise a
฿60,000 bonus in January would project as ฿720,000 of extra income and withhold
wildly too much.

### Mid-year go-live

If you start using this system partway through a tax year, import what the old
system paid this year before your first run: **Payroll → Import pay before
Cwork** (CW-059). One row per employee: taxable income, tax withheld and the
employee's social security from January to the last month paid elsewhere.
Without them the projection only sees income from this system, under-projects
the annual salary, and withholds too little — which lands on the employee as a
bill the following March. With them, September withholds exactly what it would
have if January to August had run here; a test holds that to the baht.

Those months are **your own**: the annual filings (ภ.ง.ด.1ก, 50 ทวิ) report
them as this employer's income and tax. That is the difference from the tax
profile's `priorEmployerIncome` / `priorEmployerTax`, which are for pay from an
employee's *previous* employer earlier in the year. Both feed the projection;
only yours are yours to file. Each payslip records the split in
`snapshot.yearToDate`.

Once imported, a month the figures cover cannot be calculated again in Cwork
(`PAID_BEFORE_CWORK`), and a file cannot cover a month Cwork has already paid.

## Social security (มาตรา 33)

5% of wage, with the wage floored at ฿1,650 and capped at a monthly ceiling
that depends on the year the period falls in. The employer matches it.

**Rounded to a whole baht, and a wage under the floor is worked on the floor**
(CW-084). The form in use from 1 January 2026, สปส.1-10 part 2, is fixed by the
Social Security Office's announcement on the form of returns, how to file them
and how to send in contributions (No. 2) B.E. 2568, Royal Gazette vol. 142,
special part 405 Ngor, 30 December 2025, pp. 23–27, which replaces the 2018
form. Its notes under the table say:

- note 1: a wage under the floor (฿1,650) is worked out on the floor, and over
  the ceiling on the ceiling (฿17,500 for 2026–2028, ฿20,000 for 2029–2031 and
  ฿23,000 from 2032, the same table as below);
- note 3: a foreign worker is filed under the social security card number, in
  the national ID column;
- note 4: each person's contribution, if it has 50 satang or more, is rounded
  up to the baht, and under 50 satang down; the employer sends in the same
  rounded amount as the insured person's;
- note 6: an insured person with no wage that month is still listed, with a
  wage and a contribution of nil.

So a wage of ฿5,010 gives ฿251 for each side (250.50 up), a wage of ฿1,200 gives
฿83 (1,650 × 5% = 82.50 up), and ฿20,000 in 2026 gives ฿875. A month in which
nothing was paid contributes nothing. One function, `computeSocialSecurity`,
gives a person's monthly contribution; payslips, the half-month split, the
shortfall report and the monthly filing all use it, because what is withheld
has to equal what is filed. In a half-month month the first half takes 5% of
its own wage up to the ceiling, in whole baht and with no floor (the floor is
monthly), and the second half takes the month's figure less the first half, so
the two always add up to what a monthly run would have deducted. A run that was
already approved or paid is never recalculated; a month paid before this change
was worked in satang, and the shortfall report shows the difference.

Whether the accountant agrees with the rounding, the floor and the nil month is
asked in issue #36.

| Year | Wage ceiling | Most a month |
|---|---|---|
| to 2025 | ฿15,000 | ฿750 |
| 2026 – 2028 | ฿17,500 | ฿875 |
| 2029 – 2031 | ฿20,000 | ฿1,000 |
| 2032 on | ฿23,000 | ฿1,150 |

The floor stays ฿1,650 (฿83) throughout. Each period uses the row for its own
year (`taxRulesFor(year)`, `SOCIAL_SECURITY_CEILINGS`), so a December 2028 run
deducts at most ฿875 and a January 2029 run at most ฿1,000; a change of
ceiling is a new row in the table, not a code change.

There is **no annual stop**. Before CW-075, contributions stopped once an
employee had paid ฿9,000 in the year. That figure is twelve months at the old
฿750 maximum, not a rule of the Act: a monthly ceiling already limits the
year, and with the 2026 ceiling a stop at ฿9,000 would have skipped December
for anyone at the top.

**Source.** Ministerial regulation on the wage used to compute contributions
(กฎกระทรวงกำหนดค่าจ้างที่ใช้เป็นฐานในการคำนวณเงินสมทบ), signed 11 December
2025, Royal Gazette vol. 142, part 81 Kor, 12 December 2025, pp. 5–6, clause 3:
<https://ratchakitcha.soc.go.th/documents/98728.pdf>. The product owner read
the steps, the floor and the 1 January 2026 start in that text. The 5% rate is
set elsewhere and is unchanged.

**Income tax relief.** What an employee may deduct for social security is its
own figure (`SOCIAL_SECURITY_RELIEF_CAPS`), not twelve times the contribution:
฿9,000 to 2025 and ฿10,500 for 2026. The ฿10,500 has been read only in
secondary sources so far, not in a Revenue Department notice. A later year
keeps the last known figure until the Revenue Department publishes its own;
the relief is still the lower of what was actually paid and the cap.

### Runs paid before Cwork knew the new ceiling

Cwork 0.4 and earlier deducted on ฿15,000 for 2026, so every 2026 payslip
above ฿15,000 took up to ฿125 too little from the employee, and as much again
from the employer. Those runs stay as they were: a locked or paid run is never
recalculated or changed (the owner's decision).

Instead, **Payroll → Social security shortfall** (`payroll:export`: HR admin
and payroll officers) lists, for a year, what each locked or paid run deducted
against what the ceiling for that year gives:

- one row per employee and month, with the two halves of a semi-monthly month
  added together and the ceiling applied once to their wages;
- the wage, what the employee and employer paid, what the ceiling gives, and
  the employee's and employer's difference; rows that come out even are left
  out;
- totals per month and for the year, and a CSV download in Thai or English,
  recorded in the audit log;
- runs that count: paid runs, and runs in a locked or closed period that were
  not cancelled; open periods and their calculated runs are left out;
- a payslip whose compensation was not covered by social security is skipped;
- the wage is the one stored on the payslip. A payslip calculated before
  CW-069 did not store it; for those it is rebuilt from the payslip's base pay
  and the earnings flagged as counting towards social security, and the row
  says so.

It writes nothing. It is not a filing: how and when the difference is paid to
the Social Security Office, and whether the employee's share is taken back,
is for HR to settle. A year with no locked or paid run gives an empty report.

## Overtime

Multipliers from the Labour Protection Act, applied to the hourly rate:

| Situation | Multiplier |
|---|---|
| Overtime on a normal working day | 1.5× |
| Work on a weekly day off (normal hours) | 1× extra |
| Work on a public holiday | 2× |
| Overtime on a public holiday | 3× |

Override them per organisation in `settings.overtime`.

The hourly rate follows Thai practice: monthly salary ÷ 30 days ÷ standard
working hours per day.

**Payable overtime is always the *approved* hours, never raw clock time.** The
attendance record tracks both: `overtimeMinutes` (what the clock says) and
`approvedOvertimeMinutes` (what payroll pays).

Employees whose compensation record has `isOvertimeEligible: false` — commonly
executives and managers under Thai law — cannot submit overtime at all.

## Salary proration

A monthly-salaried employee is paid the **full month, minus explicit
deductions**:

```
payableDays = employeeWorkingDays − unpaidLeaveDays − absentDays
```

where `employeeWorkingDays` clips the payroll period to the employee's actual
employment dates, so a mid-month joiner or leaver is prorated on the calendar.

Note what this deliberately does *not* do: it does not prorate by how many
attendance records exist. Days that simply have not been closed out yet — future
dates in the period, or a clock-in rollout still in progress — must not reduce
pay. Getting this wrong silently shorts people's salary, which is the worst
class of payroll bug because nobody notices until they do.

## Daily wages paid twice a month

Added for the second pilot (CW-069). Implementation:
`backend/src/modules/payroll/domain/daily-wage.ts` and the half-month branches
of `payroll-calculator.ts`; tests: `semi-monthly.spec.ts` (hand-worked
figures) and `test/payroll-semi-monthly.e2e-spec.ts`.

> The pilot's own Excel workbook has not arrived, so none of this has been
> compared with the figures the pilot pays today. The examples in the tests are
> worked by hand.

### Who is paid this way

An employee whose compensation has a `dailyRate` is a daily-wage employee. The
salary must then be 0, and the pay frequency `SEMI_MONTHLY`: the API refuses a
daily rate with a salary, a daily rate on any other frequency, and
`SEMI_MONTHLY` without a daily rate. Frequencies other than `MONTHLY` and
`SEMI_MONTHLY` (`DAILY`, `WEEKLY` and the rest) are refused until Cwork pays
them.

A semi-monthly month has two periods, half 1 and half 2 (codes `YYYY-MM-H1`
and `YYYY-MM-H2`); a monthly month has one. The database allows at most one
monthly period per month and one of each half. A half's run pays only the
daily-wage employees; a monthly run pays everyone else.

### Days paid

For each day of the half the employee was employed:

| The day | Paid |
|---|---|
| Worked: present, late or left early | 1 day, less any unpaid leave taken that day |
| Worked, but the punch is incomplete | 1 day, **and flagged** for HR on the payslip |
| Paid leave (sick, annual, personal business…) | its portion: ½ for a half day |
| A paid public holiday on a scheduled working day | 1 day |
| The weekly day off, an absence, unpaid leave | 0 |
| A scheduled day with no attendance and no leave | 0, **and flagged**: usually a day not closed yet |
| A public holiday on the weekly day off | 0 on the day itself: it is paid on its substitute day (below) |
| A substitute day | 1 day, as a holiday, **and listed** for HR; if attended, **flagged** too |

The working days are the employee's schedule; with no schedule assigned, Monday
to Friday, the same default the overtime engine uses. Holidays are those marked
paid for the whole organisation or for the employee's work location.

Pay is the daily rate times the days paid. It is not prorated: the days are
the proration.

### Substitute holidays

A traditional holiday that falls on the employee's weekly day off moves to
one of their working days (section 29, third paragraph). One work calendar
decides this for every employee and day (CW-081), and attendance, leave,
overtime and both kinds of payroll run use its answer:

- **The day.** If HR marked a later holiday row as the substitute for the
  holiday (the holiday page, or `substituteForId`), that day is used for
  everyone whose day off the holiday fell on, as long as it is one of their
  working days. Otherwise it is the next working day of their own schedule
  (and any day-by-day roster change) that is neither a holiday nor already
  another holiday's substitute; two holidays on days off in a row take the
  next two. A row marked as a substitute is not a holiday of its own: for
  someone the holiday did not fall on a day off, it is an ordinary working day.
  The holiday page shows where each weekend holiday lands for a
  Monday-to-Friday week.
- **Attendance** reads a substitute day as a holiday, so the nightly close-out
  does not mark anyone absent on it. **Leave** on it takes nothing.
  **Overtime** asked for on it is holiday work.
- **A daily-wage half** pays it once, as a holiday, whether or not the employee
  came in, and lists each holiday and its substitute on the payslip
  (`SUBSTITUTE_HOLIDAY`). The substitute can fall in the next half or come from
  a holiday in the last; the calendar looks a month either side. If the
  employee leaves before a working day comes, the holiday is owed but not paid,
  and flagged (`HOLIDAY_ON_DAY_OFF`) for the final pay.

### Overtime and rest-day work

Overtime is paid on the hourly rate of the day: daily rate ÷ standard hours per
day (8). A salaried employee's is still salary ÷ 30 ÷ 8 (section 68 sets this
for monthly wages; it says nothing of daily ones).

Each overtime request carries the organisation's multiplier for its type,
which is set for salaried staff. A monthly salary already pays the weekly day
off, so section 62(1) asks only one more times the hourly rate for work on it.
A daily-wage employee is not paid for the weekly day off (section 56(1)), so
section 62(2) asks at least **twice** the hourly rate; a traditional holiday is
paid to them (section 56(2)), so work on it is at least one more times, on top
of the day. A half's run raises any lower multiplier to these and says so on
the payslip (`REST_DAY_RATE_RAISED`); the request keeps its own rate.

| Daily-wage employee's work | At least | Cwork |
|---|---|---|
| On the weekly day off, within normal hours | 2× the hourly rate (s.62(2)) | raised to 2× if the request is lower |
| On a traditional holiday, within normal hours | the day's wage + 1× (s.62(1)) | the holiday is in the days paid; the request's rate, raised to 1× if lower |
| Overtime on a working day | 1.5× (s.61) | the organisation's rate |
| Overtime on a holiday | 3× (s.63) | the organisation's rate |

So four hours on a Saturday off at 500 a day are 4 × 62.50 × 2 = 500, not the
250 a 1× request would have paid. Monthly employees' pay does not change.

### Social security in two halves

- **First half:** 5% of the half's wage, capped at the monthly ceiling, with
  **no floor**. The floor is a monthly figure: half a month under it can still
  be a month over it.
- **Second half:** the whole month's contribution, with the floor and the
  ceiling applied once to the two halves' wages together, less what the first
  half took. Never negative.

So the month always adds up to what a monthly run would deduct, to the satang.
The one exception is a month whose total ends under the floor after the first
half has already contributed: the month owes nothing, the second half takes
nothing, and the payslip shows HR the amount the first half took over
(`SSO_OVER_IN_FIRST_HALF`). Cwork does not refund it by itself.

Each half uses the ceiling for the year its month falls in.

### Withholding in two halves

- **First half:** estimates the month as twice the half, works out that month's
  withholding by the usual projection (below), and withholds half of it.
- **Second half:** works out the month's withholding on the two halves
  together, and withholds that less what the first half withheld. Never
  negative: if the first half withheld more, the second withholds nothing and
  the payslip shows HR the difference (`WITHHOLDING_OVER_IN_FIRST_HALF`).

Both halves project from the months *before* this one, including months paid
before Cwork (the opening balance) and a previous employer's pay, exactly as a
monthly run does. The first half is added to the month, not to the year so far.

The second half is worked out from the first, so it cannot be calculated until
the first half's run is **paid** (`FIRST_HALF_NOT_PAID`). Paid, not just
approved, also because marking a run paid is what marks the expense claims it
paid; a second half calculated earlier would pay them again.

### Monthly items

Benefit premiums (employee and employer share) and standing allowances and
deductions are monthly amounts, charged on the **second half** only.

### Minimum wage

Cwork keeps no table of minimum wages: they differ by province, district and
business type, and change by announcement. HR enters the daily minimum on each
work location with the Wage Committee announcement it came from (both
required together). A daily rate is checked against it when the rate is set
and again when a half is calculated, and the payslip says so if the rate is
under it (`BELOW_MINIMUM_WAGE`), if the location has none set
(`MINIMUM_WAGE_NOT_SET`), or if the employee has no work location
(`NO_WORK_LOCATION`). These are warnings, not refusals.

### What HR sees

Every payslip carries `warnings`: `{ code, params }` objects the run page shows
beside the employee. The codes above, plus `INCOMPLETE_PUNCH_COUNTED` and
`NO_ATTENDANCE_RECORD`. Payslips calculated before CW-076 may still carry
`REST_DAY_WORK_RATE`, which asked HR to check a rest-day rate by hand, and
`HOLIDAY_ON_DAY_OFF` in its older sense, which asked HR to add the substitute
day; recalculating the run replaces both.

### Legal basis, and how far it has been checked

The rules above were set by the product owner from the Labour Protection Act
B.E. 2541 and checked against two texts the owner supplied, kept outside this
repository:

- **As first published:** ราชกิจจานุเบกษา เล่ม ๑๑๕ ตอนที่ ๘ ก, 20 February 1998
  (2541), read by the PO on 2026-10-10.
- **Consolidated to amendment No. 7 (2019):** the Office of the Council of
  State's text (สำนักงานคณะกรรมการกฤษฎีกา), 49 pages, read from its page images.
  A section amended by a later Act carries a footnote there; the sections
  below carry none, so their 1998 wording stands to 2019.

The rules are checked against the consolidated text to 2019 only. Amendments
after 2019, if there are any, are not checked.

| Rule | Section | Consolidated text, page | Checked |
|---|---|---|---|
| A traditional holiday on the weekly day off moves to the next working day | s.29 | 8–9 | read by the dev on 2026-10-11 |
| A daily-wage employee is paid for traditional holidays and annual leave, not for the weekly day off | s.56 | 14 | read by the PO on 2026-10-10 (1998 text p.13–14) and the dev on 2026-10-11 |
| Overtime on a working day: at least 1.5× | s.61 | 14 | read by the dev on 2026-10-11 |
| Work on a holiday: at least 1× more for an employee paid for the day, at least 2× for one who is not | s.62 | 14–15 | read by the PO on 2026-10-10 (1998 text p.14) and the dev on 2026-10-11 |
| Overtime on a holiday: at least 3× | s.63 | 15 | read by the dev on 2026-10-11 |
| A monthly employee's hourly rate is the month ÷ (30 × normal daily hours) | s.68 | 16 | read by the PO on 2026-10-10 (1998 text p.16) and the dev on 2026-10-11 |
| Repaying a cash advance is not among the deductions from wages s.76 allows; consent to a deduction must be written, signed and name its purpose (CW-078) | s.76, s.77 | 17–18 | read by the PO on 2026-10-10 |

### Known gaps

- **Working days for a salaried run's proration.** A monthly run still counts
  the period's working days as Monday to Friday less the organisation's
  holidays, for prorating a joiner or a leaver and for the value of an unpaid
  day; it does not use each employee's work calendar, so a substitute day
  counts as a working day there. Attendance (and so absences) does use it.
- **Days already derived.** Attendance closed before the upgrade, and leave
  requested before it, keep the answer they were given; recalculating a day or
  re-submitting the leave applies the work calendar.
- **Statutory floors for everyone.** Only a daily-wage employee's rest-day
  work is raised to the statutory minimum. Every other overtime rate, and every
  rate for salaried staff, is the organisation's setting, trusted as entered.
- A salary paid in two halves is not supported; only daily wages are.
- Opening balances are monthly. A company cannot start in Cwork with the
  second half of a month: the second half needs a paid first half.
- The assistant's run variance compares a half with the latest signed-off
  run of an earlier month, whichever cycle that was, not with the previous
  half; the export files treat a half like any period. Both are deferred.

## Cash advances

An advance (เบิกล่วงหน้า, CW-070) is money paid before payday, recorded by
someone with `payroll:run` once it has been paid: who, how much, the day, and
whether in cash or by transfer. Its date cannot be in the future.

- **Which run.** A regular run takes back every advance still owed that was
  paid on or before the period's last day. So the run covering the day comes
  first: the half for a daily-wage employee, the month for everyone else. What
  that run could not take comes off the next, and an advance recorded late for
  a period already paid comes off the next run rather than being lost.
  Off-cycle, bonus and final-settlement runs do not take advances.
- **Order.** After tax, social security, provident fund, benefit premiums and
  standing deductions. An advance is not income, so it changes none of them.
  Oldest advance first, each on its own payslip line naming the day it was
  paid.
- **Never below zero.** A run takes at most what the payslip would otherwise
  pay. The rest is carried, and the payslip carries an
  `ADVANCE_CARRIED_OVER` warning with the amount for the run page.
- **What is owed** is never stored: it is the amount less what payslips in runs
  that were not cancelled or failed have deducted. A cancelled run gives back
  what it took; a recalculated run takes it again.
- **Changing one.** An advance can be changed or cancelled until an approved or
  paid run has taken it back (`ADVANCE_LOCKED`). If it changes while a run that
  takes it back is only calculated, that run cannot be approved until it is
  calculated again (`ADVANCES_CHANGED_SINCE_CALCULATION`). A cancelled advance
  stays on record, and every change is audited.
- **Sections 76 and 77** (CW-078, read in the consolidated text to 2019).
  Section 76 allows deductions from wages, overtime and holiday pay only for
  tax and other sums a law requires, union dues, debts to a savings
  cooperative or welfare scheme, a guarantee deposit or damages for wilful or
  grossly negligent harm, and provident fund contributions; the last four are
  capped at 10% each and one fifth together of a payday's pay unless the
  employee consents. Repaying an advance is not on that list. Taking it back on
  the payday it belongs to is arguably the same wage paid early, but taking a
  carried balance from a later payday may need the employee's consent, which
  section 77 says must be written, signed and state its purpose. Cwork does not
  keep that consent, so HR must, and the run page's carry-over warning says
  so. Whether the deduction is allowed, under which item and with what cap is
  on the list in [issue #36](https://github.com/SuruchBoss/Cwork/issues/36)
  for a qualified reviewer.
- **Not yet handled.** An employee who leaves still owing an advance stays on
  the list, marked as having left, but the final-settlement run does not take
  it back, so HR settles it by hand.
- **Who records them.** `payroll:run`, which the payroll officer, HR admin and
  super admin roles hold. An HR officer who records advances can be given the
  payroll officer role as well, from the employee's page (CW-079).
- **The payslip line** is coded `CASH_ADVANCE` (CW-078), not `ADVANCE`, which
  the demo seed gives to a standing deduction.

## Leave

Statutory minimums seeded by default:

| Type | Statutory minimum | Seeded default |
|---|---|---|
| Annual leave (พักร้อน) | 6 days after 1 year | seniority-tiered 6 → 15 |
| Sick leave (ลาป่วย) | paid up to 30 days/year | 30, medical certificate after 3 days |
| Personal business (ลากิจ) | 3 days paid | 3 |
| Maternity (ลาคลอด) | 98 days | 98 |
| Military service | 60 days paid | 60 |
| Ordination (ลาอุปสมบท) | not statutory | 15, after 1 year of service |

Weekends and public holidays inside a leave range are **excluded**, not charged.
Taking the whole Songkran week (Mon–Fri with three public holidays) costs 2 days
of annual leave, not 5 — verified end to end.

## Payslip reproducibility

Every payslip stores a snapshot of the inputs it was computed from: the
compensation record, working days, payable days, tax allowances and overtime
lines. A disputed payslip from a year ago can be recomputed and explained
without reconstructing what the data looked like then.

The database also enforces the arithmetic:

```sql
CHECK ("netPay" = "grossEarnings" - "totalDeductions")
```

A bug that makes a payslip not add up cannot be written to disk.

## Not implemented

- **ภ.ง.ด.1 / ภ.ง.ด.91 filing exports** — the data is all there; the file
  formats are not generated.
- **50 ทวิ certificate generation** — the document request workflow exists and
  assembles the data; rendering the PDF is not built.
- Severance pay calculation and its separate tax treatment.
- Multiple employers within one tax year, beyond the prior-employer fields.
- Foreign-sourced income and expatriate tax treaties.
