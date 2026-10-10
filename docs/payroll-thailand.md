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
Tests: `thai-tax.spec.ts` (27 cases, hand-verified bracket arithmetic).

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
| Social security | actual | ฿9,000/year |
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

5% of wage, with the wage floored at ฿1,650 and capped at ฿15,000/month — so
the contribution is between ฿83 and ฿750. The employer matches it. The annual
employee ceiling is ฿9,000; once reached, contributions stop for the year.

Both the floor and the annual ceiling are implemented and tested.

> **The ceiling has changed and Cwork has not.** A ministerial regulation on the
> contributory wage for มาตรา 33, published in December 2025, is reported to
> raise the monthly ceiling to ฿17,500 from 1 January 2026 (a ฿875
> contribution), ฿20,000 from 2029 and ฿23,000 from 2032, with the ฿1,650
> floor unchanged. That has been read only in secondary reports so far, not in
> the Royal Gazette itself, and updating the rule set (and the annual ceiling
> that follows from it) is tracked as its own change because it moves every
> monthly run.

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
| A public holiday on the weekly day off | 0, **and flagged**: see substitute days below |

The working days are the employee's schedule; with no schedule assigned, Monday
to Friday, the same default the overtime engine uses. Holidays are those marked
paid for the whole organisation or for the employee's work location.

Pay is the daily rate times the days paid. It is not prorated: the days are
the proration.

Overtime is paid on the hourly rate of the day: daily rate ÷ standard hours per
day (8). A salaried employee's is still salary ÷ 30 ÷ 8.

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

The annual employee ceiling limits either half the same way it limits a month.

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
beside the employee. The codes above, plus `INCOMPLETE_PUNCH_COUNTED`,
`NO_ATTENDANCE_RECORD`, `HOLIDAY_ON_DAY_OFF` and `REST_DAY_WORK_RATE` (below).

### Legal basis, and how far it has been checked

The rules above were set by the product owner from the Labour Protection Act
B.E. 2541. The build environment could not reach the Council of State's
database or the Royal Gazette, so the sections were checked against secondary
sources only, and still need reading in the official text:

| Rule | Section | Checked |
|---|---|---|
| A daily-wage employee is paid for traditional holidays and annual leave, not for the weekly day off | s.56 | secondary sources agree |
| Work on a holiday: one more times the hourly rate for an employee paid for the day, at least twice for one who is not | s.62 | secondary sources agree |
| A traditional holiday on the weekly day off is replaced by the next working day | s.29 | not yet found in a source |
| The hourly rate for overtime of a daily-wage employee | s.68 | not yet found in a source |

### Known gaps

- **Substitute holidays.** The holiday table has no notion of a substitute
  day. When a public holiday falls on an employee's weekly day off, Cwork pays
  nothing for it and flags it (`HOLIDAY_ON_DAY_OFF`); HR has to enter the
  substitute day as a holiday for it to be paid.
- **Holiday and day-off work by daily staff.** The overtime engine has one
  multiplier per type for everybody (day off 1×, holiday 2×). A daily-wage
  employee is not paid for the weekly day off, so work on it is owed at least
  twice the hourly rate, and holiday pay plus holiday work is owed differently
  again. Cwork does not apply a separate rate; a payslip with such hours is
  flagged (`REST_DAY_WORK_RATE`) for HR to check.
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
- **Not verified.** Taking the carried part from a later period may be a
  deduction from wages under section 76 of the Labour Protection Act, which
  needs the employee's written consent and caps the deduction. Nobody has read
  the official text yet (with sections 29 and 68, it is on the owner's list in
  CW-076), so the run page's carry-over warning says so rather than implying
  the deduction is settled law.
- **Not yet handled.** An employee who leaves still owing an advance stays on
  the list, but the final-settlement run does not take it back, so HR settles
  it by hand.

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
