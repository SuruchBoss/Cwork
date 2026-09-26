/**
 * Prepares the database the e2e suite runs against.
 *
 * Runs once, before any spec: migrate, wipe, seed. The suite then exercises a
 * known company rather than whatever happens to be lying around, which is what
 * makes assertions like "HR sees 8 employees" meaningful.
 *
 * **This truncates every table.** The refusal that protects a non-test database
 * lives in `utils/database.ts`, alongside the wipe itself, because
 * `setup.e2e-spec.ts` needs both as well.
 */
// Pick up backend/.env the same way prisma.config.ts does, so a developer who
// keeps DATABASE_URL there gets the "refusing to wipe" message rather than a
// confusing "no database configured".
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolveDatabaseUrl, seedDemoCompany, truncateAll } from './utils/database';

export default async function globalSetup(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  const env = { ...process.env, DATABASE_URL: databaseUrl };

  // The suite makes a few hundred requests in a couple of minutes; the default
  // throttle would start rejecting them and the failures would look like bugs.
  // The credential limit matters too: the MFA scenarios sign in repeatedly, and
  // a 429 there shows up as a missing challenge token three assertions later.
  process.env.THROTTLE_LIMIT = '100000';
  process.env.AUTH_THROTTLE_LIMIT = process.env.AUTH_THROTTLE_LIMIT ?? '1000';

  // No background outbox polling. Every test that cares about dispatch drives
  // `drainOnce()` itself, and a timer draining the same rows underneath would
  // turn "exactly one delivery" into a coin toss.
  process.env.OUTBOX_POLL_MS = '0';

  // The seed has no default password any more, so the suite picks the demo
  // accounts' password for this run; specs read it back through `seedPassword()`.
  process.env.SEED_PASSWORD = process.env.SEED_PASSWORD || `e2e-${randomUUID()}`;
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });
  await truncateAll(databaseUrl);
  seedDemoCompany(databaseUrl);
}
