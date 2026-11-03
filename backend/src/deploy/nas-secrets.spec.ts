// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * How the NAS installer takes a secret (CW-062): from a file or by being typed,
 * never from the command line. The helpers live in `deploy/nas/lib.sh` and are
 * plain POSIX sh, so they are run here the way the installer runs them.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const LIB = resolve(__dirname, '../../../deploy/nas/lib.sh');

const run = (script: string) =>
  spawnSync('sh', ['-c', `. "${LIB}"\n${script}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

describe('the installer’s secrets', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cwork-secret-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const file = (name: string, content: string, mode = 0o600) => {
    const path = join(dir, name);
    writeFileSync(path, content);
    chmodSync(path, mode);
    return path;
  };

  it('reads the first line of a file and nothing else', () => {
    const path = file('password', 's3cret-value\nsecond line\n');

    const result = run(`secret_from_file "${path}"`);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('s3cret-value');
  });

  it('reads a file that has no newline at the end', () => {
    const path = file('key', 'abc123');

    expect(run(`secret_from_file "${path}"`).stdout).toBe('abc123');
  });

  it('refuses a file that is missing or empty, saying which', () => {
    const missing = run(`secret_from_file "${join(dir, 'nope')}"`);
    const empty = run(`secret_from_file "${file('empty', '\n')}"`);

    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('cannot read');
    expect(empty.status).toBe(1);
    expect(empty.stderr).toContain('is empty');
  });

  it('warns about a file other users can read, without letting the warning into the secret', () => {
    const path = file('open', 'value', 0o644);

    const result = run(`secret_from_file "${path}"`);

    expect(result.stdout).toBe('value');
    expect(result.stderr).toContain('can be read by other users');
  });

  it('does not ask when there is no terminal to type on', () => {
    const result = run('ask_secret "Password: "');

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });
});
