// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

// Adapted from PaynEat ERP (backend/src/core/telemetry/domain/log-record.spec.ts), see NOTICE.

import {
  acceptRequestId,
  describeError,
  formatLatency,
  isEnabled,
  LogEntry,
  loggablePath,
  parseSeverity,
  parseTraceparent,
  redactPersonalData,
  requestPath,
  severityForStatus,
  toLogRecord,
} from './log-record';

describe('log record (telemetry contract v1.1)', () => {
  describe('severityForStatus', () => {
    it.each([
      [200, 'INFO'],
      [201, 'INFO'],
      [304, 'INFO'],
      [401, 'INFO'],
      [404, 'INFO'],
      [400, 'WARNING'],
      [403, 'WARNING'],
      [422, 'WARNING'],
      [429, 'WARNING'],
      [500, 'ERROR'],
      [503, 'ERROR'],
    ])('HTTP %i is %s', (status, severity) => {
      expect(severityForStatus(status)).toBe(severity);
    });
  });

  it('formats latency as a duration string in seconds, never a number', () => {
    expect(formatLatency(231.4)).toBe('0.231s');
    expect(formatLatency(4)).toBe('0.004s');
    expect(formatLatency(1500)).toBe('1.500s');
    expect(formatLatency(-3)).toBe('0.000s');
  });

  it('keeps only the path of a URL', () => {
    expect(requestPath('/api/v1/employees?q=1234567890123&token=abc')).toBe('/api/v1/employees');
    expect(requestPath('/health/live')).toBe('/health/live');
    expect(requestPath('/a#fragment')).toBe('/a');
  });

  describe('loggablePath', () => {
    it('replaces a token carried in the path with the name of its parameter', () => {
      expect(
        loggablePath('/api/v1/notifications/unsubscribe/eyJhbGciOi.payload.sig', {
          token: 'eyJhbGciOi.payload.sig',
        }),
      ).toBe('/api/v1/notifications/unsubscribe/:token');
    });

    it('matches the decoded value of an encoded segment', () => {
      expect(loggablePath('/assessments/a%2Bb', { token: 'a+b' })).toBe('/assessments/:token');
    });

    it('leaves ordinary parameters as the caller sent them', () => {
      expect(loggablePath('/api/v1/employees/7c9e', { id: '7c9e' })).toBe('/api/v1/employees/7c9e');
      expect(loggablePath('/api/v1/careers/ACME/jobs', { orgCode: 'ACME' })).toBe(
        '/api/v1/careers/ACME/jobs',
      );
      expect(loggablePath('/api/v1/employees', undefined)).toBe('/api/v1/employees');
    });
  });

  it('accepts only request ids matching ^[\\w-]{8,64}$', () => {
    expect(acceptRequestId('abcd-1234')).toBe('abcd-1234');
    expect(acceptRequestId('a'.repeat(64))).toBe('a'.repeat(64));
    expect(acceptRequestId('short')).toBeUndefined();
    expect(acceptRequestId('a'.repeat(65))).toBeUndefined();
    expect(acceptRequestId('has space 123')).toBeUndefined();
    expect(acceptRequestId(['abcd-1234'])).toBeUndefined();
    expect(acceptRequestId(undefined)).toBeUndefined();
  });

  it('reads the trace id of a W3C traceparent, and ignores an invalid one', () => {
    expect(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBe(
      '4bf92f3577b34da6a3ce929d0e0e4736',
    );
    expect(
      parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'),
    ).toBeUndefined();
    expect(parseTraceparent('not-a-traceparent')).toBeUndefined();
    expect(parseTraceparent(undefined)).toBeUndefined();
  });

  describe('parseSeverity', () => {
    it('takes the contract names in any case', () => {
      expect(parseSeverity('WARNING')).toBe('WARNING');
      expect(parseSeverity('notice')).toBe('NOTICE');
      expect(parseSeverity(' Critical ')).toBe('CRITICAL');
    });

    it('keeps the level names an existing .env already uses', () => {
      expect(parseSeverity('info')).toBe('INFO');
      expect(parseSeverity('debug')).toBe('DEBUG');
      expect(parseSeverity('trace')).toBe('DEBUG');
      expect(parseSeverity('warn')).toBe('WARNING');
      expect(parseSeverity('fatal')).toBe('CRITICAL');
    });

    it('refuses anything else', () => {
      expect(parseSeverity('verbose')).toBeUndefined();
      expect(parseSeverity(30)).toBeUndefined();
      expect(parseSeverity(undefined)).toBeUndefined();
    });
  });

  it('filters by severity threshold', () => {
    expect(isEnabled('INFO', 'DEBUG')).toBe(false);
    expect(isEnabled('INFO', 'INFO')).toBe(true);
    expect(isEnabled('WARNING', 'ERROR')).toBe(true);
    expect(isEnabled('ERROR', 'WARNING')).toBe(false);
  });

  describe('redactPersonalData', () => {
    it('removes email addresses, national IDs and connection-string credentials', () => {
      expect(
        redactPersonalData(
          'SMTP RCPT refused: 550 <somchai.j@example.co.th> unknown; id 1103700012345, ' +
            'printed 1-1037-00012-34-5; db postgresql://cwork:hunter2@db:5432/cwork',
        ),
      ).toBe(
        'SMTP RCPT refused: 550 <<email>> unknown; id <national-id>, ' +
          'printed <national-id>; db postgresql://<credentials>@db:5432/cwork',
      );
    });

    it('leaves ids, counts and dates alone', () => {
      const line =
        'Run PR-2026-09 skipped 3 employee(s); event 7c9e6679-7425-40de-944b-e07fc1f90ae7 ' +
        'on 2026-09-26, 12 attempts, 1500ms';
      expect(redactPersonalData(line)).toBe(line);
    });
  });

  describe('describeError', () => {
    it('keeps an ordinary error message and the frames of its stack', () => {
      const error = new TypeError('boom');
      const described = describeError(error)!;
      expect(described.type).toBe('TypeError');
      expect(described.message).toBe('boom');
      expect(described.stack?.split('\n')[0]).toBe('TypeError');
      expect(described.stack).toMatch(/\n\s+at /);
    });

    it('withholds the message of a Prisma query error, which renders the query arguments', () => {
      const error = Object.assign(
        new Error('Invalid `prisma.employee.create()` invocation: { nationalId: "1103700012345" }'),
        { name: 'PrismaClientKnownRequestError', code: 'P2002' },
      );
      const described = describeError(error)!;
      expect(described).toMatchObject({
        type: 'PrismaClientKnownRequestError',
        message: 'P2002 (query details withheld)',
      });
      expect(JSON.stringify(described)).not.toContain('1103700012345');
      expect(JSON.stringify(described)).not.toContain('invocation');
    });

    it('withholds a Prisma validation error too, which has no code', () => {
      const error = Object.assign(new Error('Argument baseSalary: 98765.43'), {
        name: 'PrismaClientValidationError',
      });
      expect(describeError(error)?.message).toBe('(query details withheld)');
      expect(JSON.stringify(describeError(error))).not.toContain('98765.43');
    });

    it('describes a thrown non-error as a string', () => {
      expect(describeError('plain')).toEqual({ type: 'Error', message: 'plain' });
      expect(describeError(undefined)).toBeUndefined();
    });
  });

  describe('toLogRecord', () => {
    const entry: LogEntry = {
      severity: 'INFO',
      time: new Date('2026-09-26T10:15:30.123Z'),
      message: 'GET /api/v1/employees 200',
      labels: {
        app: 'cwork-api',
        event: 'http.request.completed',
        correlation_id: 'req-0001-abcd',
        location_code: '',
      },
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      httpRequest: {
        requestMethod: 'GET',
        requestUrl: '/api/v1/employees',
        status: 200,
        latency: '0.004s',
      },
    };

    it('writes plain labels with event inside them, and a plain trace, by default', () => {
      expect(toLogRecord(entry, { format: 'default', includeStack: false })).toEqual({
        severity: 'INFO',
        time: '2026-09-26T10:15:30.123Z',
        message: 'GET /api/v1/employees 200',
        labels: {
          app: 'cwork-api',
          event: 'http.request.completed',
          correlation_id: 'req-0001-abcd',
        },
        trace: '4bf92f3577b34da6a3ce929d0e0e4736',
        httpRequest: {
          requestMethod: 'GET',
          requestUrl: '/api/v1/employees',
          status: 200,
          latency: '0.004s',
        },
      });
    });

    it('moves labels and trace to the Cloud Logging keys with LOG_FORMAT=gcp, and nothing else', () => {
      const plain = toLogRecord(entry, { format: 'default', includeStack: false });
      const gcp = toLogRecord(entry, {
        format: 'gcp',
        gcpProject: 'demo-project',
        includeStack: false,
      });

      expect(gcp['logging.googleapis.com/labels']).toEqual(plain.labels);
      expect(gcp['logging.googleapis.com/trace']).toBe(
        'projects/demo-project/traces/4bf92f3577b34da6a3ce929d0e0e4736',
      );
      expect(without(gcp, 'logging.googleapis.com/labels', 'logging.googleapis.com/trace')).toEqual(
        without(plain, 'labels', 'trace'),
      );
    });

    it('keeps a plain trace in gcp format when no project id is configured', () => {
      const record = toLogRecord(entry, { format: 'gcp', includeStack: false });
      expect(record.trace).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(record).not.toHaveProperty('logging.googleapis.com/trace');
    });

    it('never writes a query string, even when handed one', () => {
      const record = toLogRecord(
        {
          ...entry,
          httpRequest: { ...entry.httpRequest!, requestUrl: '/api/v1/employees?q=secret' },
        },
        { format: 'default', includeStack: false },
      );
      expect((record.httpRequest as { requestUrl: string }).requestUrl).toBe('/api/v1/employees');
    });

    it('writes an error stack only when asked to (LOG_LEVEL=DEBUG)', () => {
      const failing: LogEntry = {
        ...entry,
        severity: 'ERROR',
        error: { type: 'Error', message: 'boom', stack: 'Error\n    at x (y.ts:1:1)' },
      };
      expect(toLogRecord(failing, { format: 'default', includeStack: false }).error).toEqual({
        type: 'Error',
        message: 'boom',
      });
      expect(toLogRecord(failing, { format: 'default', includeStack: true }).error).toEqual({
        type: 'Error',
        message: 'boom',
        stack: 'Error\n    at x (y.ts:1:1)',
      });
    });

    it('redacts what it recognises in every free-text field', () => {
      const record = toLogRecord(
        {
          ...entry,
          message: 'delivery to somchai@example.com failed',
          error: { type: 'Error', message: 'id 1103700012345', stack: 'Error\n    at a@b.co' },
        },
        { format: 'default', includeStack: true },
      );
      expect(JSON.stringify(record)).not.toMatch(/somchai@|1103700012345|a@b\.co/);
    });
  });
});

function without(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}
