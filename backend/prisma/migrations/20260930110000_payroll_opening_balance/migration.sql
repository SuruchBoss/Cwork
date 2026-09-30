-- Pay this employer gave each employee earlier in the tax year, before the
-- organisation moved to Cwork (CW-059).
--
-- A company that starts in September paid January to August somewhere else.
-- Withholding projects the year from year-to-date figures, so without those
-- months September withholds too little; and the annual filings (ภ.ง.ด.1ก,
-- 50 ทวิ) report the whole year as this employer's. That is why these are not
-- the tax profile's "priorEmployerIncome", which is another employer's pay.

-- CreateTable
CREATE TABLE "payroll_opening_balances" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "throughMonth" INTEGER NOT NULL,
    "taxableIncome" DECIMAL(18,4) NOT NULL,
    "withholdingTax" DECIMAL(18,4) NOT NULL,
    "ssoEmployee" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_opening_balances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_opening_balances_month_check" CHECK ("throughMonth" BETWEEN 1 AND 12),
    CONSTRAINT "payroll_opening_balances_amounts_check"
      CHECK ("taxableIncome" >= 0 AND "withholdingTax" >= 0 AND "ssoEmployee" >= 0)
);

-- CreateIndex
CREATE INDEX "payroll_opening_balances_organizationId_taxYear_idx" ON "payroll_opening_balances"("organizationId", "taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_opening_balances_employeeId_taxYear_key" ON "payroll_opening_balances"("employeeId", "taxYear");

-- AddForeignKey
ALTER TABLE "payroll_opening_balances" ADD CONSTRAINT "payroll_opening_balances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_opening_balances" ADD CONSTRAINT "payroll_opening_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
