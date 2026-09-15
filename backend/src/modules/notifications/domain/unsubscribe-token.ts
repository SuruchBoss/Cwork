import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A one-click unsubscribe link that needs no table and no expiry.
 *
 * The token is the user id plus an HMAC of it, so the server can check a link
 * it never stored. Nothing else is needed: the link does exactly one thing, to
 * exactly one account, and an attacker who guesses one can turn somebody's
 * email off — which is the least interesting thing an attacker could do, and
 * undone from the settings page in a click.
 *
 * The key is *derived* from the session secret rather than being it, so a
 * signature here can never be mistaken for a token anywhere else. Rotating the
 * session secret invalidates old links, which is the same bargain as rotating
 * it logging everybody out.
 */
const LABEL = 'cwork:unsubscribe:v1';

function keyFor(secret: string): Buffer {
  return createHmac('sha256', secret).update(LABEL).digest();
}

function base64url(value: Buffer): string {
  return value.toString('base64url');
}

export function createUnsubscribeToken(userId: string, secret: string): string {
  const signature = createHmac('sha256', keyFor(secret)).update(userId).digest();
  return `${base64url(Buffer.from(userId, 'utf8'))}.${base64url(signature)}`;
}

/** The user id the token is for, or `null` if it was not signed by us. */
export function readUnsubscribeToken(token: string, secret: string): string | null {
  const [encodedId, signature] = token.split('.');
  if (!encodedId || !signature) return null;

  let userId: string;
  try {
    userId = Buffer.from(encodedId, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!userId) return null;

  const expected = Buffer.from(createUnsubscribeToken(userId, secret).split('.')[1], 'base64url');
  let given: Buffer;
  try {
    given = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }

  // Length first: timingSafeEqual throws on a mismatch rather than returning
  // false, and a thrown error would be a 500 where a 404 belongs.
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? userId : null;
}
