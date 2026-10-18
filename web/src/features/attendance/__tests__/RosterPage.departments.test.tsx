// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { P } from '@/lib/permissions';
import { useUiStore } from '@/stores/ui.store';
import { renderWithProviders } from '@/test/a11y';
import { person, signInWith } from '@/test/session';
import RosterPage from '../RosterPage';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const get = vi.mocked(api.get);
const eng = { id: 'd-eng', name: 'Engineering' };
const ops = { id: 'd-ops', name: 'Operations' };

const departmentChoices = async () => {
  const select = await screen.findByLabelText('แผนก');
  return within(select)
    .getAllByRole('option')
    .map((o) => o.textContent);
};

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  get.mockImplementation(async (path: string) => {
    if (path === '/departments') return [{ id: 'd-all', name: 'Archive' }, eng, ops];
    if (path === '/employees') {
      return { data: [person('A1', ops), person('A2', eng)], meta: { total: 2 } };
    }
    if (path === '/roster') return { from: '2026-10-18', to: '2026-10-31', employees: [] };
    return [];
  });
});

afterEach(() => vi.clearAllMocks());

describe('The shifts and roster page as a manager (CW-095)', () => {
  it('filters by the departments of the people they see, and never asks /departments', async () => {
    signInWith(P.EMPLOYEE_READ_TEAM, P.ATTENDANCE_READ_TEAM);
    renderWithProviders(<RosterPage />);

    await vi.waitFor(async () =>
      expect(await departmentChoices()).toEqual(['ทุกแผนก', 'Engineering', 'Operations']),
    );
    expect(get.mock.calls.map(([path]) => path)).not.toContain('/departments');
  });

  it('keeps the full list for HR, who may read the organisation', async () => {
    signInWith(P.EMPLOYEE_READ, P.ORG_READ, P.SHIFT_MANAGE);
    renderWithProviders(<RosterPage />);

    await vi.waitFor(async () =>
      expect(await departmentChoices()).toEqual([
        'ทุกแผนก',
        'Archive',
        'Engineering',
        'Operations',
      ]),
    );
  });
});
