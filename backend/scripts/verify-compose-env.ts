/**
 * Checks that every compose service which boots the application is handed the
 * environment the application refuses to start without.
 *
 * This exists because of a bug that nothing else could have caught. `migrate`
 * was written when it only ever ran `prisma migrate deploy`, which needs a
 * database URL and nothing more. It later became the service the README tells
 * people to run `db:seed` and `db:init` through — both of which boot Nest, and
 * Nest validates the entire environment before a single module starts. The
 * compose file was never updated, so the documented five-minute demo seeded an
 * org chart and then died, and `db:init` never ran at all. No test touched it:
 * the e2e suite talks to a database directly and never goes near compose.
 *
 * The required set is not listed here. It is whatever `validateEnv` demands, so
 * adding a required variable to the validation schema makes this fail for every
 * service that does not pass it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateEnv } from '../src/core/config/env.validation';

/** Services that start Node with our code in it, and what they run. */
const APP_SERVICES: Record<string, string> = {
  api: 'the API itself',
  migrate: 'npm run db:seed and npm run db:init',
};

/**
 * Reads `<service>.environment` out of the compose file as the values a user
 * would actually get: compose's own `${VAR:-default}` defaults, its literals,
 * and a stand-in for the `${VAR:?...}` secrets the operator is told to set.
 *
 * A YAML parser would be more correct, but the backend has no reason to depend
 * on one and the shape being read is two levels of a fixed, hand-written file.
 * Anything unexpected makes this throw rather than quietly return nothing.
 */
function environmentOf(compose: string, service: string): Record<string, string> {
  const lines = compose.split('\n');
  const start = lines.findIndex((l) => l === `  ${service}:`);
  if (start === -1) throw new Error(`compose has no service named "${service}"`);

  // The service block runs until the next key at the same indent.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}\S/.test(lines[i])) {
      end = i;
      break;
    }
  }

  const block = lines.slice(start + 1, end);
  const envAt = block.findIndex((l) => l === '    environment:');
  if (envAt === -1) throw new Error(`service "${service}" declares no environment`);

  const env: Record<string, string> = {};
  for (let i = envAt + 1; i < block.length; i++) {
    const line = block[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^ {6}\S/.test(line)) break; // out of the environment mapping
    const entry = /^ {6}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!entry) throw new Error(`could not read "${line.trim()}" in ${service}.environment`);
    env[entry[1]] = resolve(entry[2].trim());
  }
  if (Object.keys(env).length === 0) throw new Error(`service "${service}" has an empty environment`);
  return env;
}

/**
 * Substitutes compose's variable syntax the way compose would for an operator
 * who set only what `.env.example` marks as required.
 *
 *   ${VAR:-default}  the default, because that is what an unset VAR yields
 *   ${VAR:?message}  a stand-in: compose refuses to run until it is set
 *   ${VAR}           likewise required in practice
 */
function resolve(raw: string): string {
  return raw.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:-([^}]*)|:\?[^}]*)?\}/g, (_m, name, tail, fallback) => {
    if (tail && tail.startsWith(':-')) return fallback ?? '';
    return standIn(name);
  });
}

/** A value the named secret could plausibly hold — only to get past format rules. */
function standIn(name: string): string {
  if (/^FIELD_ENCRYPTION_KEY$/.test(name)) return Buffer.alloc(32, 7).toString('base64');
  if (/SECRET$/.test(name)) return `${name.toLowerCase()}-${'x'.repeat(40)}`;
  if (/PASSWORD$/.test(name)) return 'a-database-password';
  return 'x';
}

const compose = readFileSync(join(__dirname, '..', '..', 'docker-compose.yml'), 'utf8');

let failed = false;
for (const [service, runs] of Object.entries(APP_SERVICES)) {
  const env = environmentOf(compose, service);

  try {
    validateEnv(env);
    console.log(
      `  ok    ${service} — ${Object.keys(env).length} variables, enough to run ${runs}`,
    );
  } catch (error) {
    failed = true;
    console.error(`  FAIL  ${service} — cannot boot, and it runs ${runs}`);
    console.error(
      String(error instanceof Error ? error.message : error)
        .split('\n')
        .map((l) => `        ${l}`)
        .join('\n'),
    );
  }
}

if (failed) {
  console.error('\nAdd the missing variables to docker-compose.yml, or the documented');
  console.error('commands for that service will fail on a clean clone.');
  process.exit(1);
}
