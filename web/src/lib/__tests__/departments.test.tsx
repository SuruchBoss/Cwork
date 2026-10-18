// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { departmentsOf, useDepartmentOptions } from '@/lib/departments';
import { P } from '@/lib/permissions';
import { person, signInWith } from '@/test/session';
import { renderWithProviders } from '@/test/a11y';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const get = vi.mocked(api.get);

const ops = { id: 'd-ops', name: 'Operations' };
const eng = { id: 'd-eng', name: 'Engineering' };
const empty = { id: 'd-empty', name: 'Archive' };

function Probe() {
  return (
    <p>
      {useDepartmentOptions()
        .map((d) => d.name)
        .join(',') || 'none'}
    </p>
  );
}

const calledPaths = () => get.mock.calls.map(([path]) => path);

beforeEach(() => {
  get.mockImplementation(async (path: string) => {
    if (path === '/departments') return [empty, eng, ops];
    if (path === '/employees') {
      return {
        data: [person('A1', ops), person('A2', eng), person('A3', ops), person('A4', null)],
        meta: { total: 4 },
      };
    }
    throw new Error(`unexpected ${path}`);
  });
});

afterEach(() => vi.clearAllMocks());

describe('The departments a filter offers (CW-095)', () => {
  it('never asks /departments of someone without org:read, and offers the departments of the people they see', async () => {
    signInWith(P.EMPLOYEE_READ_TEAM);
    renderWithProviders(<Probe />);

    expect(await screen.findByText('Engineering,Operations')).toBeInTheDocument();
    expect(calledPaths()).not.toContain('/departments');
  });

  it('still gives anyone with org:read the whole list, empty departments included', async () => {
    signInWith(P.ORG_READ, P.EMPLOYEE_READ);
    renderWithProviders(<Probe />);

    expect(await screen.findByText('Archive,Engineering,Operations')).toBeInTheDocument();
    expect(calledPaths()).not.toContain('/employees');
  });

  it('asks for nothing when the person can neither read the organisation nor list people', async () => {
    signInWith();
    renderWithProviders(<Probe />);

    expect(await screen.findByText('none')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('lists each department once, in name order, and skips people with none', () => {
    expect(
      departmentsOf([person('1', ops), person('2', eng), person('3', ops), person('4', null)]),
    ).toEqual([eng, ops]);
  });
});
