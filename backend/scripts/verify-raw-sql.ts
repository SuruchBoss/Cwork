/**
 * Every raw SQL statement in `src/` has been read, and says why it is safe.
 *
 * ADR-0003 makes tenant scoping explicit: every query filters on
 * `organizationId`, and the ADR calls that "greppable" so a reviewer can check
 * it. Prisma's query builder makes the ordinary case hard to get wrong — the
 * argument is typed and a missing filter is visible in the call. Raw SQL is
 * where that stops being true. `$queryRaw` takes a string, the compiler has no
 * opinion about it, and a `WHERE` clause twenty lines below the call site is
 * exactly the kind of thing a reviewer skims past.
 *
 *     npm run verify:sql
 *
 * This is a tripwire, not a proof. It cannot tell a real predicate from the
 * word `organizationId` appearing in a SELECT list — `outbox.dispatcher.ts`
 * below does precisely that and is correct anyway. What it can do is refuse to
 * let a raw statement exist that nobody has classified: a new one fails the
 * build with "read this and add it to the list", and a stale entry fails too,
 * so the list cannot quietly describe code that is no longer there.
 *
 * The check is therefore on the process, which is the honest thing to automate.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

const srcDir = join(__dirname, '..', 'src');

type Scoping = 'tenant-scoped' | 'not-tenant-data';

/**
 * One entry per raw statement. `marker` is a distinctive fragment of the SQL,
 * so the entry follows the query when lines move around it.
 */
const REVIEWED: { file: string; marker: string; scoping: Scoping; why: string }[] = [
  {
    file: 'modules/assistant/knowledge.service.ts',
    marker: 'ts_rank',
    scoping: 'tenant-scoped',
    why: 'lexical knowledge search joins knowledge_documents and filters d."organizationId"',
  },
  {
    file: 'modules/assistant/knowledge.service.ts',
    marker: 'c."embedding" <=>',
    scoping: 'tenant-scoped',
    why: 'pgvector search, same join and the same d."organizationId" filter',
  },
  {
    file: 'core/utils/sequence.service.ts',
    marker: 'INSERT INTO "number_sequences"',
    scoping: 'tenant-scoped',
    why: 'organizationId is in the inserted row and in the ON CONFLICT target',
  },
  {
    file: 'core/outbox/outbox.dispatcher.ts',
    marker: 'FOR UPDATE SKIP LOCKED',
    scoping: 'not-tenant-data',
    why:
      'the relay is a background worker acting for the deployment, not for a caller, ' +
      'so it claims every due event and carries organizationId through to the handler. ' +
      'It selects the column; it deliberately does not filter on it',
  },
  {
    file: 'modules/jobs/job-lock.service.ts',
    marker: 'pg_try_advisory_xact_lock',
    scoping: 'not-tenant-data',
    why: 'an advisory lock keyed by job name — a lock, not a row',
  },
  {
    file: 'modules/setup/setup.service.ts',
    marker: 'pg_try_advisory_xact_lock',
    scoping: 'not-tenant-data',
    why: 'the first-run lock, taken before any organisation exists to scope to',
  },
  {
    file: 'core/prisma/prisma.service.ts',
    marker: 'SELECT tablename FROM pg_tables',
    scoping: 'not-tenant-data',
    why: 'reads the catalogue to build the truncate list; touches no tenant row',
  },
  {
    file: 'core/prisma/prisma.service.ts',
    marker: 'TRUNCATE TABLE',
    scoping: 'not-tenant-data',
    why: 'empties every table for tests; scoping it to one organisation would defeat it',
  },
  {
    file: 'core/security/postgres-throttler.storage.ts',
    marker: 'INSERT INTO rate_limit_counters',
    scoping: 'not-tenant-data',
    why: 'counters are keyed by client and route, and rate limiting applies before sign-in',
  },
];

/** Raw-SQL calls, with the statement that follows each one. */
function rawStatements(file: string, text: string): { file: string; sql: string; line: number }[] {
  const found: { file: string; sql: string; line: number }[] = [];
  const call = /\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)\b/g;

  for (const m of text.matchAll(call)) {
    const from = m.index ?? 0;
    // Everything up to the end of the template literal or call that follows.
    const rest = text.slice(from);
    const backtick = rest.indexOf('`');
    const paren = rest.indexOf('(');
    let sql: string;
    if (backtick !== -1 && (paren === -1 || backtick < paren + 3)) {
      const close = rest.indexOf('`', backtick + 1);
      sql = rest.slice(backtick + 1, close === -1 ? undefined : close);
    } else {
      sql = rest.slice(0, 400);
    }
    found.push({ file, sql, line: text.slice(0, from).split('\n').length });
  }
  return found;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });
}

const statements = walk(srcDir).flatMap((full) =>
  rawStatements(relative(srcDir, full).split('\\').join('/'), readFileSync(full, 'utf8')),
);

const problems: string[] = [];
const matched = new Set<number>();

for (const stmt of statements) {
  const index = REVIEWED.findIndex(
    (entry, i) => !matched.has(i) && entry.file === stmt.file && stmt.sql.includes(entry.marker),
  );
  if (index === -1) {
    problems.push(
      `${stmt.file}:${stmt.line} — raw SQL nobody has classified.\n` +
        '      Read it, decide whether it touches tenant data, and add it to REVIEWED\n' +
        `      in ${relative(join(__dirname, '..', '..'), __filename)} with the reason.`,
    );
    continue;
  }
  matched.add(index);

  const entry = REVIEWED[index];
  if (entry.scoping === 'tenant-scoped' && !stmt.sql.includes('organizationId')) {
    problems.push(
      `${stmt.file}:${stmt.line} — classified tenant-scoped, but the statement never ` +
        'mentions organizationId.',
    );
  }
}

for (let i = 0; i < REVIEWED.length; i++) {
  if (!matched.has(i)) {
    problems.push(
      `${REVIEWED[i].file} — no raw statement contains "${REVIEWED[i].marker}" any more. ` +
        'The query changed or went away; remove the entry or update its marker.',
    );
  }
}

if (problems.length > 0) {
  console.error(`${statements.length} raw statements, ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const scoped = REVIEWED.filter((r) => r.scoping === 'tenant-scoped').length;
console.log(
  `  ${statements.length} raw statements, all classified — ` +
    `${scoped} tenant-scoped, ${REVIEWED.length - scoped} not tenant data`,
);
