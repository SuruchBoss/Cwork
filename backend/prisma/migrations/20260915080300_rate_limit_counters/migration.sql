-- Shared rate-limit counters.
--
-- @nestjs/throttler keeps its counters in memory by default, so N replicas hand
-- out N times the budget and a restart forgets everything. Deployments that set
-- THROTTLE_STORAGE=postgres point it at this table instead.
--
-- Prisma also generated DROP INDEX for knowledge_chunks_content_trgm_idx and
-- knowledge_chunks_embedding_hnsw, which it treats as drift because it did not
-- create them. They are deliberate hand-written objects — see
-- 20260915030000_search_and_integrity — and the drops were removed by hand.
-- `npm run db:verify` is what catches it when someone forgets.

CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

-- Only used by the cleanup sweep, which deletes long-dead windows.
CREATE INDEX "rate_limit_counters_expiresAt_idx" ON "rate_limit_counters"("expiresAt");
