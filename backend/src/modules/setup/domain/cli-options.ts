/**
 * Argument parsing for `npm run db:init`, kept pure so it can be tested without
 * a terminal, a database or a Nest context.
 */

export interface CliOptions {
  help: boolean;
  /** Issue a one-time token for the browser wizard instead of setting up here. */
  web: boolean;
  name?: string;
  code?: string;
  timezone?: string;
  email?: string;
  password?: string;
}

export type CliParse = { ok: true; options: CliOptions } | { ok: false; error: string };

const VALUE_FLAGS = {
  '--name': 'name',
  '--code': 'code',
  '--timezone': 'timezone',
  '--email': 'email',
  '--password': 'password',
} as const;

/** The answers setup cannot invent. `code` is derived from the name if absent. */
export const REQUIRED_ANSWERS = ['name', 'timezone', 'email', 'password'] as const;
export type RequiredAnswer = (typeof REQUIRED_ANSWERS)[number];

export function parseCliOptions(argv: readonly string[]): CliParse {
  const options: CliOptions = { help: false, web: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--web') {
      options.web = true;
      continue;
    }

    // `--name=Acme` and `--name Acme` are both common enough that refusing
    // either would just be a papercut.
    const [flag, inlineValue] = splitInline(arg);
    const field = VALUE_FLAGS[flag as keyof typeof VALUE_FLAGS];
    if (!field) {
      return { ok: false, error: `Unknown option "${arg}". Run with --help to see the options.` };
    }

    const value = inlineValue ?? argv[++i];
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, error: `${flag} needs a value.` };
    }
    options[field] = value;
  }

  if (options.web) {
    const supplied = (Object.keys(VALUE_FLAGS) as (keyof typeof VALUE_FLAGS)[]).filter(
      (flag) => options[VALUE_FLAGS[flag]] !== undefined,
    );
    if (supplied.length > 0) {
      // --web creates nothing, so an answer passed alongside it would be
      // silently discarded. Say so rather than appearing to accept it.
      return {
        ok: false,
        error: `--web only issues a token; ${supplied.join(', ')} would be ignored. Drop one or the other.`,
      };
    }
  }

  return { ok: true, options };
}

/** Which answers still have to be asked for. */
export function missingAnswers(options: CliOptions): RequiredAnswer[] {
  return REQUIRED_ANSWERS.filter((field) => {
    const value = options[field];
    return value === undefined || value.trim() === '';
  });
}

function splitInline(arg: string): [string, string | undefined] {
  const at = arg.indexOf('=');
  return at === -1 ? [arg, undefined] : [arg.slice(0, at), arg.slice(at + 1)];
}
