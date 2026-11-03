-- Reverses migration.sql (CW-109). Prisma does not run this file; it is the
-- hand-run way back, for a database that cannot be restored from a backup.
--
-- Each employee keeps the number they use now (the period with no end). Numbers
-- that have ended, and every start and end date, are lost: the old column holds
-- one number per employee and no dates.
ALTER TABLE "employees" ADD COLUMN "scannerId" TEXT;

UPDATE "employees" e
SET "scannerId" = n."scannerNumber"
FROM "employee_scanner_numbers" n
WHERE n."employeeId" = e."id" AND n."validTo" IS NULL;

-- Two periods with no end never share a number (they would overlap), so the
-- unique index below always builds.
CREATE UNIQUE INDEX "employees_organizationId_scannerId_key"
  ON "employees"("organizationId", "scannerId");

DROP TABLE "employee_scanner_numbers";
