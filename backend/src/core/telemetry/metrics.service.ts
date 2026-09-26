// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

// Adapted from PaynEat ERP (backend/src/core/telemetry/metrics.service.ts), see NOTICE.

import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { APP_CONFIG } from '../config/config.token';
import type { RootConfig } from '../config/configuration';
import { OutboxRegistry } from '../outbox/outbox.registry';
import { PrismaService } from '../prisma/prisma.service';
import { APP_NAME, GENERIC_EVENT, TelemetryLogger } from './telemetry-logger';

/**
 * Prometheus metrics, as the ecosystem's telemetry contract names them, served
 * as `GET /metrics` on a port of their own — never the API port, which is what
 * "not exposed publicly" comes to: docker-compose.yml does not publish it, and a
 * scraper reaches it inside the network.
 *
 * Two kinds of number live here, and the difference is the point of the class.
 * Request counts and sign-in failures describe *this process*, so each instance
 * counts its own and Prometheus adds them up. The outbox backlog describes *the
 * deployment*: with replicas a supported configuration (CW-003, CW-007), a
 * backlog counted in memory would read differently on every instance and fall
 * to zero on every deploy — a queue that reads healthy because the process
 * forgot about it. So those two gauges are read from the database at scrape
 * time, and every instance reports the same value.
 *
 * Each application instance has its own registry rather than prom-client's
 * global one, so that booting the app twice in one process (the e2e suite
 * does) does not register the same metric twice.
 */
@Injectable()
export class MetricsService implements OnApplicationShutdown {
  readonly registry = new Registry();

  private readonly requests = new Counter({
    name: 'http_requests_total',
    help: 'HTTP requests handled, by route template and status.',
    labelNames: ['app', 'method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  private readonly duration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds, by route template.',
    labelNames: ['app', 'method', 'route'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  /** Every refused sign-in: wrong password or code, unknown account, locked or inactive. */
  private readonly signInFailures = new Counter({
    name: 'auth_sign_in_failures_total',
    help: 'Sign-in attempts refused.',
    labelNames: ['app'] as const,
    registers: [this.registry],
  });

  private readonly outboxPending = new Gauge({
    name: 'outbox_pending_events',
    help: 'Outbox events not yet delivered and not dead-lettered, read from the database.',
    labelNames: ['app', 'destination'] as const,
    registers: [this.registry],
  });

  private readonly outboxOldestAge = new Gauge({
    name: 'outbox_oldest_pending_age_seconds',
    help: 'Age of the oldest pending outbox event, read from the database; 0 when none.',
    labelNames: ['app', 'destination'] as const,
    registers: [this.registry],
  });

  private server?: Server;

  constructor(
    @Inject(APP_CONFIG) private readonly config: RootConfig,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxRegistry,
    private readonly logger: TelemetryLogger,
  ) {
    collectDefaultMetrics({ register: this.registry });
    // Present at zero from the start: "no failures yet" must read as 0, never as missing.
    this.signInFailures.inc({ app: APP_NAME }, 0);
  }

  /** `route` must be a template (`/api/v1/employees/:id`), never a concrete path. */
  observeRequest(method: string, route: string, status: number, seconds: number): void {
    this.requests.inc({ app: APP_NAME, method, route, status: String(status) });
    this.duration.observe({ app: APP_NAME, method, route }, seconds);
  }

  countSignInFailure(): void {
    this.signInFailures.inc({ app: APP_NAME });
  }

  /** The exposition text, with the database-backed gauges read fresh. */
  async scrape(): Promise<string> {
    await this.readOutboxBacklog();
    return this.registry.metrics();
  }

  /**
   * The backlog by destination. Cwork's outbox rows are addressed by event type
   * — the dispatcher routes on nothing else, and email and push are judged
   * together on one row — so the event type is the destination, and the only
   * one the database can name.
   *
   * Every event type something listens for is reported, at zero when nothing
   * is waiting: an idle queue must read as 0, not as a series that vanished.
   * Age is measured from the row's own `occurredAt`, which Prisma writes in UTC.
   */
  private async readOutboxBacklog(): Promise<void> {
    const pending = await this.prisma.outboxEvent.groupBy({
      by: ['eventType'],
      where: { processedAt: null, failedAt: null },
      _count: { _all: true },
      _min: { occurredAt: true },
    });

    const now = Date.now();
    const rows = new Map<string, { count: number; oldestAgeSeconds: number }>();
    for (const destination of this.outbox.subscribedTypes()) {
      rows.set(destination, { count: 0, oldestAgeSeconds: 0 });
    }
    for (const row of pending) {
      const oldest = row._min.occurredAt?.getTime() ?? now;
      rows.set(row.eventType, {
        count: row._count._all,
        oldestAgeSeconds: Math.max(0, (now - oldest) / 1000),
      });
    }

    this.outboxPending.reset();
    this.outboxOldestAge.reset();
    for (const [destination, { count, oldestAgeSeconds }] of rows) {
      this.outboxPending.set({ app: APP_NAME, destination }, count);
      this.outboxOldestAge.set({ app: APP_NAME, destination }, oldestAgeSeconds);
    }
  }

  /**
   * Starts the metrics listener. Called by `installTelemetry` for the API only:
   * the CLI and the demo-data script boot the same modules and must not open a
   * port, nor be kept alive by one.
   */
  async listen(): Promise<void> {
    if (this.server) return;
    const server = createServer((req, res) => {
      if (req.method === 'GET' && req.url?.split('?')[0] === '/metrics') {
        this.scrape()
          .then((body) => {
            res.writeHead(200, { 'Content-Type': this.registry.contentType });
            res.end(body);
          })
          .catch((error: unknown) => {
            this.logger.write({
              severity: 'ERROR',
              event: GENERIC_EVENT,
              message: 'Metrics scrape failed',
              error,
            });
            res.writeHead(500).end();
          });
        return;
      }
      res.writeHead(404).end();
    });
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.config.telemetry.metricsPort, '0.0.0.0', () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.logger.write({
      severity: 'INFO',
      event: GENERIC_EVENT,
      message: `Metrics served on :${this.port()}/metrics (not the API port)`,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** The port actually bound — the configured one, or a free one when configured as 0. */
  port(): number {
    return (this.server?.address() as AddressInfo | null)?.port ?? 0;
  }
}
