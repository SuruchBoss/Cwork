-- Marks a decision about a scanner day that the decider made about their own
-- day, which is allowed only where nobody else may decide it.
ALTER TABLE "scanner_day_decisions" ADD COLUMN "ownDay" BOOLEAN NOT NULL DEFAULT false;
