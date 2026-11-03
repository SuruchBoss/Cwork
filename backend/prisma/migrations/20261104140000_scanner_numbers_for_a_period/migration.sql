-- A scanner number is bound to an employee for a period (CW-109), not for ever.
-- Every number in use moves across with no start (counted from the beginning)
-- and no end (still in use); the single column on employees goes.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TABLE "employee_scanner_numbers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "scannerNumber" TEXT NOT NULL,
    "validFrom" DATE,
    "validTo" DATE,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_scanner_numbers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_scanner_numbers_organizationId_scannerNumber_idx"
  ON "employee_scanner_numbers"("organizationId", "scannerNumber");
CREATE INDEX "employee_scanner_numbers_employeeId_idx"
  ON "employee_scanner_numbers"("employeeId");

ALTER TABLE "employee_scanner_numbers"
  ADD CONSTRAINT "employee_scanner_numbers_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "employee_scanner_numbers" ("id", "organizationId", "employeeId", "scannerNumber")
SELECT gen_random_uuid(), "organizationId", "id", "scannerId"
FROM "employees"
WHERE "scannerId" IS NOT NULL;

DROP INDEX "employees_organizationId_scannerId_key";
ALTER TABLE "employees" DROP COLUMN "scannerId";

-- Hand-written, as Prisma cannot model them (see db:verify).
-- A period ends no earlier than it starts.
ALTER TABLE "employee_scanner_numbers"
  ADD CONSTRAINT "employee_scanner_numbers_period_order_check"
  CHECK ("validFrom" IS NULL OR "validTo" IS NULL OR "validTo" >= "validFrom");

-- Two periods of one number never overlap, whoever asks and however many ask
-- at once: the second request is refused by the database.
ALTER TABLE "employee_scanner_numbers"
  ADD CONSTRAINT "employee_scanner_numbers_no_overlap"
  EXCLUDE USING gist (
    "organizationId" WITH =,
    "scannerNumber" WITH =,
    daterange("validFrom", "validTo", '[]') WITH &&
  );

-- An employee has at most one number in use now.
CREATE UNIQUE INDEX "employee_scanner_numbers_one_in_use_idx"
  ON "employee_scanner_numbers"("employeeId") WHERE "validTo" IS NULL;
