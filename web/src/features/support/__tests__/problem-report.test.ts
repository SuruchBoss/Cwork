// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  buildProblemReport,
  describeFailureLine,
  diagnosticsBlock,
  reportFilename,
  utcOffsetLabel,
} from '../problem-report';

const attached = {
  failures: [],
  page: '/payroll/runs/:id',
  consoleVersion: '0.4.0',
  userAgent: 'Mozilla/5.0 (test)',
  language: 'en',
  now: new Date('2026-10-16T04:30:00Z'),
};

describe('describeFailureLine', () => {
  it('writes the route, parameter names, answer, code and request id on one line', () => {
    expect(
      describeFailureLine(
        {
          at: '2026-10-16T04:29:10.000Z',
          method: 'GET',
          path: '/employees',
          queryKeys: ['search', 'page'],
          status: 500,
          code: 'INTERNAL_ERROR',
          requestId: 'req-12345678',
        },
        0,
      ),
    ).toBe(
      '1. 2026-10-16T04:29:10.000Z GET /employees ?search,page -> 500 INTERNAL_ERROR (request req-12345678)',
    );
  });

  it('says there was no answer when the status is 0, and leaves out what it does not have', () => {
    expect(
      describeFailureLine(
        {
          at: '2026-10-16T04:29:10.000Z',
          method: 'POST',
          path: '/auth/login',
          queryKeys: [],
          status: 0,
          code: 'NETWORK_ERROR',
          requestId: null,
        },
        2,
      ),
    ).toBe('3. 2026-10-16T04:29:10.000Z POST /auth/login -> no answer NETWORK_ERROR');
  });
});

describe('the report', () => {
  it('says plainly when nothing failed', () => {
    expect(diagnosticsBlock(attached)).toContain('(none since this page was opened)');
  });

  it('says what it holds and what it does not, and the version and screen', () => {
    const block = diagnosticsBlock(attached);
    expect(block).toContain('no names, ID numbers, salaries or other personal data');
    expect(block).toContain('Console version: 0.4.0');
    expect(block).toContain('Screen: /payroll/runs/:id');
    expect(block).toContain('Time: 2026-10-16T04:30:00.000Z (UTC');
  });

  it('says the screen is not known rather than leave it blank', () => {
    expect(diagnosticsBlock({ ...attached, page: null })).toContain('Screen: not known');
  });

  it('trims what was written but changes nothing inside it', () => {
    const report = buildProblemReport({
      ...attached,
      description: '  line one\n\n  line two  ',
    });
    expect(report).toContain('written by the person reporting):\nline one\n\n  line two\n');
  });
});

describe('small helpers', () => {
  it('names the offset from UTC the way people write it', () => {
    const at = (offsetMinutes: number) => ({ getTimezoneOffset: () => offsetMinutes }) as Date;
    expect(utcOffsetLabel(at(-420))).toBe('UTC+07:00');
    expect(utcOffsetLabel(at(0))).toBe('UTC+00:00');
    expect(utcOffsetLabel(at(300))).toBe('UTC-05:00');
    expect(utcOffsetLabel(at(-330))).toBe('UTC+05:30');
  });

  it('names the file by the local date and time', () => {
    expect(reportFilename(new Date(2026, 9, 16, 11, 30))).toBe(
      'cwork-problem-report-20261016-1130.txt',
    );
  });
});
