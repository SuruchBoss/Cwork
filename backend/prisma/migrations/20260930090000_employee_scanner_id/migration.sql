-- An employee's user number on the fingerprint scanner (CW-059, CW-061).
--
-- Imported punches carry the scanner's number for a person, never their name,
-- so each employee can hold the one the scanner knows them by. Text, because a
-- scanner that zero-pads writes "007", and that is not the same key as "7".
-- Unique within an organisation: two people behind one number would put one
-- person's punches on the other's record. NULLs do not collide, so employees
-- who never use the scanner need nothing.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "scannerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_scannerId_key" ON "employees"("organizationId", "scannerId");
