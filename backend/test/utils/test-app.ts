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

  /** Signs in and returns the session payload, failing loudly if it cannot. */
  async login(email: string, password = process.env.SEED_PASSWORD ?? 'Cwork2026!') {
    const res = await this.post('/auth/login', undefined, { email, password });
    if (res.status !== 200) {
      throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body as {
      accessToken: string;
      refreshToken: string;
      user: { displayName: string; roles: string[]; permissions: string[] };
    };
  }

  async token(email: string): Promise<string> {
    return (await this.login(email)).accessToken;
  }
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
