-- HR records leave on an employee's behalf (CW-067).
--
-- At a company where only HR uses Cwork, leave could not enter it at all:
-- a request could be filed only by the employee it was for. HR now files it
-- under a permission of its own, and the request keeps who entered it, so
-- the record says HR entered it and the employee was on leave.

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN "recordedByUserId" UUID;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Roles are copied into each organisation when it is set up, so the new
-- permission reaches installs that already exist only through this update.
-- It goes to the system roles that hold it in code; roles an organisation
-- created itself keep their own set.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'leave:record')
WHERE "isSystem" = true
  AND "key" IN ('SUPER_ADMIN', 'HR_ADMIN', 'HR_OFFICER')
  AND NOT ('leave:record' = ANY("permissions"));
