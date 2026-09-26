// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

// Adapted from PaynEat ERP (backend/src/core/http/request-context.middleware.ts), see NOTICE.

import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  acceptRequestId,
  formatLatency,
  loggablePath,
  parseTraceparent,
  requestPath,
  severityForStatus,
} from '../telemetry/domain/log-record';
import type { MetricsService } from '../telemetry/metrics.service';
import { runWithRequestContext } from '../telemetry/request-context';
import type { TelemetryLogger } from '../telemetry/telemetry-logger';

/** Where the exception filter leaves a 5xx's error for the completion line to report. */
export const RESPONSE_ERROR = 'telemetryError';

/** Route label for requests no route matched, so unknown paths cannot explode cardinality. */
export const UNMATCHED_ROUTE = 'unmatched';

export type RequestWithId = Request & { id?: string };

/**
 * Assigns every request a correlation id, and accounts for every request.
 *
 * Registered with `app.use` ahead of routing (`installTelemetry`), which is
 * what makes "every" true. A request refused before any controller runs — a
 * 401 from `JwtAuthGuard`, a 429 from the throttler, a path nothing matches —
 * still passes through here, and a lockout storm or a credential being
 * hammered is exactly the traffic that must not go unrecorded. For each one:
 *
 *  - the caller's `x-request-id` is kept if it matches `^[\w-]{8,64}$`,
 *    otherwise one is generated; it is returned in the response, flows into the
 *    error body and the audit log, and so ties a user's bug report to
 *    everything the server did;
 *  - that id, and a W3C trace id if the caller sent one, become the ambient
 *    context of every log line written while serving the request;
 *  - on completion one `http.request.completed` line is written (path without
 *    query string, a token in the path replaced by its parameter's name, the
 *    status, latency as a duration string) and the request is counted by route
 *    template.
 *
 * Nothing about the request body, query string or headers is logged.
 */
export function requestContextMiddleware(logger: TelemetryLogger, metrics: MetricsService) {
  return (req: RequestWithId, res: Response, next: NextFunction): void => {
    const correlationId = acceptRequestId(req.headers['x-request-id']) ?? randomUUID();
    const traceId = parseTraceparent(req.headers['traceparent']);
    const started = process.hrtime.bigint();

    req.id = correlationId;
    res.setHeader('x-request-id', correlationId);

    res.once('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      const route = routeTemplate(req);
      const path = loggablePath(requestPath(req.originalUrl ?? req.url), req.params);
      const status = res.statusCode;

      metrics.observeRequest(req.method, route, status, elapsedMs / 1000);
      logger.write({
        severity: severityForStatus(status),
        event: 'http.request.completed',
        message: `${req.method} ${path} ${status}`,
        // The response has finished; the ambient context may already be gone.
        correlationId,
        traceId,
        httpRequest: {
          requestMethod: req.method,
          requestUrl: path,
          status,
          latency: formatLatency(elapsedMs),
        },
        error: status >= 500 ? res.locals[RESPONSE_ERROR] : undefined,
      });
    });

    runWithRequestContext({ correlationId, traceId }, next);
  };
}

/** The matched route's template (`/api/v1/employees/:id`), never the concrete path. */
function routeTemplate(req: Request): string {
  const route = (req as Request & { route?: { path?: unknown } }).route;
  const path = typeof route?.path === 'string' ? route.path : undefined;
  if (!path) return UNMATCHED_ROUTE;
  const base = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  return `${base}${path}` || '/';
}
