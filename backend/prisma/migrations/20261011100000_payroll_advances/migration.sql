-- Cash advances, deducted from the regular runs that follow (CW-070).

CREATE TYPE "AdvanceMethod" AS ENUM ('CASH', 'BANK_TRANSFER');
CREATE TYPE "AdvanceStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "payroll_advances" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" "AdvanceMethod" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "recordedById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_advances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_advances_amount_check" CHECK ("amount" > 0)
);

-- What one payslip took back of one advance. A recalculated run deletes its
-- payslips, and with them what they deducted.
CREATE TABLE "payroll_advance_deductions" (
    "id" UUID NOT NULL,
    "advanceId" UUID NOT NULL,
    "payslipId" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_advance_deductions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_advance_deductions_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "payroll_advances_organizationId_employeeId_paidOn_idx" ON "payroll_advances"("organizationId", "employeeId", "paidOn");
CREATE INDEX "payroll_advance_deductions_payslipId_idx" ON "payroll_advance_deductions"("payslipId");
CREATE UNIQUE INDEX "payroll_advance_deductions_advanceId_payslipId_key" ON "payroll_advance_deductions"("advanceId", "payslipId");

ALTER TABLE "payroll_advances" ADD CONSTRAINT "payroll_advances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_advances" ADD CONSTRAINT "payroll_advances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_advance_deductions" ADD CONSTRAINT "payroll_advance_deductions_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "payroll_advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_advance_deductions" ADD CONSTRAINT "payroll_advance_deductions_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
