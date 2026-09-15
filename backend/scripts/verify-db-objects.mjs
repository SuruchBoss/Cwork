#!/usr/bin/env node
/**
 * Runs scripts/verify-db-objects.sql against DATABASE_URL.
 *
 * Kept as a script rather than a bare psql invocation so `npm run db:verify`
 * picks up .env the same way the app does, and so CI gets a clear exit code.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sqlFile = join(here, 'verify-db-objects.sql');

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('DATABASE_URL is not set (copy .env.example to .env)');
  process.exit(1);
}

// Prisma URLs carry `?schema=public`, which libpq rejects as an unknown query
// parameter — translate it into the search_path instead.
const parsed = new URL(raw);
const schema = parsed.searchParams.get('schema') ?? 'public';
parsed.search = '';

const result = spawnSync(
  'psql',
  [parsed.toString(), '-v', 'ON_ERROR_STOP=1', '-c', `SET search_path TO ${schema};`, '-f', sqlFile],
  { stdio: 'inherit', env: { ...process.env, PGOPTIONS: `--search_path=${schema}` } },
);

if (result.error) {
  console.error('Could not run psql. Install the PostgreSQL client, or run the SQL by hand:');
  console.error(`  psql "$DATABASE_URL" -f ${sqlFile}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
