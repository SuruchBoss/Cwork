// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The public demo's entrypoint (deploy/demo/Dockerfile):
 *
 *   1. refuse a database the demo did not create — before anything touches it;
 *   2. apply migrations, but only when one is pending;
 *   3. start the API, which seeds and resets the demo by itself (DemoService).
 *
 * Step 2 checks before it runs the migration tool because the tool is slow
 * where the demo lives: on the free instance's tenth of a CPU, `prisma migrate
 * deploy` takes sixteen seconds to report that there is nothing to do, and the
 * instance sleeps and wakes all day. Checking takes one query. docs/demo.md has
 * the measurements.
 */
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DemoRefused, inspectDemoDatabase } from './demo-database';
import { DemoModule } from './demo.module';

/** Where the image keeps the migrations; `prisma migrate deploy` reads the same folder. */
const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

async function pendingMigrations(prisma: PrismaClient): Promise<string[]> {
  const shipped = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(MIGRATIONS_DIR, entry.name, 'migration.sql')),
    )
    .map((entry) => entry.name);

  const [table] = await prisma.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass(format('%I._prisma_migrations', current_schema())) IS NOT NULL AS "present"
  `;
  if (!table?.present) return shipped;

  const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `;
  const done = new Set(applied.map((row) => row.migration_name));
  return shipped.filter((name) => !done.has(name));
}

async function main(): Promise<void> {
  if (!DemoModule.enabledBy(process.env)) {
    console.error(
      'This entrypoint runs the public demo. Set DEMO_MODE=true, or start dist/main.js.',
    );
    process.exit(1);
  }

  // Render names the service's own address; the API refuses to start in
  // production without an explicit CORS list, and this is the only origin the
  // demo's console is served from.
  if (!process.env.CORS_ORIGINS && process.env.RENDER_EXTERNAL_URL) {
    process.env.CORS_ORIGINS = process.env.RENDER_EXTERNAL_URL;
  }

  const prisma = new PrismaClient();
  try {
    await inspectDemoDatabase(prisma);

    const pending = await pendingMigrations(prisma);
    if (pending.length > 0) {
      console.log(`Applying ${pending.length} migration(s): ${pending.join(', ')}`);
      execFileSync(
        process.execPath,
        [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
        {
          stdio: 'inherit',
        },
      );
    }
  } catch (error) {
    if (error instanceof DemoRefused) {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }

  await import('../../main');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
