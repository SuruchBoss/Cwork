import path from 'node:path';
// Prisma 6 config files opt out of implicit .env loading; do it explicitly so
// `prisma migrate` / `prisma studio` behave like the app does.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
});
