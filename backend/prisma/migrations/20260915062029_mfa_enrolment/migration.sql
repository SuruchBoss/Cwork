-- MFA enrolment bookkeeping.
--
-- `mfaEnabled`, `mfaSecretEnc` and `mfaRecoveryCodes` already existed; these two
-- complete the picture:
--   mfaEnrolledAt    when the second factor was activated, for the audit trail
--   mfaLastUsedStep  newest TOTP step already spent, so a code cannot be
--                    replayed inside its own 90-second validity window
--
-- Prisma also generated DROP INDEX for knowledge_chunks_content_trgm_idx and
-- knowledge_chunks_embedding_hnsw, which it treats as drift because it did not
-- create them. They are deliberate hand-written objects — see
-- 20260915030000_search_and_integrity — and the drops were removed by hand.
-- `npm run db:verify` is what catches it when someone forgets.

ALTER TABLE "users"
  ADD COLUMN "mfaEnrolledAt" TIMESTAMP(3),
  ADD COLUMN "mfaLastUsedStep" INTEGER;
