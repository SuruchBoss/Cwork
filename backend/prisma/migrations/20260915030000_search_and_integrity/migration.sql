-- Hand-written database objects that Prisma's schema language cannot express:
-- search indexes, CHECK constraints and immutability triggers.
--
-- IMPORTANT FOR CONTRIBUTORS
-- Prisma does not know about anything in this file. When you run
-- `prisma migrate dev` after changing schema.prisma, Prisma compares the
-- database to the Prisma schema and will generate DROP statements for these
-- objects as if they were drift. Always run `prisma migrate dev --create-only`,
-- open the generated migration, and delete any DROP INDEX / DROP COLUMN /
-- DROP TRIGGER that targets an object created here. `npm run db:verify` fails
-- the build if any of them went missing.
--
-- Everything below is written to be idempotent so it can be re-applied safely.

-- ---------------------------------------------------------------------------
-- Knowledge base search
-- ---------------------------------------------------------------------------

-- Lexical search is the DEFAULT retrieval path: Cwork answers policy
-- questions with no AI provider and no embeddings at all.
--
-- These are EXPRESSION indexes rather than a generated column, deliberately:
-- the query computes `to_tsvector(...)` inline, so if an index is ever dropped
-- search degrades to a sequential scan instead of failing.
CREATE INDEX IF NOT EXISTS "knowledge_chunks_content_tsv_idx"
  ON "knowledge_chunks" USING gin (to_tsvector('simple', "content"));

-- Thai has no whitespace word boundaries, so 'simple' tokenisation alone misses
-- substring matches. A trigram index covers those queries.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE INDEX IF NOT EXISTS "knowledge_chunks_content_trgm_idx"
  ON "knowledge_chunks" USING gin ("content" gin_trgm_ops);

-- Semantic search, used only when an embedding provider is configured.
-- HNSW needs pgvector >= 0.5; fall back to IVFFlat on older servers.
DO $$
BEGIN
  BEGIN
    CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_hnsw"
      ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
  EXCEPTION WHEN undefined_object OR feature_not_supported THEN
    CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_ivfflat"
      ON "knowledge_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
  END;
END
$$;

-- ---------------------------------------------------------------------------
-- Employee name search for the admin console
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "employees_name_trgm_idx"
  ON "employees" USING gin (
    (coalesce("firstNameTh", '') || ' ' || coalesce("lastNameTh", '') || ' ' ||
     coalesce("firstNameEn", '') || ' ' || coalesce("lastNameEn", '') || ' ' ||
     coalesce("nickname", '') || ' ' || "employeeCode") gin_trgm_ops
  );

-- ---------------------------------------------------------------------------
-- Integrity rules the application must never be able to violate
-- ---------------------------------------------------------------------------

ALTER TABLE "leave_requests" DROP CONSTRAINT IF EXISTS "leave_requests_date_order_check";
ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_date_order_check" CHECK ("endDate" >= "startDate");

ALTER TABLE "overtime_requests" DROP CONSTRAINT IF EXISTS "overtime_requests_interval_check";
ALTER TABLE "overtime_requests"
  ADD CONSTRAINT "overtime_requests_interval_check"
  CHECK ("endAt" > "startAt" AND "requestedHours" > 0);

-- Payslip arithmetic must balance: net = gross - deductions.
ALTER TABLE "payslips" DROP CONSTRAINT IF EXISTS "payslips_net_balance_check";
ALTER TABLE "payslips"
  ADD CONSTRAINT "payslips_net_balance_check"
  CHECK ("netPay" = "grossEarnings" - "totalDeductions");

ALTER TABLE "employee_compensations"
  DROP CONSTRAINT IF EXISTS "employee_compensations_effective_order_check";
ALTER TABLE "employee_compensations"
  ADD CONSTRAINT "employee_compensations_effective_order_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

ALTER TABLE "review_cycles" DROP CONSTRAINT IF EXISTS "review_cycles_weight_total_check";
ALTER TABLE "review_cycles"
  ADD CONSTRAINT "review_cycles_weight_total_check"
  CHECK ("kpiWeight" + "competencyWeight" = 100);

-- Append-only tables: block UPDATE and DELETE at the database level, so a
-- compromised application account still cannot rewrite history.
CREATE OR REPLACE FUNCTION "cwork_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (attempted %)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "audit_logs_append_only" ON "audit_logs";
CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "cwork_append_only"();

-- Corrections add new punches; they never edit the original stream.
DROP TRIGGER IF EXISTS "attendance_punches_append_only" ON "attendance_punches";
CREATE TRIGGER "attendance_punches_append_only"
  BEFORE UPDATE OR DELETE ON "attendance_punches"
  FOR EACH ROW EXECUTE FUNCTION "cwork_append_only"();

-- ---------------------------------------------------------------------------
-- Hot-path partial indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "approval_tasks_pending_idx"
  ON "approval_tasks" ("approverUserId") WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "outbox_events_unprocessed_idx"
  ON "outbox_events" ("occurredAt") WHERE "processedAt" IS NULL;
