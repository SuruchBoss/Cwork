-- Copyright 2026 Suruch Chakrapeesirisuk
-- SPDX-License-Identifier: Apache-2.0
--
-- For a take on a pinned clock only (see film.mjs), in a throwaway database.
--
-- faketime moves Node's clock and Postgres's, but not Prisma's query engine:
-- it stamps @default(now()) and @updatedAt fields itself — createdAt,
-- submittedAt, appliedAt and the rest — from the machine's real clock, by a
-- route no preloaded library intercepts. On a Monday-morning take recorded on
-- a Sunday, a leave request filed on camera then reads "submitted 21 hours
-- ago", and the audit trail shows yesterday's date.
--
-- These triggers restamp exactly those values — any timestamp column within
-- two minutes of the real clock — with the database's pinned one. Everything
-- the application sets itself is already on the pinned clock and far from the
-- real one, so it is left as it is.
--
--   psql -v offset=<seconds the clocks are pinned ahead> -f pin-clock.sql
--
-- Run it after the migrations and before the seed.

SELECT set_config('film.offset', :'offset', false);

CREATE OR REPLACE FUNCTION film_pinned_now() RETURNS timestamp AS $$
  SELECT (now() AT TIME ZONE 'UTC')::timestamp;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION film_restamp() RETURNS trigger AS $$
DECLARE
  real_now timestamp := film_pinned_now() - make_interval(secs => TG_ARGV[0]::double precision);
  stamped jsonb := to_jsonb(NEW);
  col text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV[1:] LOOP
    IF stamped ->> col IS NOT NULL
       AND abs(extract(epoch FROM ((stamped ->> col)::timestamp - real_now))) < 120 THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(col, film_pinned_now()));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- One trigger per table, handed that table's timestamp columns.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT table_name, string_agg(quote_literal(column_name), ', ') AS cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'
    GROUP BY table_name
  LOOP
    EXECUTE format(
      'CREATE TRIGGER film_restamp BEFORE INSERT OR UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION film_restamp(%L, %s)',
      t.table_name, current_setting('film.offset'), t.cols);
  END LOOP;
END;
$$;
