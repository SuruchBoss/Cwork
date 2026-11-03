-- Daily wages paid every 14 days (CW-101). A 14-day period is numbered within
-- the month it counts toward; a month has two or three of them, so the check
-- on `half` allows more than the two halves of a semi-monthly month. Periods
-- already made are unchanged.
ALTER TABLE "payroll_periods" DROP CONSTRAINT "payroll_periods_half_check";
ALTER TABLE "payroll_periods"
  ADD CONSTRAINT "payroll_periods_half_check"
  CHECK (("payFrequency" = 'MONTHLY' AND "half" = 0)
      OR ("payFrequency" = 'SEMI_MONTHLY' AND "half" IN (1, 2))
      OR ("payFrequency" = 'BIWEEKLY' AND "half" BETWEEN 1 AND 5));
