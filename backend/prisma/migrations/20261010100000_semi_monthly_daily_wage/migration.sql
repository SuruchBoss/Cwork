-- Daily wages paid in two halves of the month (CW-069).

-- A payroll period is either the whole month or one half of a semi-monthly
-- month. `half` is never null so the unique key holds for monthly periods too.
ALTER TABLE "payroll_periods" ADD COLUMN "payFrequency" "PayFrequency" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "payroll_periods" ADD COLUMN "half" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "payroll_periods"
  ADD CONSTRAINT "payroll_periods_half_check"
  CHECK (("payFrequency" = 'MONTHLY' AND "half" = 0)
      OR ("payFrequency" = 'SEMI_MONTHLY' AND "half" IN (1, 2)));

-- Two periods for one month were possible before (only the code was unique).
-- Say which ones instead of failing on the index with a bare duplicate-key error.
DO $$
DECLARE
  clash TEXT;
BEGIN
  SELECT string_agg(codes, '; ') INTO clash FROM (
    SELECT string_agg("code", ', ' ORDER BY "code") AS codes
    FROM "payroll_periods"
    GROUP BY "organizationId", "payFrequency", "year", "month", "half"
    HAVING count(*) > 1
  ) duplicates;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'More than one monthly payroll period covers the same month: %. Merge or remove the extra periods, then run this migration again.', clash;
  END IF;
END $$;

CREATE UNIQUE INDEX "payroll_periods_organizationId_payFrequency_year_month_half_key"
  ON "payroll_periods"("organizationId", "payFrequency", "year", "month", "half");

-- What HR should check before approving a payslip.
ALTER TABLE "payslips" ADD COLUMN "warnings" JSONB NOT NULL DEFAULT '[]';

-- The minimum daily wage at a work location, with the announcement it came from.
ALTER TABLE "work_locations" ADD COLUMN "minimumDailyWage" DECIMAL(18,4);
ALTER TABLE "work_locations" ADD COLUMN "minimumDailyWageSource" TEXT;
