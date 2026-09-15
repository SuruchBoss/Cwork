/**
 * Prepares the database the e2e suite runs against.
 *
 * Runs once, before any spec: migrate, wipe, seed. The suite then exercises a
 * known company rather than whatever happens to be lying around, which is what
 * makes assertions like "HR sees 8 employees" meaningful.
 *
 * **This truncates every table.** It refuses to touch a database whose name
 * does not look like a test database unless you insist, because losing a
 * developer's local data to a test run is a bad afternoon.
 */
// Pick up backend/.env the same way prisma.config.ts does, so a developer who
// keeps DATABASE_URL there gets the "refusing to wipe" message rather than a
// confusing "no database configured".
import 'dotenv/config';
import { execFileSync } from 'node:child_process';

const TEST_DB_HINT = /test/i;

function resolveDatabaseUrl(): string {
  const explicit = process.env.E2E_DATABASE_URL;
  if (explicit) {
    // An explicit choice is an explicit choice.
    return explicit;
  }

  const fallback = process.env.DATABASE_URL;
  if (!fallback) {
    throw new Error('e2e needs a database: set E2E_DATABASE_URL (preferred) or DATABASE_URL.');
  }

  const name = new URL(fallback).pathname.replace(/^\//, '');
  if (!TEST_DB_HINT.test(name) && process.env.E2E_ALLOW_NON_TEST_DB !== '1') {
    throw new Error(
      `Refusing to wipe "${name}": it does not look like a test database.\n` +
        'Set E2E_DATABASE_URL to a throwaway database, or E2E_ALLOW_NON_TEST_DB=1 ' +
        'if you really mean to truncate this one.',
    );
  }
  return fallback;
}

/** Every table Prisma owns, minus its own migration bookkeeping. */
async function truncateAll(databaseUrl: string): Promise<void> {
  // Imported lazily so a misconfigured URL fails the check above first.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
    `;
    if (tables.length === 0) return;

    const list = tables.map((t) => `"${t.tablename}"`).join(', ');
    // TRUNCATE rather than DELETE: audit_logs and attendance_punches carry an
    // append-only trigger that raises on DELETE, and rightly so.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
}

export default async function globalSetup(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  const env = { ...process.env, DATABASE_URL: databaseUrl };

  // The suite makes a few hundred requests in a couple of minutes; the default
  // throttle would start rejecting them and the failures would look like bugs.
  process.env.THROTTLE_LIMIT = '100000';
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

  const run = (args: string[]): void => {
    execFileSync('npx', args, { cwd: process.cwd(), env, stdio: 'inherit' });
  };

  run(['prisma', 'migrate', 'deploy']);
  await truncateAll(databaseUrl);
  run(['ts-node', '--transpile-only', 'prisma/seed.ts']);
}
