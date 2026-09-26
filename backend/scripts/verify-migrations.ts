// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The migration history and `schema.prisma` have not drifted apart.
 *
 * CI already runs `prisma migrate deploy`, which proves the migrations apply in
 * order — but only against an EMPTY database, and only that the SQL runs. It
 * says nothing about whether the schema those migrations build is the schema
 * `prisma/schema/*.prisma` describes. So a field added to the Prisma schema and
 * never migrated (or a migration that no longer matches the model) sails
 * through: the app's types expect a column the database does not have, and the
 * first query to touch it fails in production, not in CI.
 *
 *     npm run verify:migrations
 *
 * This replays every migration into a scratch (shadow) database and asks Prisma
 * for the SQL that would turn that database into the one `schema.prisma`
 * describes. In a healthy tree that diff is not empty — it is exactly the two
 * hand-written search indexes Prisma cannot model and reports as drift every
 * time (see prisma/migrations/*_search_and_integrity/migration.sql and
 * docs/operations.md#migrations-and-the-drift-trap). Anything else in the diff
 * is real: a model changed without a migration, or a migration that has quietly
 * stopped matching the schema. Either fails the build with the offending
 * statement printed.
 *
 * It is the mirror of `db:verify`: that one fails when a generated migration
 * DROPPED a hand-written object; this one fails when the schema and the
 * migrations describe two different databases.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * The only statements a healthy diff is allowed to contain. These are the
 * hand-written search indexes from `_search_and_integrity`: Prisma does not
 * represent a `gin_trgm_ops` opclass or an index on an `Unsupported("vector")`
 * column, so it reports each as drift and would "fix" it with a DROP. The
 * ivfflat name is here too because the migration falls back to it on a pgvector
 * older than 0.5 — one server or the other will emit one of the two.
 */
const EXPECTED_DRIFT = new Set([
  'DROP INDEX "knowledge_chunks_content_trgm_idx"',
  'DROP INDEX "knowledge_chunks_embedding_hnsw"',
  'DROP INDEX "knowledge_chunks_embedding_ivfflat"',
]);

/**
 * Reduces `prisma migrate diff --script` output to the statements that are NOT
 * expected drift. An empty result means the migrations and the schema agree.
 *
 * Pure so the classification can be reasoned about on its own: comment lines,
 * blank lines and the CLI's own "Loaded Prisma config" preamble are dropped,
 * the rest is split on `;` and each statement is whitespace-normalised before
 * it is compared with the allow-list.
 */
export function unexpectedDriftStatements(diffScript: string): string[] {
  const sql = diffScript
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith('--') &&
        !trimmed.startsWith('Loaded Prisma config')
      );
    })
    .join(' ');

  return sql
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
    .filter((statement) => !EXPECTED_DRIFT.has(statement));
}

interface ResolvedUrls {
  /** Prisma-format URL of the scratch database the migrations are replayed into. */
  shadowUrl: string;
  /** libpq URL of the server's maintenance database, used to create the scratch db. */
  adminUrl: string;
  /** Name of the scratch database. */
  shadowName: string;
}

/**
 * Derives a scratch database next to DATABASE_URL rather than asking for a
 * second URL, so `npm run verify:migrations` works from a plain `.env` the same
 * way `db:verify` does.
 */
function resolveUrls(databaseUrl: string): ResolvedUrls {
  const base = new URL(databaseUrl);
  const baseName = base.pathname.replace(/^\//, '') || 'postgres';
  const shadowName = `${baseName}_migrate_shadow`;

  const shadow = new URL(databaseUrl);
  shadow.pathname = `/${shadowName}`;

  // libpq rejects the `?schema=` Prisma appends, so the admin URL carries none.
  const admin = new URL(databaseUrl);
  admin.pathname = '/postgres';
  admin.search = '';

  return { shadowUrl: shadow.toString(), adminUrl: admin.toString(), shadowName };
}

/** Creates the scratch database if it is not already there. Idempotent. */
function ensureShadowDatabase(adminUrl: string, shadowName: string): void {
  const exists = spawnSync(
    'psql',
    [adminUrl, '-tAc', `SELECT 1 FROM pg_database WHERE datname = '${shadowName}'`],
    { encoding: 'utf8' },
  );

  if (exists.error) {
    console.error('Could not run psql to prepare the shadow database. Install the client, or:');
    console.error(`  createdb ${shadowName}`);
    process.exit(1);
  }
  if (exists.status !== 0) {
    console.error(exists.stderr.trim());
    process.exit(1);
  }
  if (exists.stdout.trim() === '1') return;

  const created = spawnSync('psql', [adminUrl, '-c', `CREATE DATABASE "${shadowName}"`], {
    encoding: 'utf8',
  });
  if (created.status !== 0) {
    console.error(`Could not create shadow database ${shadowName}:`);
    console.error(created.stderr.trim());
    process.exit(1);
  }
}

function main(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set (copy .env.example to .env).');
    process.exit(1);
  }

  const { shadowUrl, adminUrl, shadowName } = resolveUrls(databaseUrl);
  ensureShadowDatabase(adminUrl, shadowName);

  const backendDir = join(__dirname, '..');
  const diff = spawnSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-migrations',
      './prisma/migrations',
      '--to-schema-datamodel',
      './prisma/schema',
      '--shadow-database-url',
      shadowUrl,
      '--script',
    ],
    { cwd: backendDir, encoding: 'utf8' },
  );

  if (diff.status !== 0) {
    console.error('prisma migrate diff failed:');
    console.error(diff.stderr.trim() || diff.stdout.trim());
    process.exit(1);
  }

  const unexpected = unexpectedDriftStatements(diff.stdout);
  if (unexpected.length > 0) {
    console.error('The migrations and schema.prisma describe different databases.\n');
    console.error('These statements would be needed to reconcile them, and are not the');
    console.error('two hand-written search indexes Prisma always reports as drift:\n');
    for (const statement of unexpected) console.error(`  ${statement};`);
    console.error('\nAdd a migration for the schema change (see');
    console.error('docs/operations.md#migrations-and-the-drift-trap), or, if the change');
    console.error('belongs in schema.prisma only, reconcile the two before committing.');
    process.exit(1);
  }

  console.log('Migrations and schema.prisma agree (only the expected hand-written drift remains).');
}

if (require.main === module) main();
