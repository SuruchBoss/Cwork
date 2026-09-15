-- Asserts that every hand-written database object still exists.
--
-- Run after migrations (`npm run db:verify`). This is the guard against Prisma
-- silently dropping these objects as "drift" when a new migration is generated
-- — see prisma/migrations/*_search_and_integrity/migration.sql.
\set ON_ERROR_STOP on

DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  expected_indexes text[] := ARRAY[
    'knowledge_chunks_content_tsv_idx',
    'knowledge_chunks_content_trgm_idx',
    'employees_name_trgm_idx',
    'approval_tasks_pending_idx',
    'outbox_events_unprocessed_idx'
  ];
  expected_constraints text[] := ARRAY[
    'leave_requests_date_order_check',
    'overtime_requests_interval_check',
    'payslips_net_balance_check',
    'employee_compensations_effective_order_check',
    'review_cycles_weight_total_check'
  ];
  expected_triggers text[] := ARRAY[
    'audit_logs_append_only',
    'attendance_punches_append_only'
  ];
  name text;
BEGIN
  FOREACH name IN ARRAY expected_indexes LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = name) THEN
      missing := missing || ('index ' || name);
    END IF;
  END LOOP;

  FOREACH name IN ARRAY expected_constraints LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = name) THEN
      missing := missing || ('constraint ' || name);
    END IF;
  END LOOP;

  FOREACH name IN ARRAY expected_triggers LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = name AND NOT tgisinternal) THEN
      missing := missing || ('trigger ' || name);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION E'Missing hand-written database objects:\n  %\n\nA generated Prisma migration probably dropped them as drift. See prisma/migrations/*_search_and_integrity/migration.sql.',
      array_to_string(missing, E'\n  ');
  END IF;

  RAISE NOTICE 'All hand-written database objects are present.';
END
$$;
