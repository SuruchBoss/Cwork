// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { createSign } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { PermanentDeliveryError } from '../../core/outbox/delivery-error';

/** Renew a little early: a token that expires mid-flight looks like a bad key. */
const TOKEN_SKEW_MS = 60_000;

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export interface PushMessage {
  deviceToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Firebase Cloud Messaging over its HTTP v1 API.
 *
 * Two requests' worth of protocol — sign a JWT with the service account key,
 * trade it for an access token, POST the message — so it is written here rather
 * than brought in with the Firebase Admin SDK and its dependency tree. iOS goes
 * through FCM as well, which is how the app registers either way, so there is
 * no separate APNs client.
 *
 * The distinction that matters is the same one SMTP makes: a 401 or a 503 is
 * worth retrying, and `UNREGISTERED` means the app was uninstalled and the
 * token will never work again. The second also earns the row a deletion — a
 * device table nobody prunes is one that grows for ever and slows every send.
 */
@Injectable()
export class FcmClient {
  private readonly logger = new Logger(FcmClient.name);
  private accessToken?: { value: string; expiresAt: number };

  constructor(@Inject(APP_CONFIG) private readonly config: RootConfig) {}

  /**
   * Whether push is on.
   *
   * Only the switch needs checking: `validateEnv` refuses to boot with
   * `PUSH_ENABLED=true` and any of the three credentials missing, so a
   * half-configured client is not a state this can reach.
   */
  get enabled(): boolean {
    return this.config.delivery.push.enabled;
  }

  /**
   * Sends one message.
   *
   * Returns `'unregistered'` when the device is gone, rather than throwing:
   * the app being uninstalled is not a delivery failure worth retrying, and it
   * is the caller who knows which row to delete.
   */
  async send(message: PushMessage): Promise<'sent' | 'unregistered'> {
    const { projectId, endpoint, timeoutMs } = this.config.delivery.push;
    const token = await this.authorise();

    const response = await this.fetchWithTimeout(
      `${endpoint}/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: message.deviceToken,
            notification: { title: message.title, body: message.body },
            data: message.data ?? {},
          },
        }),
      },
      timeoutMs,
    );

    if (response.ok) return 'sent';

    const detail = await response.text();

    // 404, or a 400 naming the token, is FCM saying this device is gone.
    if (response.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(detail)) {
      this.logger.debug(`FCM rejected a device token as gone: ${detail.slice(0, 200)}`);
      return 'unregistered';
    }

    const summary = `FCM ${response.status}: ${detail.slice(0, 300)}`;
    // 401/403 is a credential problem — real, but not one this message can fix
    // by being sent again in thirty seconds, and worth a dead letter that names
    // it rather than eight quiet retries.
    if (response.status === 401 || response.status === 403) {
      throw new PermanentDeliveryError(summary);
    }
    throw new Error(summary);
  }

  // ---------------------------------------------------------------- internals

  /** A cached OAuth access token, minted from the service account key. */
  private async authorise(): Promise<string> {
    const cached = this.accessToken;
    if (cached && cached.expiresAt - TOKEN_SKEW_MS > Date.now()) return cached.value;

    const { clientEmail, privateKey, tokenUri, timeoutMs } = this.config.delivery.push;
    if (!clientEmail || !privateKey) throw new Error('FCM credentials are not configured');

    const assertion = signServiceAccountJwt(clientEmail, privateKey, tokenUri);

    const response = await this.fetchWithTimeout(
      tokenUri,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
      },
      timeoutMs,
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      // A key Google will not accept is not going to be accepted later either.
      throw new PermanentDeliveryError(`FCM token exchange failed (${response.status}): ${detail}`);
    }

    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('FCM token exchange returned no access token');

    this.accessToken = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    return body.access_token;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: abort.signal });
    } catch (error) {
      // An aborted fetch reads as a DOMException with no useful message.
      if (abort.signal.aborted) throw new Error(`FCM request to ${url} timed out`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * The service account assertion: a JWT signed RS256 with the private key.
 *
 * Written out because it is fifteen lines of `node:crypto` and the alternative
 * is a JWT library plus a Google SDK to use it.
 */
export function signServiceAccountJwt(
  clientEmail: string,
  privateKey: string,
  audience: string,
  now: Date = new Date(),
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: SCOPE,
    aud: audience,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };

  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

  const signingInput = `${encode(header)}.${encode(claims)}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);

  return `${signingInput}.${signature.toString('base64url')}`;
}
