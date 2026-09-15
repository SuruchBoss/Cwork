/**
 * Rules for the one-time token that lets the browser finish a first-run setup.
 *
 * The token is the only thing standing between a freshly deployed Cwork and
 * whoever finds it first, so the rules are deliberately dull: it is minted only
 * by a process with shell access to the server, it works once, and it stops
 * working within the hour whether or not anybody used it.
 */

/**
 * How long a token stays good for.
 *
 * Long enough to run `db:init`, read the terminal, and walk to a browser on
 * another machine; short enough that a token left in a scrollback buffer or a
 * CI log is worthless by the time anyone finds it.
 */
export const SETUP_TOKEN_TTL_MINUTES = 60;

/** Bytes of entropy behind each token. 32 bytes is what session tokens get. */
export const SETUP_TOKEN_BYTES = 32;

export function setupTokenExpiry(now: Date): Date {
  return new Date(now.getTime() + SETUP_TOKEN_TTL_MINUTES * 60_000);
}

/** What a token record looks like to these rules. Narrower than the Prisma row. */
export interface SetupTokenRecord {
  expiresAt: Date;
  usedAt: Date | null;
}

export type SetupTokenVerdict = 'valid' | 'unknown' | 'expired' | 'spent';

/**
 * Why a token is or is not usable.
 *
 * The caller turns every rejection into the same 401 with the same message:
 * telling the difference between "never existed", "expired" and "already used"
 * would let someone map out which guesses were close.
 */
export function classifySetupToken(
  record: SetupTokenRecord | null | undefined,
  now: Date,
): SetupTokenVerdict {
  if (!record) return 'unknown';
  if (record.usedAt) return 'spent';
  if (record.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}
