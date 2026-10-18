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
import { DemoRefused, inspectDemoDatabase } from './demo-database';
import { pendingMigrations } from './demo-migrations';
import { DemoModule } from './demo.module';

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
