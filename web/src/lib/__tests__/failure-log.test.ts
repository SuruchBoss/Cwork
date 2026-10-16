// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProblemReport } from '@/features/support/problem-report';
import { api } from '../api-client';
import {
  clearFailures,
  describeFailure,
  lastRoute,
  maskPath,
  maskQueryKeys,
  noteRoute,
  recentFailures,
  recordFailure,
  resetRoute,
} from '../failure-log';

/** The first employee of the demo company the seed creates, as the records hold them. */
const PERSON = {
  code: 'EMP-0001',
  name: 'สมศักดิ์ ธนาวงศ์',
  first: 'สมศักดิ์',
  last: 'ธนาวงศ์',
  email: 'ceo@cwork.example',
  salary: '250000',
  nationalId: '1101700230705',
  phone: '0812345678',
  id: '3f2c9a54-7d1e-4b6a-9c0e-5a8d2f61b7c3',
};
const SECRETS = Object.values(PERSON);

beforeEach(() => {
  clearFailures();
  resetRoute();
});
afterEach(() => vi.restoreAllMocks());

describe('maskPath', () => {
  it('keeps the fixed words of a route and replaces everything else with :id', () => {
    expect(maskPath('/employees')).toBe('/employees');
    expect(maskPath(`/employees/${PERSON.id}/roles`)).toBe('/employees/:id/roles');
    expect(maskPath('/payroll/runs/9b1d/print/payslips')).toBe('/payroll/runs/:id/print/payslips');
    expect(maskPath('/payroll/reports/sso-filing')).toBe('/payroll/reports/sso-filing');
  });

  it('never lets a code, a name or an encoded word through', () => {
    for (const secret of [
      PERSON.code,
      PERSON.name,
      PERSON.email,
      PERSON.nationalId,
      PERSON.phone,
    ]) {
      for (const path of [
        `/employees/${secret}`,
        `/employees/${encodeURIComponent(secret)}/leave`,
        `/employees/by-code/${secret}`,
      ]) {
        const masked = maskPath(path);
        expect({ path, leaked: SECRETS.some((s) => masked.includes(s)) }).toEqual({
          path,
          leaked: false,
        });
      }
    }
    expect(maskPath('/employees/EMP-0001')).toBe('/employees/:id');
    expect(maskPath('/payroll/periods/2026-12-H1')).toBe('/payroll/periods/:id');
  });

  it('drops a query string or fragment written into the path', () => {
    expect(maskPath(`/employees?search=${PERSON.first}`)).toBe('/employees');
    expect(maskPath(`/employees#${PERSON.last}`)).toBe('/employees');
  });
});

describe('maskQueryKeys', () => {
  it('keeps the names of the parameters and never their values', () => {
    const keys = maskQueryKeys({ search: PERSON.name, page: 2, status: 'ACTIVE', empty: '' });
    expect(keys).toEqual(['search', 'page', 'status']);
  });

  it('leaves out a name that is not a plain identifier', () => {
    expect(maskQueryKeys({ [PERSON.name]: '1', ok: '1' })).toEqual(['ok']);
    expect(maskQueryKeys(undefined)).toEqual([]);
  });
});

describe('describeFailure', () => {
  it('keeps the status, a stable code and a request id of the shape the server issues', () => {
    const failure = describeFailure(
      {
        method: 'post',
        path: `/employees/${PERSON.id}/roles`,
        query: { search: PERSON.name },
        status: 403,
        code: 'ROLE_ABOVE_YOUR_OWN',
        requestId: 'req-8f3a2c1d-0b7e',
      },
      new Date('2026-10-16T04:00:00Z'),
    );
    expect(failure).toEqual({
      at: '2026-10-16T04:00:00.000Z',
      method: 'POST',
      path: '/employees/:id/roles',
      queryKeys: ['search'],
      status: 403,
      code: 'ROLE_ABOVE_YOUR_OWN',
      requestId: 'req-8f3a2c1d-0b7e',
    });
  });

  it('turns a code or id that could carry a name into nothing', () => {
    const failure = describeFailure({
      method: 'GET',
      path: '/employees',
      status: 404,
      code: `Employee ${PERSON.name} not found`,
      requestId: PERSON.name,
    });
    expect(failure.code).toBe('UNKNOWN');
    expect(failure.requestId).toBeNull();
  });
});

describe('the list of failures', () => {
  it('keeps the last ten, oldest first, and is emptied on request', () => {
    for (let i = 1; i <= 12; i += 1) {
      recordFailure(
        describeFailure({ method: 'GET', path: '/employees', status: 500, code: `E${i}` }),
      );
    }
    const kept = recentFailures();
    expect(kept).toHaveLength(10);
    expect(kept[0]!.code).toBe('E3');
    expect(kept[9]!.code).toBe('E12');
    clearFailures();
    expect(recentFailures()).toEqual([]);
  });

  it('remembers the last screen, but not the report form itself', () => {
    expect(lastRoute()).toBeNull();
    noteRoute(`/employees/${PERSON.id}`);
    expect(lastRoute()).toBe('/employees/:id');
    noteRoute('/support/report');
    expect(lastRoute()).toBe('/employees/:id');
  });
});

describe('what the console keeps when a request fails (CW-087)', () => {
  /** The server answering a request about the seeded employee with an error that names them. */
  function failWith(status: number) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            code: 'EMPLOYEE_NOT_FOUND',
            message: `Employee ${PERSON.code} ${PERSON.name} (${PERSON.nationalId}) was not found`,
            details: { workEmail: PERSON.email, baseSalary: PERSON.salary, phone: PERSON.phone },
            requestId: 'req-8f3a2c1d-0b7e',
          }),
          { status, headers: { 'Content-Type': 'application/json' } },
        ),
    );
  }

  it('holds the route, parameter names, status, code and request id, and nothing about the person', async () => {
    failWith(404);
    await expect(
      api.post(
        `/employees/${PERSON.id}/roles`,
        { roleKey: 'HR_OFFICER', nationalId: PERSON.nationalId, baseSalary: PERSON.salary },
        { query: { search: PERSON.name, email: PERSON.email, page: 2 } },
      ),
    ).rejects.toMatchObject({ status: 404, code: 'EMPLOYEE_NOT_FOUND' });
    await expect(api.get(`/employees/by-code/${PERSON.code}`)).rejects.toBeDefined();
    await expect(api.get(`/employees/${encodeURIComponent(PERSON.name)}`)).rejects.toBeDefined();
    await expect(api.download(`/payroll/runs/${PERSON.id}/print/payslips`)).rejects.toBeDefined();

    const kept = recentFailures();
    expect(kept.map((f) => `${f.method} ${f.path} ${f.status} ${f.code}`)).toEqual([
      'POST /employees/:id/roles 404 EMPLOYEE_NOT_FOUND',
      'GET /employees/by-code/:id 404 EMPLOYEE_NOT_FOUND',
      'GET /employees/:id 404 EMPLOYEE_NOT_FOUND',
      'GET /payroll/runs/:id/print/payslips 404 EMPLOYEE_NOT_FOUND',
    ]);
    expect(kept[0]!.queryKeys).toEqual(['search', 'email', 'page']);
    expect(kept[0]!.requestId).toBe('req-8f3a2c1d-0b7e');

    const stored = JSON.stringify(kept);
    for (const secret of SECRETS) expect(stored).not.toContain(secret);
  });

  it('puts none of it in the report either, and the description goes in untouched', async () => {
    failWith(404);
    await expect(
      api.patch(
        `/employees/${PERSON.id}`,
        { firstNameTh: PERSON.first, lastNameTh: PERSON.last, nationalId: PERSON.nationalId },
        { query: { q: PERSON.name } },
      ),
    ).rejects.toBeDefined();

    const description = 'กดบันทึกแล้วขึ้นข้อความสีแดง\nไม่รู้ว่าทำอะไรผิด';
    const report = buildProblemReport({
      description,
      failures: recentFailures(),
      page: lastRoute(),
      consoleVersion: '0.4.0',
      userAgent: 'Mozilla/5.0 (test)',
      language: 'th',
      now: new Date('2026-10-16T04:00:00Z'),
    });

    for (const secret of SECRETS) expect(report).not.toContain(secret);
    expect(report).toContain(description);
    expect(report).toContain(
      'PATCH /employees/:id ?q -> 404 EMPLOYEE_NOT_FOUND (request req-8f3a2c1d-0b7e)',
    );
    expect(report.indexOf(description)).toBeLessThan(report.indexOf('Attached by Cwork'));
  });

  it('records a request that got no answer at all, with status 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      api.get('/leave/requests', { query: { employeeId: PERSON.id } }),
    ).rejects.toThrow();

    expect(recentFailures()).toMatchObject([
      {
        method: 'GET',
        path: '/leave/requests',
        queryKeys: ['employeeId'],
        status: 0,
        code: 'NETWORK_ERROR',
        requestId: null,
      },
    ]);
  });

  it('records nothing for a request that worked', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await api.get('/employees');
    expect(recentFailures()).toEqual([]);
  });
});
