// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Which migrations the public demo's database still lacks, found with one
 * query instead of by running the migration tool (see demo-main.ts for why).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { appSchema, quoteIdent } from './demo-database';

/** Where the image keeps the migrations; `prisma migrate deploy` reads the same folder. */
const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

export async function pendingMigrations(
  prisma: PrismaClient,
  migrationsDir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  const shipped = readdirSync(migrationsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(migrationsDir, entry.name, 'migration.sql')),
    )
    .map((entry) => entry.name);

  const schema = appSchema();
  const [table] = await prisma.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass(format('%I._prisma_migrations', ${schema}::text)) IS NOT NULL AS "present"
  `;
  if (!table?.present) return shipped;

  const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM ${Prisma.raw(quoteIdent(schema))}._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `;
  const done = new Set(applied.map((row) => row.migration_name));
  return shipped.filter((name) => !done.has(name));
}
