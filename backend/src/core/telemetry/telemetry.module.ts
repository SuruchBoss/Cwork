// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

// Adapted from PaynEat ERP (backend/src/core/telemetry/telemetry.module.ts), see NOTICE.

import { Global, INestApplication, Module } from '@nestjs/common';
import { requestContextMiddleware } from '../http/request-context.middleware';
import { MetricsService } from './metrics.service';
import { LOG_SINK, stdoutSink, TelemetryLogger } from './telemetry-logger';

/**
 * Global, because any module may write a catalogue event or count one, and the
 * alternative is an import in every feature module saying so.
 */
@Global()
@Module({
  providers: [{ provide: LOG_SINK, useValue: stdoutSink }, TelemetryLogger, MetricsService],
  exports: [TelemetryLogger, MetricsService],
})
export class TelemetryModule {}

/**
 * What the HTTP application adds on top of the module: Nest's own logger
 * replaced, the request middleware ahead of every route, and the metrics
 * listener. `main.ts` and the e2e harness both call this, so the suite boots
 * the telemetry production boots. Call it before `init`/`listen`, so the
 * middleware is registered ahead of the routes.
 */
export async function installTelemetry(app: INestApplication): Promise<void> {
  const logger = app.get(TelemetryLogger);
  const metrics = app.get(MetricsService);

  app.useLogger(logger);
  app.use(requestContextMiddleware(logger, metrics));
  await metrics.listen();
}
