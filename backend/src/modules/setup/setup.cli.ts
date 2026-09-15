/**
 * `npm run db:init` — turns an empty database into one somebody can sign into.
 *
 * Running this is the proof of being the operator: it needs shell access to the
 * server, which is the one credential a stranger who finds a fresh deployment
 * does not have. Everything the web wizard is allowed to do, it is allowed to do
 * because this command handed it a token.
 *
 * Two ways to use it:
 *
 *   npm run db:init              set the organisation up right here
 *   npm run db:init -- --web     print a one-time token and finish in a browser
 *
 * Both refuse outright on a database that already has an organisation. Neither
 * ever prints a TOTP secret — the first administrator enrols its second factor
 * at its first sign-in, through the same path as everybody else.
 *
 * A built image can run this without ts-node:
 *   node dist/modules/setup/setup.cli.js --web
 */
import { createInterface, type Interface } from 'node:readline/promises';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { APP_CONFIG, AppConfigModule } from '../../core/config/config.module';
import type { RootConfig } from '../../core/config/configuration';
import { DomainError } from '../../core/errors/domain.errors';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { assertPasswordPolicy } from '../auth/password.policy';
import {
  ORGANIZATION_CODE_PATTERN,
  ORGANIZATION_CODE_RULE,
  isKnownTimezone,
  suggestOrganizationCode,
} from './domain/organization-code';
import { SETUP_TOKEN_TTL_MINUTES } from './domain/setup-token';
import { missingAnswers, parseCliOptions, type CliOptions } from './domain/cli-options';
import { SetupModule } from './setup.module';
import { SetupService } from './setup.service';

/**
 * The smallest graph that can run setup. Deliberately not `AppModule`: this has
 * to work before there is anything to serve, and booting the scheduler, the
 * outbox poller and every feature module to create one row would mean a config
 * problem in an unrelated module could block the install. `SetupModule` carries
 * its own crypto for the same reason.
 */
@Module({ imports: [AppConfigModule, PrismaModule, SetupModule] })
class SetupCliModule {}

const USAGE = `
Cwork first-run setup

  npm run db:init                     set this installation up interactively
  npm run db:init -- --web            print a one-time token for the browser wizard

Options
  --name <text>        organisation name
  --code <text>        short code used in logs (${ORGANIZATION_CODE_RULE})
  --timezone <tz>      IANA timezone, e.g. Asia/Bangkok
  --email <address>    the first administrator's sign-in address
  --password <text>    the first administrator's password
  --web                issue a setup token instead of setting up here
  -h, --help           this text

Anything not passed as an option is asked for. The password can also come from
CWORK_ADMIN_PASSWORD, which keeps it out of shell history and out of \`ps\`.
`.trim();

async function main(): Promise<number> {
  const parsed = parseCliOptions(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    return 1;
  }
  if (parsed.options.help) {
    console.log(USAGE);
    return 0;
  }

  const options: CliOptions = {
    ...parsed.options,
    password: parsed.options.password ?? process.env.CWORK_ADMIN_PASSWORD,
  };

  const context = await NestFactory.createApplicationContext(SetupCliModule, {
    logger: ['error', 'warn'],
  });

  try {
    const setup = context.get(SetupService);
    const config = context.get<RootConfig>(APP_CONFIG);

    if (await setup.isInitialised()) {
      console.error(
        [
          'This database already has an organisation — setup has already run.',
          '',
          'Nothing has been changed. If you meant to start over, point',
          'DATABASE_URL at an empty database, or reset this one with',
          '`npm run db:reset` (which destroys everything in it).',
        ].join('\n'),
      );
      return 1;
    }

    return parsed.options.web
      ? await issueToken(setup, config)
      : await runInteractiveSetup(setup, config, options);
  } catch (error) {
    console.error(describe(error));
    return 1;
  } finally {
    await context.close();
  }
}

async function issueToken(setup: SetupService, config: RootConfig): Promise<number> {
  const { token, expiresAt } = await setup.issueToken();
  const wizardUrl = `${config.delivery.publicWebUrl}/setup`;

  console.log(
    [
      '',
      `Setup token — single use, expires in ${SETUP_TOKEN_TTL_MINUTES} minutes`,
      `(${expiresAt.toISOString()}):`,
      '',
      `    ${token}`,
      '',
      'Finish setup in a browser at:',
      '',
      `    ${wizardUrl}`,
      '',
      'Whoever holds this token can create an administrator with every',
      'permission there is. Do not paste it into a chat, an issue or a CI log.',
      'If one leaks before you have used it, finish setup now: issuing another',
      'token does not cancel this one, and the only other cure is an empty',
      'database.',
      '',
    ].join('\n'),
  );
  return 0;
}

async function runInteractiveSetup(
  setup: SetupService,
  config: RootConfig,
  options: CliOptions,
): Promise<number> {
  const outstanding = missingAnswers(options);

  if (outstanding.length > 0 && !process.stdin.isTTY) {
    console.error(
      `Nothing to read from: ${outstanding.join(', ')} were not supplied and stdin is not a terminal.\n` +
        'Pass them as options (see --help), or use --web and finish in a browser.',
    );
    return 1;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nSetting up Cwork. Ctrl-C at any point leaves the database untouched.\n');

    // Every `??` below falls through to a prompt only for an answer that was not
    // passed as an option, and the guard above has already established that
    // there is a terminal to read one from.

    const name =
      options.name ??
      (await ask(rl, 'Organisation name', undefined, (value) =>
        value.trim().length >= 2 ? null : 'At least two characters, please.',
      ));

    // The one answer setup can invent, so it is the one answer a scripted run
    // may leave out: a suggestion derived from the name beats refusing to start.
    const suggestedCode = suggestOrganizationCode(name);
    const code =
      options.code ??
      (process.stdin.isTTY
        ? await ask(rl, 'Short code (for logs)', suggestedCode, (value) =>
            ORGANIZATION_CODE_PATTERN.test(value.trim().toUpperCase())
              ? null
              : ORGANIZATION_CODE_RULE,
          )
        : suggestedCode);

    const timezone =
      options.timezone ??
      (await ask(rl, 'Timezone', config.app.defaults.timezone, (value) =>
        isKnownTimezone(value.trim()) ? null : 'Not a timezone this server knows about.',
      ));

    const email =
      options.email ??
      (await ask(rl, "Administrator's email", undefined, (value) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : 'That is not an email address.',
      ));

    // Checked here rather than left to `initialise`, so a password that is a
    // character short costs one line instead of all five answers above it.
    const password =
      options.password ??
      (await askForPassword(rl, (value) => {
        try {
          assertPasswordPolicy({
            password: value,
            minLength: config.auth.passwordMinLength,
            email,
          });
          return null;
        } catch (error) {
          return error instanceof DomainError ? error.message : 'That password is not acceptable.';
        }
      }));

    const result = await setup.initialise({
      organizationName: name,
      organizationCode: code,
      timezone: timezone.trim(),
      adminEmail: email,
      adminPassword: password,
    });

    console.log(
      [
        '',
        `  Organisation   ${result.organization.name}  (${result.organization.code})`,
        `  Timezone       ${result.organization.timezone}`,
        `  Roles          ${result.rolesCreated} system roles`,
        `  Administrator  ${result.administrator.email}  ·  ${result.administrator.role}`,
        '',
        'Next:',
        `  1. Open ${config.delivery.publicWebUrl} and sign in as ${result.administrator.email}.`,
        '  2. You will be asked to enrol two-factor authentication before the',
        '     session starts — that account holds every permission, so Cwork',
        '     requires it. Have an authenticator app ready. This command never',
        '     prints a TOTP secret; you enrol it yourself, once.',
        '  3. Add departments, positions and employees from Organisation.',
        '',
        'This database holds no demo data, and `npm run db:seed` must not be run',
        'against it — it is for evaluation installs only.',
        '',
      ].join('\n'),
    );
    return 0;
  } finally {
    rl.close();
  }
}

/** Asks until the answer passes, so a typo costs a line rather than the run. */
async function ask(
  rl: Interface,
  label: string,
  fallback: string | undefined,
  validate: (value: string) => string | null,
): Promise<string> {
  const prompt = fallback ? `${label} [${fallback}]: ` : `${label}: `;

  for (;;) {
    const answer = (await rl.question(prompt)).trim() || fallback || '';
    const problem = validate(answer);
    if (!problem) return answer;
    console.log(`  ${problem}`);
  }
}

async function askForPassword(
  rl: Interface,
  validate: (value: string) => string | null,
): Promise<string> {
  for (;;) {
    const password = await askSecret(rl, "Administrator's password: ");
    if (!password) {
      console.log('  A password is required.');
      continue;
    }
    const problem = validate(password);
    if (problem) {
      console.log(`  ${problem}`);
      continue;
    }
    const again = await askSecret(rl, 'Confirm password: ');
    if (password !== again) {
      console.log('  Those do not match. Again.');
      continue;
    }
    return password;
  }
}

/**
 * Reads a line without echoing it.
 *
 * The prompt is written first, then the output stream itself is silenced for as
 * long as the question is open. Muting the stream rather than readline's own
 * `_writeToOutput` is deliberate: that property is an implementation detail and
 * is simply absent from `readline/promises` on current Node, so an
 * implementation reaching for it does not mute anything — it throws, or worse,
 * echoes the password. Nothing else in this command writes to stdout while a
 * prompt is open, so there is nothing else to lose.
 */
async function askSecret(rl: Interface, prompt: string): Promise<string> {
  const stdout = process.stdout as NodeJS.WriteStream & { write: unknown };
  const write = process.stdout.write.bind(process.stdout);

  write(prompt);
  stdout.write = () => true;
  try {
    return (await rl.question('')).trim();
  } finally {
    stdout.write = write;
    write('\n');
  }
}

function describe(error: unknown): string {
  if (error instanceof DomainError) {
    const details = error.details?.problems;
    return Array.isArray(details)
      ? `Setup refused:\n  - ${details.join('\n  - ')}`
      : `Setup refused: ${error.message}`;
  }
  return error instanceof Error
    ? `Setup failed: ${error.message}`
    : `Setup failed: ${String(error)}`;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    new Logger('db:init').error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
