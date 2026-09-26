// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

// Adapted from PaynEat ERP (backend/src/core/telemetry/domain/log-record.ts), see NOTICE.

/**
 * The shape of one log line, as fixed by the ecosystem's telemetry contract
 * (PaynEat ERP, docs/TELEMETRY.md, v1.1 and the additive v1.2).
 *
 * Pure functions only: no framework, no clock, no I/O. Everything the contract
 * makes checkable — severity names, the latency string, which request ids are
 * accepted, where labels and the trace go in each format — is decided here, so
 * it can be tested with worked examples and cannot drift between call sites.
 * Adapted from the ERP's implementation, which met the contract first; the
 * additions are Cwork's, because Cwork holds what the contract's "never in
 * logs" list is mostly about: salaries, national IDs and bank accounts.
 */

export const SEVERITIES = ['DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** `default` is vendor-neutral; `gcp` uses the keys Cloud Logging reads specially. */
export const LOG_FORMATS = ['default', 'gcp'] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

/**
 * `LOG_LEVEL` names Cwork accepted before it had a contract to follow. An
 * installation's `.env` that says `info` or `warn` keeps working.
 */
const LEGACY_LEVELS: Record<string, Severity> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/** A contract severity in any case, or a legacy level name; undefined otherwise. */
export function parseSeverity(value: unknown): Severity | undefined {
  if (typeof value !== 'string') return undefined;
  const upper = value.trim().toUpperCase();
  if ((SEVERITIES as readonly string[]).includes(upper)) return upper as Severity;
  return LEGACY_LEVELS[value.trim().toLowerCase()];
}

/**
 * Always `app`, `event` and `correlation_id`; `location_code` when a line is
 * about one work location. Every value is a string: labels are filtered and
 * counted, never parsed.
 */
export interface LogLabels {
  app: string;
  event: string;
  correlation_id: string;
  location_code?: string;
}

export interface HttpRequestInfo {
  requestMethod: string;
  /** Path only — never the query string. */
  requestUrl: string;
  status: number;
  /** A duration string with an `s` suffix, e.g. `"0.231s"`. */
  latency: string;
}

export interface ErrorInfo {
  type: string;
  message: string;
  stack?: string;
}

export interface LogEntry {
  severity: Severity;
  time: Date;
  message: string;
  labels: LogLabels;
  traceId?: string;
  httpRequest?: HttpRequestInfo;
  error?: ErrorInfo;
}

export interface FormatOptions {
  format: LogFormat;
  /** Needed to write a trace as Cloud Logging's resource name in `gcp` format. */
  gcpProject?: string;
  /** Stack traces are written only when the configured level is DEBUG. */
  includeStack: boolean;
}

const RANK: Record<Severity, number> = {
  DEBUG: 100,
  INFO: 200,
  NOTICE: 300,
  WARNING: 400,
  ERROR: 500,
  CRITICAL: 600,
};

/** Whether a line at `severity` is written when the configured level is `threshold`. */
export function isEnabled(threshold: Severity, severity: Severity): boolean {
  return RANK[severity] >= RANK[threshold];
}

/**
 * Severity of `http.request.completed`: `INFO`; `WARNING` for 4xx except 401
 * and 404; `ERROR` for 5xx. A 401 or 404 is the API working as designed, not a
 * client mistake worth a warning — a burst of them is what the metrics are for.
 */
export function severityForStatus(status: number): Severity {
  if (status >= 500) return 'ERROR';
  if (status >= 400 && status !== 401 && status !== 404) return 'WARNING';
  return 'INFO';
}

/** `231.4` ms → `"0.231s"`. Cloud Logging rejects a number in `httpRequest.latency`. */
export function formatLatency(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1000;
  return `${seconds.toFixed(3)}s`;
}

/** `/items/7?search=x` → `/items/7`. Query strings may carry anything, so they never reach a log. */
export function requestPath(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Route parameters whose value is a credential. Cwork has two public links that
 * carry one in the path — `/notifications/unsubscribe/:token` and
 * `/recruitment/assessments/:token` — and a path is otherwise logged as sent.
 */
const SECRET_PARAM = /token|secret|password/i;

/**
 * The path as logged: each segment that carries a secret route parameter is
 * replaced by the parameter's name, `/unsubscribe/eyJhbGciOi…` becoming
 * `/unsubscribe/:token`. Everything else stays as the caller sent it, because a
 * concrete path is what an investigator asks about.
 */
export function loggablePath(path: string, params: Record<string, unknown> | undefined): string {
  const secrets = Object.entries(params ?? {}).filter(
    ([name, value]) => SECRET_PARAM.test(name) && typeof value === 'string' && value.length > 0,
  ) as [string, string][];
  if (secrets.length === 0) return path;

  return path
    .split('/')
    .map((segment) => {
      const decoded = safeDecode(segment);
      const hit = secrets.find(([, value]) => value === decoded || value === segment);
      return hit ? `:${hit[0]}` : segment;
    })
    .join('/');
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const REQUEST_ID = /^[\w-]{8,64}$/;

/** The caller's `x-request-id` if it matches `^[\w-]{8,64}$`; otherwise the caller gets a new one. */
export function acceptRequestId(incoming: unknown): string | undefined {
  return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : undefined;
}

const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/;

/**
 * The trace id of a W3C `traceparent` header, or undefined. An all-zero trace
 * id is invalid by the W3C specification and is ignored rather than propagated.
 */
export function parseTraceparent(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const match = TRACEPARENT.exec(header.trim().toLowerCase());
  if (!match || /^0+$/.test(match[1])) return undefined;
  return match[1];
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** A Thai national ID: thirteen digits, bare or in the printed 1-2345-67890-12-3 grouping. */
const NATIONAL_ID = /(?<![\d-])(?:\d{13}|\d-\d{4}-\d{5}-\d{2}-\d)(?![\d-])/g;
/** The user and password of a connection string, e.g. a `DATABASE_URL` quoted in an error. */
const URL_CREDENTIALS = /\b([a-z][a-z\d+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi;

/**
 * A backstop, not the rule. The rule is that call sites identify people by
 * internal id and never interpolate personal data or secrets; this catches the
 * shapes that can be recognised when one slips through anyway — an email
 * address echoed in an SMTP reply, a national ID in an error message, the
 * credentials of a connection string — because in Cwork the cost of a slip is
 * somebody's ID number in a log aggregator. Salaries and names have no shape to
 * recognise, which is why the rule comes first.
 */
export function redactPersonalData(text: string): string {
  return text
    .replace(URL_CREDENTIALS, '$1<credentials>@')
    .replace(EMAIL, '<email>')
    .replace(NATIONAL_ID, '<national-id>');
}

/**
 * Prisma renders the arguments of a failed query into its error messages —
 * `data: { nationalId: "…", baseSalary: … }` — so the message of an error
 * from the query engine is exactly what must not be logged. Its code (P2002,
 * P2025, …) says what went wrong without saying about whom.
 */
function isPrismaQueryError(error: { name?: string }): boolean {
  return (
    typeof error.name === 'string' &&
    error.name.startsWith('PrismaClient') &&
    error.name !== 'PrismaClientInitializationError'
  );
}

/**
 * `{ type, message, stack }` for a thrown value, safe to write: a Prisma
 * query error keeps its code and loses its message, and the stack keeps its
 * frames and loses the message V8 repeats on its first line.
 */
export function describeError(error: unknown): ErrorInfo | undefined {
  if (error === undefined || error === null) return undefined;
  if (typeof error !== 'object') return { type: 'Error', message: String(error) };

  const e = error as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown };
  const type = typeof e.name === 'string' && e.name ? e.name : 'Error';
  const message = isPrismaQueryError({ name: type })
    ? typeof e.code === 'string'
      ? `${e.code} (query details withheld)`
      : '(query details withheld)'
    : String(e.message ?? '');
  const stack = typeof e.stack === 'string' ? stackFrames(type, e.stack) : undefined;
  return { type, message, ...(stack ? { stack } : {}) };
}

/**
 * The frames of a stack, headed by the error's type only. A stack as V8 prints
 * it begins with `${name}: ${message}`, which would put back into the log the
 * message `describeError` has just withheld.
 */
export function stackFrames(type: string, stack: string): string | undefined {
  const frames = stack.split('\n').filter((line) => /^\s+at\s/.test(line));
  return frames.length > 0 ? [type, ...frames].join('\n') : undefined;
}

const GCP_LABELS = 'logging.googleapis.com/labels';
const GCP_TRACE = 'logging.googleapis.com/trace';

/**
 * The JSON object written for one entry.
 *
 * `default`: `labels` and `trace` as plain keys. `gcp`: the same labels object
 * under `logging.googleapis.com/labels`, and the trace as
 * `projects/<project>/traces/<id>` under `logging.googleapis.com/trace`.
 * Without a project id there is no valid resource name to write, so the trace
 * stays under the plain key rather than being written in a form Cloud Logging
 * would misread. Nothing else differs between the two.
 *
 * Every free-text field passes through `redactPersonalData` here, the one place
 * every line goes through.
 */
export function toLogRecord(entry: LogEntry, options: FormatOptions): Record<string, unknown> {
  const record: Record<string, unknown> = {
    severity: entry.severity,
    time: entry.time.toISOString(),
    message: redactPersonalData(entry.message),
  };

  const labels = cleanLabels(entry.labels);
  if (options.format === 'gcp') record[GCP_LABELS] = labels;
  else record.labels = labels;

  if (entry.traceId) {
    if (options.format === 'gcp' && options.gcpProject) {
      record[GCP_TRACE] = `projects/${options.gcpProject}/traces/${entry.traceId}`;
    } else {
      record.trace = entry.traceId;
    }
  }

  if (entry.httpRequest) {
    record.httpRequest = {
      ...entry.httpRequest,
      requestUrl: redactPersonalData(requestPath(entry.httpRequest.requestUrl)),
    };
  }

  if (entry.error) {
    record.error = {
      type: entry.error.type,
      message: redactPersonalData(entry.error.message),
      ...(options.includeStack && entry.error.stack
        ? { stack: redactPersonalData(entry.error.stack) }
        : {}),
    };
  }

  return record;
}

/** Drops labels that do not apply rather than writing `undefined` or empty strings. */
function cleanLabels(labels: LogLabels): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}
