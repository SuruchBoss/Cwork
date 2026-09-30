-- Leave taken this year before the organisation moved to Cwork (CW-059).
--
-- A company that starts mid-year has employees who took leave months ago in
-- another system. Their balances in Cwork have to count it from the first day,
-- or the first request after go-live is approved against days already spent.
-- Kept apart from "used", which is what Cwork itself approved, so the two can
-- be told apart and the import can set its figure without touching Cwork's.

-- AlterTable
ALTER TABLE "leave_entitlements" ADD COLUMN "priorUsed" DECIMAL(8,2) NOT NULL DEFAULT 0;
