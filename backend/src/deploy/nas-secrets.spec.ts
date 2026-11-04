// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * How the NAS installer takes a secret (CW-062): from a file or by being typed,
 * never from the command line. The helpers live in `deploy/nas/lib.sh` and are
 * plain POSIX sh, so they are run here the way the installer runs them.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const LIB = resolve(__dirname, '../../../deploy/nas/lib.sh');
const INSTALL = resolve(__dirname, '../../../deploy/nas/install.sh');

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

  describe('settling the secrets for an install', () => {
    /**
     * Runs the installer's own step with the inputs it would have after reading
     * the command line, and reports what it settled and what it said.
     */
    const settle = (inputs: Record<string, string>) => {
      const defaults: Record<string, string> = {
        MODE: 'full',
        DB_HOST: '',
        DB_PASSWORD: '',
        FIELD_KEY: '',
        DB_PASSWORD_FILE: '',
        FIELD_KEY_FILE: '',
        ASK_FIELD_KEY: '0',
        SECRET_ON_COMMAND_LINE: '0',
        DB_PASSWORD_SOURCE: '',
        FIELD_KEY_SOURCE: '',
      };
      const assignments = Object.entries({ ...defaults, ...inputs })
        .map(([name, value]) => `${name}='${value}'`)
        .join('\n');
      return run(
        `${assignments}\nresolve_install_secrets || exit $?\nsay_secret_sources\n` +
          'printf "DB=[%s]\\nKEY=[%s]\\nDBSRC=[%s]\\nKEYSRC=[%s]\\n" "$DB_PASSWORD" "$FIELD_KEY" "$DB_PASSWORD_SOURCE" "$FIELD_KEY_SOURCE"',
      );
    };
    const field = (out: string, name: string) =>
      new RegExp(`^${name}=\\[(.*)\\]$`, 'm').exec(out)?.[1];
    const printed = (out: string) =>
      out
        .split('\n')
        .filter((line) => line.includes('[ .. ]'))
        .join('\n');

    it('uses the database password it is given in a file, whatever the mode, and says where it came from', () => {
      const path = file('db-password', 'from-the-file\n');

      for (const mode of ['full', 'db']) {
        const result = settle({ MODE: mode, DB_PASSWORD_FILE: path });

        expect({ mode, status: result.status }).toEqual({ mode, status: 0 });
        expect(field(result.stdout, 'DB')).toBe('from-the-file');
        expect(field(result.stdout, 'DBSRC')).toBe(`the file ${path}`);
        expect(printed(result.stdout)).toContain(`database password: from the file ${path}`);
      }
    });

    it('uses the password from the environment or the command line when there is no file', () => {
      const environment = settle({
        DB_PASSWORD: 'from-the-environment',
        DB_PASSWORD_SOURCE: 'the environment (CWORK_DB_PASSWORD)',
      });
      const option = settle({
        DB_PASSWORD: 'from-the-option',
        DB_PASSWORD_SOURCE: 'the --db-password option',
        SECRET_ON_COMMAND_LINE: '1',
      });

      expect(field(environment.stdout, 'DB')).toBe('from-the-environment');
      expect(printed(environment.stdout)).toContain('from the environment (CWORK_DB_PASSWORD)');
      expect(field(option.stdout, 'DB')).toBe('from-the-option');
      expect(option.stdout).toContain('[WARN]');
    });

    it('lets a file win over the environment', () => {
      const path = file('db-password', 'from-the-file');

      const result = settle({ DB_PASSWORD_FILE: path, DB_PASSWORD: 'from-the-environment' });

      expect(field(result.stdout, 'DB')).toBe('from-the-file');
    });

    it('makes a new password only when none was given, and says so', () => {
      const result = settle({});

      expect(field(result.stdout, 'DB')).toMatch(/^[0-9a-f]{48}$/);
      expect(printed(result.stdout)).toContain(
        'database password: from a new one made by this installer',
      );
      expect(printed(result.stdout)).toContain(
        'encryption key: from a new one made by this installer',
      );
    });

    it('uses the saved encryption key it is given, for a full install', () => {
      const path = file('key', 'saved-key-value');

      const result = settle({ FIELD_KEY_FILE: path });

      expect(field(result.stdout, 'KEY')).toBe('saved-key-value');
      expect(printed(result.stdout)).toContain(`encryption key: from the file ${path}`);
    });

    it('makes no key for a database-only install, and says a given one is not used', () => {
      const result = settle({
        MODE: 'db',
        FIELD_KEY: 'given',
        FIELD_KEY_SOURCE: 'the --field-key option',
      });

      expect(field(result.stdout, 'KEY')).toBe('');
      expect(result.stdout).toContain('does not use it');
    });

    it('never prints a secret in what it says about them', () => {
      const path = file('db-password', 'visible-secret-123');
      const key = file('key', 'visible-key-456');

      const result = settle({ DB_PASSWORD_FILE: path, FIELD_KEY_FILE: key });

      expect(printed(result.stdout)).not.toContain('visible-secret-123');
      expect(printed(result.stdout)).not.toContain('visible-key-456');
    });

    it('writes the password it settled into .env, in every mode that has a database', () => {
      // The installer's own block that writes .env, run against a folder of its own.
      const source = readFileSync(INSTALL, 'utf8');
      const block = /^umask 077\n([\s\S]*?^chmod 600 "\$ENV_FILE")/m.exec(source)![1]!;
      const path = file('db-password', 'the-given-password');

      for (const mode of ['full', 'db', 'app']) {
        const target = join(dir, `env-${mode}`);
        const result = run(
          [
            `MODE=${mode} DB_HOST=nas.example DB_PASSWORD='' FIELD_KEY='' DB_PASSWORD_FILE='${path}'`,
            "FIELD_KEY_FILE='' ASK_FIELD_KEY=0 SECRET_ON_COMMAND_LINE=0 DB_PASSWORD_SOURCE='' FIELD_KEY_SOURCE=''",
            `HOST=10.0.0.5 PORT=8443 BACKUP_DIR='' HERE='${dir}' ENV_FILE='${target}'`,
            'resolve_install_secrets || exit $?',
            block,
          ].join('\n'),
        );

        expect({ mode, status: result.status }).toEqual({ mode, status: 0 });
        expect(readFileSync(target, 'utf8')).toContain('POSTGRES_PASSWORD=the-given-password\n');
      }
    });

    it('stops an app install that has no database password and nobody to ask', () => {
      const result = settle({ MODE: 'app', DB_HOST: 'nas.example' });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('--mode app needs --db-host and the database password');
    });
  });
});
