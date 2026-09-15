/**
 * Boots the real application for e2e tests.
 *
 * Everything that shapes a response — the global auth and permission guards,
 * the audit interceptor, the exception filter — lives in `AppModule`, so the
 * test app gets them for free. What `main.ts` adds on top of the module (the
 * route prefix, URI versioning and the validation pipe) is mirrored here,
 * because tests assert on paths and on rejected payloads.
 *
 * Helmet, compression and CORS are deliberately left out: they are transport
 * concerns that slow the suite down without changing a single assertion.
 */
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { generateTotpForStep, timeStepAt } from 'src/modules/auth/domain/totp';
import { APP_CONFIG } from 'src/core/config/config.module';
import type { RootConfig } from 'src/core/config/configuration';

/**
 * The body stays `any` on purpose: these are black-box HTTP assertions against
 * responses the specs already describe in prose, and threading real response
 * types through would couple the suite to internals it is meant to be
 * independent of.
 */
export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/** Thin wrapper over supertest so specs read as intent, not as HTTP plumbing. */
export class Api {
  constructor(
    private readonly app: INestApplication,
    private readonly base: string,
  ) {}

  private server(): Server {
    return this.app.getHttpServer() as Server;
  }

  async get<T = any>(path: string, token?: string): Promise<ApiResponse<T>> {
    const req = request(this.server()).get(this.base + path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    const res = await req;
    return { status: res.status, body: res.body };
  }

  async post<T = any>(path: string, token?: string, body?: unknown): Promise<ApiResponse<T>> {
    const req = request(this.server()).post(this.base + path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) req.send(body as object);
    const res = await req;
    return { status: res.status, body: res.body };
  }

  /**
   * Signs in, completing the second factor when the account owes one.
   *
   * The seed enrols the privileged demo accounts on a published secret, so the
   * suite can produce a real code rather than mocking the check away — which
   * would leave the interesting half of the flow untested.
   */
  async login(email: string, password = process.env.SEED_PASSWORD ?? 'Cwork2026!') {
    const res = await this.post('/auth/login', undefined, { email, password });
    if (res.status !== 200) {
      throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }

    if (res.body?.mfaRequired) {
      return this.completeMfa(email, res.body.challengeToken);
    }
    return res.body as SessionResponse;
  }

  private async completeMfa(email: string, challengeToken: string): Promise<SessionResponse> {
    const attempt = async (): Promise<ApiResponse> =>
      this.post('/auth/mfa/verify', undefined, {
        challengeToken,
        code: currentDemoCode(),
      });

    let verified = await attempt();
    if (verified.status !== 200) {
      // A code is single-use, so two sign-ins for the same account inside one
      // 30-second step collide. Wait for the next step and try once more.
      await waitForNextStep();
      verified = await attempt();
    }
    if (verified.status !== 200) {
      throw new Error(
        `MFA verify failed for ${email}: ${verified.status} ${JSON.stringify(verified.body)}`,
      );
    }
    return verified.body as SessionResponse;
  }

  async token(email: string): Promise<string> {
    return (await this.login(email)).accessToken;
  }
}

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: { displayName: string; roles: string[]; permissions: string[] };
}

/**
 * The secret `prisma/seed.ts` enrols the privileged demo accounts on. Published
 * on purpose: it is demo data, and the tests need to produce real codes.
 */
export const DEMO_MFA_SECRET = 'CWORKDEMOMFASECRET234567';

export function currentDemoCode(atMs = Date.now()): string {
  return generateTotpForStep(DEMO_MFA_SECRET, timeStepAt(atMs));
}

/** Sleeps until the next TOTP step begins, so a fresh code is available. */
export async function waitForNextStep(): Promise<void> {
  const msIntoStep = Date.now() % 30_000;
  await new Promise((resolve) => setTimeout(resolve, 30_000 - msIntoStep + 500));
}

export interface TestContext {
  app: INestApplication;
  api: Api;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  const config = app.get<RootConfig>(APP_CONFIG);

  app.setGlobalPrefix(config.app.apiPrefix, { exclude: ['health/live', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  await app.init();

  return {
    app,
    api: new Api(app, `/${config.app.apiPrefix}/v1`),
    close: () => app.close(),
  };
}
