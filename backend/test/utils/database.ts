/**
 * The two destructive operations the e2e suite needs: empty the database, and
 * put the demo company back.
 *
 * `global-setup.ts` does both once, before any spec runs. `setup.e2e-spec.ts`
 * does both again, because the only honest way to test a first-run install is
 * on a database with nothing in it — and the only polite way to do that in a
 * shared suite is to restore what was there afterwards.
 */
import { execFileSync } from 'node:child_process';

const TEST_DB_HINT = /test/i;

/**
 * The database the suite is allowed to destroy.
 *
 * Refuses one whose name does not look like a test database, because losing a
 * developer's local data to a test run is a bad afternoon.
 */
export function resolveDatabaseUrl(): string {
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
export async function truncateAll(databaseUrl = resolveDatabaseUrl()): Promise<void> {
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

/**
 * Re-creates the demo company every other spec signs in as.
 *
 * `quiet` is for the spec that restores the database mid-run: the seed prints
 * the whole demo company, published credentials and all, which is worth seeing
 * once at the start of a run and is pure noise in the middle of one.
 */
export function seedDemoCompany(
  databaseUrl = resolveDatabaseUrl(),
  { quiet = false }: { quiet?: boolean } = {},
): void {
  execFileSync('npx', ['ts-node', '--transpile-only', 'prisma/seed.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: quiet ? 'ignore' : 'inherit',
  });
}
