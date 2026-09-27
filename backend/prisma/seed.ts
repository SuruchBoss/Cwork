// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * `npm run db:seed:base` — the demo company, for evaluating Cwork locally.
 *
 * The seed itself is `src/modules/demo/seed/demo-company.ts`, where the public
 * demo's reset can run it too. This file is the command-line half: it picks the
 * password, and prints how to sign in, once.
 *
 * Every account shares one password — `SEED_PASSWORD`, or one generated for the
 * run and printed at the end. Never a value written down anywhere: the
 * privileged demo accounts sit behind it too, and a default printed in the
 * README would be the same password on every installation that did not
 * override it.
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  DEMO_MFA_SECRET,
  SeedRefused,
  seedDemoCompany,
} from '../src/modules/demo/seed/demo-company';

const prisma = new PrismaClient();

const PASSWORD_FROM_ENV = Boolean(process.env.SEED_PASSWORD);
const PASSWORD = process.env.SEED_PASSWORD || randomBytes(15).toString('base64url');

async function main(): Promise<void> {
  console.log('Seeding Cwork with DEMO DATA — evaluation only, never a real installation.');

  const summary = await seedDemoCompany(prisma, {
    password: PASSWORD,
    encryptionKey: process.env.FIELD_ENCRYPTION_KEY,
    force: process.env.SEED_FORCE === '1',
    log: (line) => console.log(line),
  });

  console.log('\nSeed complete — this is demo data.');
  console.log(`  Sign in at /api/v1/auth/login with any of:`);
  for (const account of summary.accounts) {
    const marker = account.needsSecondFactor ? '  [needs a 2FA code]' : '';
    console.log(`    ${account.email.padEnd(30)} (${account.role})${marker}`);
  }
  console.log(`  Password: ${PASSWORD}`);
  if (!PASSWORD_FROM_ENV) {
    console.log('            (generated for this run and shown only here — note it now,');
    console.log('             or set SEED_PASSWORD and re-run to choose your own)');
  }

  if (summary.recoveryCodes.length > 0) {
    const issuer = encodeURIComponent(summary.organizationName);
    console.log('\n  Two-factor authentication');
    console.log('  ------------------------');
    console.log('  The accounts marked above hold privileged permissions, so a password');
    console.log('  alone will not sign them in. Add this secret to any authenticator app');
    console.log('  once and they all work:');
    console.log(`\n    secret : ${DEMO_MFA_SECRET}`);
    console.log(
      `    or QR  : otpauth://totp/${encodeURIComponent(`${summary.organizationName}:demo`)}` +
        `?secret=${DEMO_MFA_SECRET}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    );
    console.log('\n  Recovery codes (single use, work in place of a code):');
    for (const code of summary.recoveryCodes) console.log(`    ${code}`);
    console.log('\n  This is a published demo secret. Never use it anywhere real.');
  } else if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.log('\n  FIELD_ENCRYPTION_KEY is not set, so the privileged demo accounts were');
    console.log('  left without a second factor — and they cannot sign in until they enrol.');
  }

  console.log('\n  These are demo credentials, not a way to run Cwork. Setting up an');
  console.log('  installation for real people is `npm run db:init`, not this.');
}

main()
  .catch((error) => {
    console.error(
      error instanceof SeedRefused ? `\n${error.message}` : `Seed failed: ${String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
