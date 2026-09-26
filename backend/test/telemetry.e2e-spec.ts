// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

// Adapted from PaynEat ERP (backend/test/telemetry.e2e-spec.ts), see NOTICE.

/**
 * The telemetry contract (v1.1), end to end (CW-050): the headers a caller
 * gets back, the lines the API writes, and the metrics it serves — including
 * the traffic a guard refuses before any controller runs, and the numbers two
 * instances must agree on.
 */
import { randomUUID } from 'node:crypto';
import { Controller, Get } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { PermanentDeliveryError } from 'src/core/outbox/delivery-error';
import { OutboxDispatcher } from 'src/core/outbox/outbox.dispatcher';
import { OutboxRegistry } from 'src/core/outbox/outbox.registry';
import { Public } from 'src/core/security/decorators';
import {
  completedLine,
  createTestApp,
  seedPassword,
  type LogLine,
  type TestContext,
} from './utils/test-app';

/**
 * Responses no production route gives on purpose: a crash, and a database
 * error of the kind whose message carries the query's arguments. Public, so
 * the telemetry of a request is tested apart from signing in.
 */
@Public()
@Controller('telemetry-test')
class TelemetryTestController {
  @Get('crash')
  crash(): never {
    throw new Error('the payroll engine fell over');
  }

  @Get('database-error')
  databaseError(): never {
    throw new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Invalid `prisma.employee.create()` invocation: ' +
        `{ nationalId: "${NATIONAL_ID}", baseSalary: ${SALARY} }`,
      { code: 'P2010', clientVersion: 'test' },
    );
  }
}

const HR = 'hr.manager@cwork.example';
const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const TRACEPARENT = `00-${TRACE_ID}-00f067aa0ba902b7-01`;
const RFC3339_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LATENCY = /^\d+\.\d{3}s$/;

/** Distinctive values from the contract's "never in logs" list, and from Cwork's own data. */
const NATIONAL_ID = '1103700054321';
const SALARY = '87654.32';
const BANK_ACCOUNT = '4839201756';
const WRONG_PASSWORD = 'Wrong-Pass-Telemetry-9f3a';
const UNKNOWN_EMAIL = 'nobody.telemetry@example.com';
const FIRST_NAME = 'เทเลเมทรีทดสอบ';
const LAST_NAME = 'ห้ามลงล็อก';
const UNSUBSCRIBE_TOKEN = 'unsubscribe-token-telemetry-5c1e';
const ASSESSMENT_TOKEN = 'assessment-token-telemetry-77ab';
const QUERY_VALUE = 'query-value-telemetry-0d4f';

/** Waits for a request's completion line; `finish` can land a tick after the client reads. */
async function lineFor(ctx: TestContext, requestId: string): Promise<LogLine> {
  for (let i = 0; i < 100; i++) {
    try {
      return completedLine(ctx, requestId);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  return completedLine(ctx, requestId);
}

function labelsOf(line: LogLine): Record<string, string> {
  return line.labels ?? line['logging.googleapis.com/labels'];
}

async function scrape(ctx: TestContext): Promise<string> {
  const res = await request(`http://127.0.0.1:${ctx.metricsPort}`).get('/metrics');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('text/plain');
  return res.text;
}

/** The value of one sample, or undefined when the series is absent. */
function sample(text: string, series: string): number | undefined {
  const line = text.split('\n').find((l) => l.startsWith(`${series} `));
  return line === undefined ? undefined : Number(line.slice(series.length + 1));
}

/** Only labels can carry a path or a value; sample values are arbitrary numbers. */
function labelText(text: string): string {
  return [...text.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]).join('\n');
}

describe('telemetry contract v1.1', () => {
  let ctx: TestContext;
  let server: () => ReturnType<typeof request>;
  let hrToken: string;
  let hrRefreshToken: string;

  beforeAll(async () => {
    // Pinned, because a developer's backend/.env may well say DEBUG, and what is
    // under test here is what an installation gets by default.
    ctx = await createTestApp({
      env: { LOG_LEVEL: 'INFO' },
      controllers: [TelemetryTestController],
    });
    server = () => request(ctx.app.getHttpServer());
    const session = await ctx.api.login(HR);
    hrToken = session.accessToken;
    hrRefreshToken = session.refreshToken;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('a request', () => {
    it('produces one JSON line with severity, event inside labels, and the caller’s correlation id', async () => {
      const res = await server()
        .get('/health/live?probe=1')
        .set('x-request-id', 'client-req-shape-01')
        .set('traceparent', TRACEPARENT);
      expect(res.headers['x-request-id']).toBe('client-req-shape-01');

      const line = await lineFor(ctx, 'client-req-shape-01');
      const lines = ctx
        .logs()
        .filter(
          (l) =>
            labelsOf(l)?.correlation_id === 'client-req-shape-01' &&
            labelsOf(l)?.event === 'http.request.completed',
        );
      expect(lines).toHaveLength(1);

      expect(line.severity).toBe('INFO');
      expect(line.time).toMatch(RFC3339_MS);
      expect(typeof line.message).toBe('string');
      expect(line).not.toHaveProperty('event');
      expect(line).not.toHaveProperty('level');
      expect(line.labels).toEqual({
        app: 'cwork-api',
        event: 'http.request.completed',
        correlation_id: 'client-req-shape-01',
      });
      expect(line.trace).toBe(TRACE_ID);
      expect(line.httpRequest).toEqual({
        requestMethod: 'GET',
        requestUrl: '/health/live',
        status: 200,
        latency: expect.stringMatching(LATENCY),
      });
      expect(line).not.toHaveProperty('logging.googleapis.com/labels');
      expect(line).not.toHaveProperty('logging.googleapis.com/trace');
    });

    it('replaces an id that does not match ^[\\w-]{8,64}$, and makes one up when none is sent', async () => {
      const bad = await server().get('/health/live').set('x-request-id', 'bad id!');
      expect(bad.headers['x-request-id']).not.toBe('bad id!');
      expect(bad.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);

      const none = await server().get('/health/live');
      expect(none.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
      expect((await lineFor(ctx, none.headers['x-request-id'])).httpRequest.status).toBe(200);
    });

    it('maps status to severity: 404 INFO, 422 WARNING, 500 ERROR with the error', async () => {
      await server().get('/api/v1/no-such-route').set('x-request-id', 'sev-404-0001');
      await server()
        .post('/api/v1/auth/mfa/verify')
        .set('x-request-id', 'sev-4xx-0001')
        .send({ challengeToken: 'not-a-token', code: '000000' });
      const crash = await server()
        .get('/api/v1/telemetry-test/crash')
        .set('x-request-id', 'sev-500-0001');

      expect((await lineFor(ctx, 'sev-404-0001')).severity).toBe('INFO');
      const refused = await lineFor(ctx, 'sev-4xx-0001');
      expect(refused.httpRequest.status).toBeGreaterThanOrEqual(400);
      expect(refused.severity).toBe(refused.httpRequest.status === 401 ? 'INFO' : 'WARNING');

      expect(crash.status).toBe(500);
      expect(JSON.stringify(crash.body)).not.toContain('fell over');
      const line = await lineFor(ctx, 'sev-500-0001');
      expect(line.severity).toBe('ERROR');
      // No stack at the default INFO: stacks are written only at DEBUG.
      expect(line.error).toEqual({ type: 'Error', message: 'the payroll engine fell over' });
    });

    it('gives every line a string severity, a time, a message and the three required labels', () => {
      const lines = ctx.logs();
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(['DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL']).toContain(
          line.severity,
        );
        expect(line.time).toMatch(RFC3339_MS);
        expect(typeof line.message).toBe('string');
        expect(line.labels).toEqual(
          expect.objectContaining({
            app: 'cwork-api',
            event: expect.any(String),
            correlation_id: expect.any(String),
          }),
        );
      }
    });
  });

  describe('a request refused before the controller', () => {
    it('writes http.request.completed for a refused sign-in, and auth.sign_in.failed under the same id', async () => {
      const res = await server()
        .post('/api/v1/auth/login')
        .set('x-request-id', 'refused-sign-in-01')
        .send({ email: HR, password: WRONG_PASSWORD });
      expect(res.status).toBe(401);

      const completed = await lineFor(ctx, 'refused-sign-in-01');
      expect(completed.httpRequest.status).toBe(401);
      expect(completed.labels.correlation_id).toBe('refused-sign-in-01');

      const failed = ctx
        .logs()
        .find(
          (l) =>
            l.labels.event === 'auth.sign_in.failed' &&
            l.labels.correlation_id === 'refused-sign-in-01',
        );
      expect(failed).toBeDefined();
      expect(failed!.severity).toBe('WARNING');
    });

    it('writes http.request.completed for a 401 from the authentication guard', async () => {
      const res = await server().get('/api/v1/employees').set('x-request-id', 'guard-401-0001');
      expect(res.status).toBe(401);
      const line = await lineFor(ctx, 'guard-401-0001');
      expect(line.httpRequest).toMatchObject({ requestUrl: '/api/v1/employees', status: 401 });
    });

    it('writes http.request.completed for a request the throttler refused', async () => {
      const throttled = await createTestApp({ env: { THROTTLE_LIMIT: '2' } });
      try {
        const token = await throttled.api.token('dev2@cwork.example');
        const http = request(throttled.app.getHttpServer());
        const statuses: number[] = [];
        for (let i = 0; i < 4; i++) {
          const res = await http
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .set('x-request-id', `throttled-000${i}`);
          statuses.push(res.status);
        }
        expect(statuses).toContain(429);

        const refused = statuses.indexOf(429);
        const line = await lineFor(throttled, `throttled-000${refused}`);
        expect(line.severity).toBe('WARNING');
        expect(line.labels.correlation_id).toBe(`throttled-000${refused}`);
        expect(line.httpRequest).toMatchObject({ requestUrl: '/api/v1/auth/me', status: 429 });
      } finally {
        await throttled.close();
      }
    });
  });

  describe('GET /metrics', () => {
    it('serves all five metrics, counting requests by route template', async () => {
      const employees = await ctx.api.get('/employees', hrToken);
      const someone = employees.body.data?.[0]?.id ?? employees.body[0]?.id;
      expect(someone).toBeDefined();
      await ctx.api.get(`/employees/${someone}`, hrToken);
      await server().get('/api/v1/no-such-thing/9876543');

      const text = await scrape(ctx);
      for (const name of [
        'http_requests_total',
        'http_request_duration_seconds',
        'auth_sign_in_failures_total',
        'outbox_pending_events',
        'outbox_oldest_pending_age_seconds',
      ]) {
        expect(text).toContain(`# TYPE ${name} `);
      }

      expect(text).toContain(
        'http_requests_total{app="cwork-api",method="GET",route="/api/v1/employees/:id",status="200"}',
      );
      expect(text).toContain('route="unmatched"');
      expect(text).toMatch(
        /http_request_duration_seconds_bucket\{le="[^"]+",app="cwork-api",method="GET",route="\/api\/v1\/employees\/:id"\}/,
      );
      const labels = labelText(text);
      expect(labels).not.toContain(someone);
      expect(labels).not.toContain('9876543');
      expect(sample(text, 'auth_sign_in_failures_total{app="cwork-api"}')).toBeGreaterThan(0);
    });

    it('is not served on the API port', async () => {
      expect((await server().get('/metrics')).status).toBe(404);
      expect((await server().get('/api/v1/metrics')).status).toBe(404);
    });
  });

  describe('the outbox', () => {
    const destination = `telemetry.probe.${randomUUID().slice(0, 8)}`;

    afterAll(async () => {
      await ctx.app.get(PrismaService).outboxEvent.deleteMany({
        where: { eventType: { startsWith: 'telemetry.' } },
      });
    });

    it('reports the same backlog from two instances against one database, and a restart does not change it', async () => {
      const prisma = ctx.app.get(PrismaService);
      const organization = await prisma.organization.findFirstOrThrow({ select: { id: true } });
      const occurredAt = new Date(Date.now() - 120_000);
      await prisma.outboxEvent.createMany({
        data: [1, 2, 3].map((n) => ({
          organizationId: organization.id,
          eventType: destination,
          aggregateType: 'Probe',
          aggregateId: String(n),
          payload: {},
          occurredAt,
        })),
      });

      const pending = `outbox_pending_events{app="cwork-api",destination="${destination}"}`;
      const age = `outbox_oldest_pending_age_seconds{app="cwork-api",destination="${destination}"}`;

      let other = await createTestApp();
      try {
        const [a, b] = [await scrape(ctx), await scrape(other)];
        expect(sample(a, pending)).toBe(3);
        expect(sample(b, pending)).toBe(3);
        expect(sample(a, age)).toBeGreaterThanOrEqual(120);
        expect(sample(b, age)).toBeGreaterThanOrEqual(120);

        // Everything both instances know about, they agree on.
        const series = (text: string) =>
          text
            .split('\n')
            .filter((l) => l.startsWith('outbox_pending_events{'))
            .sort();
        expect(series(b)).toEqual(series(a));

        await other.close();
        other = await createTestApp();
        expect(sample(await scrape(other), pending)).toBe(3);
      } finally {
        await other.close();
      }
    });

    it('writes outbox.delivery.failed for a failed attempt, keyed by the event, without the recipient', async () => {
      const prisma = ctx.app.get(PrismaService);
      const organization = await prisma.organization.findFirstOrThrow({ select: { id: true } });
      const failing = `telemetry.failing.${randomUUID().slice(0, 8)}`;
      const refused = `telemetry.refused.${randomUUID().slice(0, 8)}`;

      ctx.app.get(OutboxRegistry).register(failing, async () => {
        throw new Error('SMTP RCPT TO:<recipient> refused: 450 <somchai.j@example.co.th> busy');
      });
      ctx.app.get(OutboxRegistry).register(refused, async () => {
        throw new PermanentDeliveryError('SMTP RCPT TO:<recipient> refused: 550 no such user');
      });
      const [first, second] = await Promise.all(
        [failing, refused].map((eventType) =>
          prisma.outboxEvent.create({
            data: {
              organizationId: organization.id,
              eventType,
              aggregateType: 'Probe',
              aggregateId: 'x',
              payload: {},
            },
          }),
        ),
      );

      await ctx.app.get(OutboxDispatcher).drainOnce();

      const lineOf = (id: string) =>
        ctx
          .logs()
          .find(
            (l) => l.labels.event === 'outbox.delivery.failed' && l.labels.correlation_id === id,
          );

      const retried = lineOf(first.id);
      expect(retried?.severity).toBe('WARNING');
      expect(retried?.message).toContain(failing);
      expect(JSON.stringify(retried)).not.toContain('somchai');

      const deadLettered = lineOf(second.id);
      expect(deadLettered?.severity).toBe('ERROR');
      expect(deadLettered?.error).toEqual({
        type: 'PermanentDeliveryError',
        message: 'SMTP RCPT TO:<recipient> refused: 550 no such user',
      });
    });
  });

  describe('never in logs or labels', () => {
    it('writes no salary, national ID, bank account, name, email, password, token or query string', async () => {
      // Personal data the API is handed and hands back.
      const created = await ctx.api.post('/employees', hrToken, {
        firstNameTh: FIRST_NAME,
        lastNameTh: LAST_NAME,
        nationalId: NATIONAL_ID,
        personalEmail: 'somchai.private@example.com',
        hireDate: '2026-01-05',
      });
      expect(created.status).toBe(201);
      const employeeId = created.body.id;

      const pay = await ctx.api.post('/payroll/compensation', hrToken, {
        employeeId,
        effectiveFrom: '2026-01-05',
        baseSalary: Number(SALARY),
      });
      expect(pay.status).toBeLessThan(300);
      expect((await ctx.api.get(`/employees/${employeeId}`, hrToken)).status).toBe(200);
      expect((await ctx.api.get(`/payroll/compensation/${employeeId}`, hrToken)).status).toBe(200);

      // A bank account in a body the API refuses, and everything in a query string.
      await ctx.api.patch(`/employees/${employeeId}`, hrToken, { bankAccountNo: BANK_ACCOUNT });
      await ctx.api.get(
        `/employees?q=${NATIONAL_ID}&account=${BANK_ACCOUNT}&token=${QUERY_VALUE}`,
        hrToken,
      );

      // Credentials: wrong passwords, an unknown account, a refresh token, tokens in a path.
      await ctx.api.post('/auth/login', undefined, { email: HR, password: WRONG_PASSWORD });
      await ctx.api.post('/auth/login', undefined, {
        email: UNKNOWN_EMAIL,
        password: WRONG_PASSWORD,
      });
      await ctx.api.post('/auth/refresh', undefined, { refreshToken: hrRefreshToken });
      const unsubscribe = await server()
        .get(`/api/v1/notifications/unsubscribe/${UNSUBSCRIBE_TOKEN}`)
        .set('x-request-id', 'path-token-0001');
      await server()
        .get(`/api/v1/careers/assessments/${ASSESSMENT_TOKEN}`)
        .set('x-request-id', 'path-token-0002');

      // A database error whose message renders the query's arguments.
      await server()
        .get('/api/v1/telemetry-test/database-error')
        .set('x-request-id', 'db-error-00001');

      expect(unsubscribe.status).toBe(404);
      expect((await lineFor(ctx, 'path-token-0001')).httpRequest.requestUrl).toBe(
        '/api/v1/notifications/unsubscribe/:token',
      );
      expect((await lineFor(ctx, 'path-token-0002')).httpRequest.requestUrl).toBe(
        '/api/v1/careers/assessments/:token',
      );
      expect((await lineFor(ctx, 'db-error-00001')).error).toEqual({
        type: 'PrismaClientKnownRequestError',
        message: 'P2010 (query details withheld)',
      });

      const forbidden = [
        NATIONAL_ID,
        SALARY,
        BANK_ACCOUNT,
        FIRST_NAME,
        LAST_NAME,
        'somchai.private@example.com',
        HR,
        UNKNOWN_EMAIL,
        WRONG_PASSWORD,
        seedPassword(),
        hrToken,
        hrRefreshToken,
        UNSUBSCRIBE_TOKEN,
        ASSESSMENT_TOKEN,
        QUERY_VALUE,
        process.env.DATABASE_URL as string,
        process.env.JWT_ACCESS_SECRET as string,
      ];

      const logs = ctx.rawLogs.join('\n');
      const metricLabels = labelText(await scrape(ctx));
      for (const value of forbidden) {
        expect(logs).not.toContain(value);
        expect(metricLabels).not.toContain(value);
      }
      for (const line of ctx.logs()) {
        expect(line.httpRequest?.requestUrl ?? '').not.toContain('?');
      }
      await ctx.app.get(PrismaService).employee.deleteMany({ where: { id: employeeId } });
    });
  });
});

describe('telemetry contract v1.1 — LOG_FORMAT=gcp', () => {
  let plain: TestContext;
  let gcp: TestContext;

  beforeAll(async () => {
    plain = await createTestApp({ env: { LOG_LEVEL: 'INFO' } });
    gcp = await createTestApp({
      env: { LOG_LEVEL: 'INFO', LOG_FORMAT: 'gcp', GOOGLE_CLOUD_PROJECT: 'demo-project' },
    });
  });

  afterAll(async () => {
    await gcp.close();
    await plain.close();
  });

  it('moves the labels and the trace to the Google keys, and changes nothing else', async () => {
    for (const [ctx, id] of [
      [plain, 'format-plain-01'],
      [gcp, 'format-gcp-0001'],
    ] as const) {
      await request(ctx.app.getHttpServer())
        .get('/health/live')
        .set('x-request-id', id)
        .set('traceparent', TRACEPARENT);
    }

    const a = await lineFor(plain, 'format-plain-01');
    const b = await lineFor(gcp, 'format-gcp-0001');

    expect(b['logging.googleapis.com/labels']).toEqual({
      ...a.labels,
      correlation_id: 'format-gcp-0001',
    });
    expect(b['logging.googleapis.com/trace']).toBe(`projects/demo-project/traces/${TRACE_ID}`);
    expect(b).not.toHaveProperty('labels');
    expect(b).not.toHaveProperty('trace');

    // Everything but the moved keys and the clock: the same fields, the same values.
    const rest = (line: LogLine) => {
      const moved = [
        'labels',
        'trace',
        'logging.googleapis.com/labels',
        'logging.googleapis.com/trace',
        'time',
      ];
      const others = Object.fromEntries(
        Object.entries(line).filter(([key]) => !moved.includes(key)),
      );
      return {
        ...others,
        httpRequest: { ...line.httpRequest, latency: typeof line.httpRequest.latency },
      };
    };
    expect(rest(b)).toEqual(rest(a));
    expect(b.httpRequest.latency).toMatch(LATENCY);
  });

  it('writes every line in the gcp shape', () => {
    for (const line of gcp.logs()) {
      expect(line).not.toHaveProperty('labels');
      expect(line['logging.googleapis.com/labels']).toEqual(
        expect.objectContaining({ app: 'cwork-api', event: expect.any(String) }),
      );
    }
  });
});

describe('telemetry contract v1.1 — LOG_LEVEL=DEBUG', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({
      env: { LOG_LEVEL: 'DEBUG' },
      controllers: [TelemetryTestController],
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('adds the stack to a failure only at DEBUG, as frames without the message', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/v1/telemetry-test/database-error')
      .set('x-request-id', 'debug-stack-001');

    const line = await lineFor(ctx, 'debug-stack-001');
    expect(line.error.stack).toMatch(/^PrismaClientKnownRequestError\n\s+at /);
    expect(line.error.stack).not.toContain(NATIONAL_ID);
    expect(line.error.stack).not.toContain('invocation');
  });
});
