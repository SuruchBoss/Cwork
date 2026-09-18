-- Bind an account to a device for attendance (CW-024).
--
-- The two `DROP INDEX` statements Prisma generated here have been removed by
-- hand: they target the hand-written search indexes from
-- `20260915030000_search_and_integrity` (knowledge_chunks_content_trgm_idx and
-- knowledge_chunks_embedding_hnsw), which Prisma does not model and so reports
-- as drift on every generated migration. See
-- docs/operations.md#migrations-and-the-drift-trap, and run `npm run db:verify`
-- after applying this.

-- CreateEnum
CREATE TYPE "DeviceBindingStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "employee_devices" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceModel" TEXT,
    "status" "DeviceBindingStatus" NOT NULL DEFAULT 'ACTIVE',
    "boundByUserId" UUID,
    "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_devices_employeeId_status_idx" ON "employee_devices"("employeeId", "status");

-- CreateIndex
CREATE INDEX "employee_devices_organizationId_idx" ON "employee_devices"("organizationId");

-- AddForeignKey
ALTER TABLE "employee_devices" ADD CONSTRAINT "employee_devices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_devices" ADD CONSTRAINT "employee_devices_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
