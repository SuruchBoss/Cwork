-- A foreign worker's passport and work permit (CW-068). The work permit number
-- is encrypted by the application like the passport number beside it.
ALTER TABLE "employees" ADD COLUMN "passportExpiresOn" DATE;
ALTER TABLE "employees" ADD COLUMN "workPermitNoEnc" TEXT;
ALTER TABLE "employees" ADD COLUMN "workPermitExpiresOn" DATE;
