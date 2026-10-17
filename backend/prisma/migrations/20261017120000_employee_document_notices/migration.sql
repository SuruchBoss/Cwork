-- Which expiry window of which employee document HR has been told about (CW-073).
-- One row per employee, document, expiry date and window; it holds no document
-- number. Nothing existing changes.

-- CreateTable
CREATE TABLE "employee_document_notices" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "document" TEXT NOT NULL,
    "expiresOn" DATE NOT NULL,
    "window" INTEGER NOT NULL,
    "noticedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_document_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_document_notices_organizationId_idx" ON "employee_document_notices"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_document_notices_employeeId_document_expiresOn_win_key" ON "employee_document_notices"("employeeId", "document", "expiresOn", "window");

-- AddForeignKey
ALTER TABLE "employee_document_notices" ADD CONSTRAINT "employee_document_notices_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
