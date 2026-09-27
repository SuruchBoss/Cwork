// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * `npm run db:demo` — gives the demo company a history.
 *
 * The work is `src/modules/demo/seed/demo-activity.ts`, which drives the real
 * services. This boots an application context to hand it those services, and
 * nothing else. Run through `npm run db:seed`, which chains it after the seed.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { seedDemoActivity } from '../src/modules/demo/seed/demo-activity';

async function main(): Promise<void> {
  // Background pollers would compete with this script for the same rows, and
  // there is nothing here that needs delivering.
  process.env.OUTBOX_POLL_MS = process.env.OUTBOX_POLL_MS ?? '0';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    await seedDemoActivity(app, new Logger('db:demo'));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `\n${error.message}` : String(error));
  process.exitCode = 1;
});
