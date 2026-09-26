// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

// Adapted from PaynEat ERP (backend/src/core/telemetry/telemetry-logger.ts), see NOTICE.

import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.token';
import type { RootConfig } from '../config/configuration';
import {
  describeError,
  HttpRequestInfo,
  isEnabled,
  LogLabels,
  Severity,
  toLogRecord,
} from './domain/log-record';
import { currentRequestContext, PROCESS_CORRELATION_ID } from './request-context';

/** The `app` label, and the pod label a Kubernetes deployment scrapes by. */
export const APP_NAME = 'cwork-api';

/**
 * Lines that are not one of the contract's catalogue events (start-up,
 * configuration, a scheduled job's summary) still need an `event` label. They
 * all share this one value, so a query for catalogue events never has to
 * exclude a zoo of invented names.
 */
export const GENERIC_EVENT = 'app.log';

/** Where finished log lines go. stdout in every deployment; a capture in tests. */
export const LOG_SINK = Symbol('LOG_SINK');
export type LogSink = (line: string) => void;
export const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

export interface WriteOptions {
  severity: Severity;
  event: string;
  message: string;
  labels?: Omit<LogLabels, 'app' | 'event' | 'correlation_id'>;
  /** Overrides the ambient request context — needed after a response has finished. */
  correlationId?: string;
  traceId?: string;
  httpRequest?: HttpRequestInfo;
  /** A thrown value; written as `{ type, message }`, see `describeError`. */
  error?: unknown;
}

/**
 * The one writer of log lines: JSON, one object per line on stdout, a string
 * `severity`, labels always carrying `app`, `event` and `correlation_id`.
 *
 * Also Nest's logger (`app.useLogger`), so every `new Logger(Context)` in the
 * codebase comes out in the same shape as `app.log`. Nest's start-up chatter —
 * module and route registration — is written at DEBUG: useful when asked for,
 * noise at the default INFO.
 *
 * Adapted from PaynEat ERP's `TelemetryLogger`, which met the contract first.
 */
@Injectable()
export class TelemetryLogger implements LoggerService {
  private static readonly FRAMEWORK_CONTEXTS = new Set([
    'NestFactory',
    'InstanceLoader',
    'RoutesResolver',
    'RouterExplorer',
    'NestApplication',
  ]);

  constructor(
    @Inject(APP_CONFIG) private readonly config: RootConfig,
    @Inject(LOG_SINK) private readonly sink: LogSink,
  ) {}

  write(options: WriteOptions): void {
    const { level, format, gcpProject } = this.config.telemetry;
    if (!isEnabled(level, options.severity)) return;

    const context = currentRequestContext();
    const record = toLogRecord(
      {
        severity: options.severity,
        time: new Date(),
        message: options.message,
        labels: {
          ...options.labels,
          app: APP_NAME,
          event: options.event,
          correlation_id: options.correlationId ?? context?.correlationId ?? PROCESS_CORRELATION_ID,
        },
        traceId: options.traceId ?? context?.traceId,
        httpRequest: options.httpRequest,
        error: describeError(options.error),
      },
      { format, gcpProject, includeStack: level === 'DEBUG' },
    );
    this.sink(JSON.stringify(record));
  }

  // --- Nest LoggerService -----------------------------------------------------
  //
  // A `Logger` with a context calls these with the context as the last
  // argument: `log(message, context)`, `error(message, stack, context)`.

  log(message: unknown, ...optional: unknown[]): void {
    const context = contextOf(optional);
    const severity = context && TelemetryLogger.FRAMEWORK_CONTEXTS.has(context) ? 'DEBUG' : 'INFO';
    this.generic(severity, message, context);
  }

  error(message: unknown, ...optional: unknown[]): void {
    const context = optional.length > 1 ? contextOf(optional) : undefined;
    const stack = typeof optional[0] === 'string' ? optional[0] : undefined;

    if (message instanceof Error) {
      this.write({
        severity: 'ERROR',
        event: GENERIC_EVENT,
        message: withContext(message.message, context),
        error: message,
      });
      return;
    }

    this.write({
      severity: 'ERROR',
      event: GENERIC_EVENT,
      message: withContext(
        message,
        context ?? (stack && !looksLikeStack(stack) ? stack : undefined),
      ),
      error: stack && looksLikeStack(stack) ? fromStack(stack) : undefined,
    });
  }

  warn(message: unknown, ...optional: unknown[]): void {
    this.generic('WARNING', message, contextOf(optional));
  }

  debug(message: unknown, ...optional: unknown[]): void {
    this.generic('DEBUG', message, contextOf(optional));
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    this.generic('DEBUG', message, contextOf(optional));
  }

  fatal(message: unknown, ...optional: unknown[]): void {
    this.generic('CRITICAL', message, contextOf(optional));
  }

  private generic(severity: Severity, message: unknown, context?: string): void {
    this.write({ severity, event: GENERIC_EVENT, message: withContext(message, context) });
  }
}

function contextOf(optional: unknown[]): string | undefined {
  const last = optional[optional.length - 1];
  return typeof last === 'string' ? last : undefined;
}

function withContext(message: unknown, context?: string): string {
  const text = typeof message === 'string' ? message : JSON.stringify(message);
  return context ? `[${context}] ${text}` : text;
}

function looksLikeStack(text: string): boolean {
  return /\n\s+at\s/.test(text);
}

/**
 * A stack handed over as text (`logger.error(message, error.stack)`), turned
 * back into the error it came from so `describeError` can treat it like any
 * other: its first line is `${name}: ${message}`, and for a Prisma error that
 * message is the query's arguments.
 */
function fromStack(stack: string): { name: string; message: string; stack: string } {
  const firstFrame = stack.search(/\n\s+at\s/);
  const head = firstFrame === -1 ? stack : stack.slice(0, firstFrame);
  const match = /^([A-Za-z_$][\w$]*)(?::\s*([\s\S]*))?$/.exec(head.trim());
  return { name: match?.[1] ?? 'Error', message: match?.[2] ?? '', stack };
}
