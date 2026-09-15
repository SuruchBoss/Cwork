-- One-time setup tokens for the first-run wizard (CW-022).
--
-- The two `DROP INDEX` statements Prisma generated here have been removed by
-- hand: they target the hand-written search indexes from
-- `20260915030000_search_and_integrity`, which Prisma does not model and so
-- reports as drift on every generated migration. See
-- docs/operations.md#migrations-and-the-drift-trap, and run `npm run db:verify`
-- after applying this.

-- CreateTable
CREATE TABLE "setup_tokens" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "setup_tokens_tokenHash_key" ON "setup_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "setup_tokens_expiresAt_idx" ON "setup_tokens"("expiresAt");
