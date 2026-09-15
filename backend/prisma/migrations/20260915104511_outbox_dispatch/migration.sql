-- Outbox dispatch: retry scheduling and a dead-letter marker.
--
-- The two `DROP INDEX` statements Prisma generated here have been removed by
-- hand. They target `knowledge_chunks_content_trgm_idx` and
-- `knowledge_chunks_embedding_hnsw`, which are written by
-- `20260915030000_search_and_integrity` and which Prisma does not model, so it
-- reports them as drift on every generated migration. See
-- docs/operations.md#migrations-and-the-drift-trap, and run `npm run db:verify`
-- after applying this.

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The partial index the dispatcher claims through. Replaces the one created in
-- `20260915030000_search_and_integrity`, which predates both new columns: the
-- claim query orders by `nextAttemptAt` and has to exclude dead letters, and an
-- index that covers neither leaves the dispatcher filtering rows it could have
-- skipped. Same name, so `scripts/verify-db-objects.sql` still finds it.
DROP INDEX IF EXISTS "outbox_events_unprocessed_idx";

CREATE INDEX "outbox_events_unprocessed_idx"
  ON "outbox_events" ("nextAttemptAt", "occurredAt")
  WHERE "processedAt" IS NULL AND "failedAt" IS NULL;
