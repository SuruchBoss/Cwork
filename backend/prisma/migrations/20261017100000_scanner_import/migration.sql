-- Fingerprint scanner imports (CW-061): the export files read, the raw days in
-- them, what HR decided about each day, and which punches of the append-only
-- stream came from which day. Nothing existing changes; a scanner number is
-- already on the employee (`employees.scannerId`).

-- CreateEnum
CREATE TYPE "ScannerDayDecisionAction" AS ENUM ('USE', 'IGNORE');



-- CreateTable
CREATE TABLE "scanner_imports" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "daysAdded" INTEGER NOT NULL,
    "daysChanged" INTEGER NOT NULL,
    "punchesAdded" INTEGER NOT NULL,
    "importedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanner_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanner_days" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scannerNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "times" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "employeeId" UUID,
    "firstImportId" UUID NOT NULL,
    "lastImportId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scanner_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanner_day_decisions" (
    "id" UUID NOT NULL,
    "scannerDayId" UUID NOT NULL,
    "action" "ScannerDayDecisionAction" NOT NULL,
    "clockIn" TEXT,
    "clockOut" TEXT,
    "timesAtDecision" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "decidedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanner_day_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanner_punch_links" (
    "punchId" UUID NOT NULL,
    "scannerDayId" UUID NOT NULL,
    "decisionId" UUID,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanner_punch_links_pkey" PRIMARY KEY ("punchId")
);

-- CreateIndex
CREATE INDEX "scanner_imports_organizationId_createdAt_idx" ON "scanner_imports"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "scanner_days_organizationId_workDate_idx" ON "scanner_days"("organizationId", "workDate");

-- CreateIndex
CREATE INDEX "scanner_days_employeeId_workDate_idx" ON "scanner_days"("employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "scanner_days_organizationId_scannerNumber_workDate_key" ON "scanner_days"("organizationId", "scannerNumber", "workDate");

-- CreateIndex
CREATE INDEX "scanner_day_decisions_scannerDayId_createdAt_idx" ON "scanner_day_decisions"("scannerDayId", "createdAt");

-- CreateIndex
CREATE INDEX "scanner_punch_links_scannerDayId_idx" ON "scanner_punch_links"("scannerDayId");

-- AddForeignKey
ALTER TABLE "scanner_imports" ADD CONSTRAINT "scanner_imports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_days" ADD CONSTRAINT "scanner_days_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_days" ADD CONSTRAINT "scanner_days_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_days" ADD CONSTRAINT "scanner_days_firstImportId_fkey" FOREIGN KEY ("firstImportId") REFERENCES "scanner_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_days" ADD CONSTRAINT "scanner_days_lastImportId_fkey" FOREIGN KEY ("lastImportId") REFERENCES "scanner_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_day_decisions" ADD CONSTRAINT "scanner_day_decisions_scannerDayId_fkey" FOREIGN KEY ("scannerDayId") REFERENCES "scanner_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_punch_links" ADD CONSTRAINT "scanner_punch_links_punchId_fkey" FOREIGN KEY ("punchId") REFERENCES "attendance_punches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_punch_links" ADD CONSTRAINT "scanner_punch_links_scannerDayId_fkey" FOREIGN KEY ("scannerDayId") REFERENCES "scanner_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
