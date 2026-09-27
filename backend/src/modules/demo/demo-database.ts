// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Which databases the public demo may open, and the refusal for every other.
 *
 * Demo mode does two things no real installation can survive: it signs anybody
 * in without a password, and it empties the database every hour. So the one
 * variable that turns it on is not trusted by itself. The database has to
 * prove it belongs to the demo — and the proof is something only the demo
 * creates: the `cwork_demo` schema, made the first time the demo seeds an
 * empty database. A real installation never has it, however it was set up.
 *
 * Refuse rather than wipe, and refuse rather than open: the check runs before
 * the migrations (demo-main.ts), again before the application finishes booting
 * (DemoService), and a third time inside the transaction that truncates.
 */
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { DEMO_ORG_CODE } from './seed/demo-company';

/** A refusal, not a crash: printed as a message, with no stack trace. */
export class DemoRefused extends Error {}

/**
 * Anything that runs raw SQL: the client, or a transaction on it. The client
 * has every member a transaction has, so either can be passed.
 */
export type RawSql = Prisma.TransactionClient;

/**
 * `empty`: no organisation at all, so the demo may create itself here.
 * `demo`: an organisation the demo made, in a database the demo marked.
 * Anything else throws `DemoRefused`.
 */
export type DemoDatabase = 'empty' | 'demo';

export async function inspectDemoDatabase(db: RawSql): Promise<DemoDatabase> {
  // Looked up by name rather than queried through the client, because this
  // runs before the migrations and must work on a database that has none.
  const [found] = await db.$queryRaw<{ organizations: boolean; marker: boolean }[]>`
    SELECT
      to_regclass(format('%I.organizations', current_schema())) IS NOT NULL AS "organizations",
      to_regnamespace('cwork_demo') IS NOT NULL AS "marker"
  `;
  if (!found?.organizations) return 'empty';

  const organizations = await db.$queryRaw<{ code: string; name: string }[]>`
    SELECT "code", "name" FROM "organizations" ORDER BY "createdAt" LIMIT 20
  `;
  if (organizations.length === 0) return 'empty';

  const foreign = organizations.find((org) => org.code !== DEMO_ORG_CODE);
  if (!found.marker || foreign) {
    const org = foreign ?? organizations[0];
    throw new DemoRefused(
      [
        `DEMO_MODE is on, but this database holds "${org.name}" (${org.code}), which the demo did not create.`,
        '',
        'The demo signs visitors in without a password and puts the data back to the',
        'demo seed every hour. Neither is something to do to a real organisation, so',
        'Cwork has not started, and nothing in the database has been changed.',
        '',
        'Point DATABASE_URL at an empty database made for the demo, or set',
        'DEMO_MODE=false to run this database as the installation it is.',
      ].join('\n'),
    );
  }
  return 'demo';
}

/**
 * The marker schema, the demo's bookkeeping, and the triggers that keep
 * visitors' network details out of the data.
 *
 * Safe to run on every boot. Only ever called after `inspectDemoDatabase` has
 * said `empty` or `demo`, which is what makes creating the marker legitimate.
 */
export async function prepareDemoSchema(db: RawSql): Promise<void> {
  await db.$executeRaw`CREATE SCHEMA IF NOT EXISTS cwork_demo`;
  await db.$executeRaw`
    CREATE TABLE IF NOT EXISTS cwork_demo.state (
      id boolean PRIMARY KEY DEFAULT true CHECK (id),
      seeded_at timestamptz,
      dirty_since timestamptz
    )
  `;
  await db.$executeRaw`ALTER TABLE cwork_demo.state ADD COLUMN IF NOT EXISTS key_fingerprint text`;
  await db.$executeRaw`INSERT INTO cwork_demo.state (id) VALUES (true) ON CONFLICT DO NOTHING`;

  // The audit trail, the session list and the attendance log all record the
  // client's address and browser, and the demo's HR account can read all
  // three. On a real installation that is the point; on a public demo it would
  // show every visitor the addresses of the visitors before them. A trigger
  // rather than a code path, so no route — present or future — can miss it.
  await db.$executeRaw`
    CREATE OR REPLACE FUNCTION cwork_demo.forget_visitor() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      RETURN jsonb_populate_record(
        NEW,
        (SELECT jsonb_object_agg(col, NULL) FROM unnest(TG_ARGV) AS col)
      );
    END
    $fn$
  `;
  await db.$executeRaw`
    DO $do$
    DECLARE t record;
    BEGIN
      FOR t IN
        SELECT table_name, string_agg(quote_literal(column_name), ', ') AS cols
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND column_name IN ('ipAddress', 'userAgent')
        GROUP BY table_name
      LOOP
        EXECUTE format(
          'CREATE OR REPLACE TRIGGER cwork_demo_forget_visitor BEFORE INSERT OR UPDATE ' ||
          'ON %I FOR EACH ROW EXECUTE FUNCTION cwork_demo.forget_visitor(%s)',
          t.table_name, t.cols);
      END LOOP;
    END
    $do$
  `;
}

export interface DemoStateRow {
  seededAt: Date | null;
  dirtySince: Date | null;
  /** Which FIELD_ENCRYPTION_KEY the data was last written with (see `keyFingerprint`). */
  keyFingerprint: string | null;
}

export async function readDemoState(db: RawSql): Promise<DemoStateRow> {
  const [row] = await db.$queryRaw<
    { seeded_at: Date | null; dirty_since: Date | null; key_fingerprint: string | null }[]
  >`
    SELECT seeded_at, dirty_since, key_fingerprint FROM cwork_demo.state WHERE id
  `;
  return {
    seededAt: row?.seeded_at ?? null,
    dirtySince: row?.dirty_since ?? null,
    keyFingerprint: row?.key_fingerprint ?? null,
  };
}

/**
 * Identifies an encryption key without revealing it: the first bytes of its
 * SHA-256. Rotating FIELD_ENCRYPTION_KEY leaves every encrypted column
 * unreadable, so a demo that boots with a different key than it seeded with
 * seeds again rather than showing errors.
 */
export function keyFingerprint(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Empties every table the application owns — everything in the application's
 * schema except Prisma's migration history. The marker schema is elsewhere and
 * survives, which is what lets the next boot recognise the database.
 *
 * Takes the transaction the caller has just re-run `inspectDemoDatabase` in.
 */
export async function truncateDemoData(tx: RawSql): Promise<void> {
  const tables = await tx.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  // TRUNCATE rather than DELETE: audit_logs and attendance_punches carry an
  // append-only trigger that raises on DELETE, and rightly so.
  const list = Prisma.join(tables.map((t) => Prisma.raw(`"${t.tablename.replace(/"/g, '""')}"`)));
  await tx.$executeRaw`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`;
}
