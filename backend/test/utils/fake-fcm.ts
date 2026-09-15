/**
 * A stand-in for Firebase Cloud Messaging's HTTP v1 API.
 *
 * Covers both halves of the exchange: the OAuth token endpoint that trades a
 * signed service-account assertion for an access token, and the send endpoint.
 * The assertion is verified against the key pair the test generates, so a
 * client that signed it wrongly fails here rather than passing quietly.
 */
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';

export type FakeFcmBehaviour =
  | { kind: 'accept' }
  /** FCM's answer for an app that has been uninstalled. */
  | { kind: 'unregistered' }
  /** A transient server-side failure, worth retrying. */
  | { kind: 'unavailable' }
  /** Credentials the project does not accept. */
  | { kind: 'forbidden' };

export interface SentPush {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface FakeFcm {
  url: string;
  tokenUri: string;
  projectId: string;
  clientEmail: string;
  privateKey: string;
  sent: SentPush[];
  tokenRequests: number;
  /** True when every assertion presented so far verified against the key. */
  assertionsValid: boolean;
  behaviour: FakeFcmBehaviour;
  close: () => Promise<void>;
}

export async function startFakeFcm(
  behaviour: FakeFcmBehaviour = { kind: 'accept' },
): Promise<FakeFcm> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const sent: SentPush[] = [];
  const state = { behaviour, tokenRequests: 0, assertionsValid: true };
  const projectId = 'cwork-test';
  const clientEmail = 'push@cwork-test.iam.gserviceaccount.com';

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const reply = (status: number, payload: unknown): void => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(payload));
      };

      if (request.url === '/token') {
        state.tokenRequests += 1;
        const assertion = new URLSearchParams(body).get('assertion') ?? '';
        if (!verifyAssertion(assertion, publicKey, clientEmail)) state.assertionsValid = false;
        reply(200, { access_token: 'fake-access-token', expires_in: 3600 });
        return;
      }

      if (request.url === `/v1/projects/${projectId}/messages:send`) {
        if (request.headers.authorization !== 'Bearer fake-access-token') {
          reply(401, { error: { status: 'UNAUTHENTICATED' } });
          return;
        }

        switch (state.behaviour.kind) {
          case 'unregistered':
            reply(404, { error: { status: 'NOT_FOUND', message: 'UNREGISTERED' } });
            return;
          case 'unavailable':
            reply(503, { error: { status: 'UNAVAILABLE' } });
            return;
          case 'forbidden':
            reply(403, { error: { status: 'PERMISSION_DENIED' } });
            return;
          default: {
            const parsed = JSON.parse(body) as {
              message: {
                token: string;
                notification: { title: string; body: string };
                data: Record<string, string>;
              };
            };
            sent.push({
              token: parsed.message.token,
              title: parsed.message.notification.title,
              body: parsed.message.notification.body,
              data: parsed.message.data,
            });
            reply(200, { name: `projects/${projectId}/messages/1` });
          }
        }
        return;
      }

      reply(404, { error: { status: 'NOT_FOUND' } });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fake fcm has no port');

  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    tokenUri: `${url}/token`,
    projectId,
    clientEmail,
    privateKey,
    sent,
    get tokenRequests() {
      return state.tokenRequests;
    },
    get assertionsValid() {
      return state.assertionsValid;
    },
    get behaviour() {
      return state.behaviour;
    },
    set behaviour(next: FakeFcmBehaviour) {
      state.behaviour = next;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function verifyAssertion(assertion: string, publicKey: string, clientEmail: string): boolean {
  const [head, claims, signature] = assertion.split('.');
  if (!head || !claims || !signature) return false;

  const verified = createVerify('RSA-SHA256')
    .update(`${head}.${claims}`)
    .verify(publicKey, Buffer.from(signature, 'base64url'));
  if (!verified) return false;

  const payload = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')) as {
    iss?: string;
    exp?: number;
  };
  return payload.iss === clientEmail && (payload.exp ?? 0) > Math.floor(Date.now() / 1000);
}
