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

If you start using this system partway through a tax year, enter each employee's
prior income and tax withheld into their tax profile
(`priorEmployerIncome` / `priorEmployerTax`). Without them the projection only
sees income from this system, under-projects the annual salary, and withholds
too little — which lands on the employee as a bill the following March.

## Social security (มาตรา 33)

5% of wage, with the wage floored at ฿1,650 and capped at ฿15,000/month — so
the contribution is between ฿83 and ฿750. The employer matches it. The annual
employee ceiling is ฿9,000; once reached, contributions stop for the year.

Both the floor and the annual ceiling are implemented and tested.

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
