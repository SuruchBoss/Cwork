-- Who last calculated a payroll run, so that person cannot approve it. Runs
-- calculated before this change have no value and keep their existing rule.

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN "calculatedById" UUID;
