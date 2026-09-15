import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every notification joins the transaction of the change it is about.
 *
 * This is a guard rather than a test of behaviour, and it exists because the
 * failure it catches is invisible: `notify` and `notifyIn` both work, both
 * write the same rows, and the difference only shows on the day a process dies
 * between committing an approval and announcing it. Nothing in review would
 * catch a new feature reaching for the shorter name.
 *
 * Adding a caller to the list below is a decision, not a formality: it says
 * there is no write for the notification to be atomic with.
 */
const BEST_EFFORT_ALLOWED: Record<string, string> = {
  'modules/files/files.service.ts':
    'An upload refused by the scanner stores nothing, so there is no write to join.',
};

const SRC = join(__dirname, '..', '..');

function typescriptFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return typescriptFilesUnder(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('notification call sites', () => {
  it('uses the transaction-joining methods everywhere it can', () => {
    const offenders = typescriptFilesUnder(SRC)
      .filter((path) => /notifications\.notify(Many)?\(/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SRC.length + 1).replace(/\\/g, '/'))
      .filter((relative) => !(relative in BEST_EFFORT_ALLOWED));

    expect(offenders).toEqual([]);
  });

  it('keeps the allow-list honest', () => {
    // A stale exemption is worse than none: it reads as a considered decision
    // long after the call it excused has gone.
    for (const relative of Object.keys(BEST_EFFORT_ALLOWED)) {
      const source = readFileSync(join(SRC, relative), 'utf8');
      expect(source).toMatch(/notifications\.notify(Many)?\(/);
    }
  });
});
