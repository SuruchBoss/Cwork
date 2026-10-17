// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import { ScannerNumberCard } from '../ScannerNumberCard';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), patch: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const patch = vi.mocked(api.patch);

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  patch.mockResolvedValue({});
});

afterEach(() => vi.clearAllMocks());

describe("An employee's scanner number on their page (CW-090)", () => {
  it('shows the number as it is kept, and offers no edit to someone who may not edit', async () => {
    const { container } = renderWithProviders(
      <ScannerNumberCard person={{ id: 'e1', scannerId: '007' }} canEdit={false} />,
    );

    expect(screen.getByText('007')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'แก้ไข' })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it('sends 007 as the text 007, never as the number 7', async () => {
    renderWithProviders(<ScannerNumberCard person={{ id: 'e1', scannerId: null }} canEdit />);
    const user = userEvent.setup();

    expect(
      screen.getByText('ยังไม่มีเลขสแกนนิ้ว วันที่มาจากเครื่องสแกนจะรอจนกว่าจะมีเลข'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }));
    await user.type(screen.getByLabelText('เลขในเครื่องสแกน'), ' 007 ');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith('/employees/e1', { scannerId: '007' }));
    expect(
      await screen.findByText(/บันทึกแล้ว วันที่นำเข้าไว้แล้วภายใต้เลขนี้เป็นของพนักงานคนนี้แล้ว/),
    ).toBeInTheDocument();
  });

  it('clears a number with an empty box, and sends nothing when nothing changed', async () => {
    renderWithProviders(<ScannerNumberCard person={{ id: 'e1', scannerId: '0090' }} canEdit />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'แก้ไข' }));
    expect(screen.getByLabelText('เลขในเครื่องสแกน')).toHaveValue('0090');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(patch).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'แก้ไข' }));
    await user.clear(screen.getByLabelText('เลขในเครื่องสแกน'));
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/employees/e1', { scannerId: null }));
  });

  it('refuses a number with a space before asking the server', async () => {
    renderWithProviders(<ScannerNumberCard person={{ id: 'e1', scannerId: null }} canEdit />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }));
    await user.type(screen.getByLabelText('เลขในเครื่องสแกน'), '0 07');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('เลขสแกนนิ้วต้องไม่มีช่องว่าง');
    expect(patch).not.toHaveBeenCalled();
  });

  it("says so when the number is another employee's", async () => {
    patch.mockRejectedValue(
      new ApiError(
        409,
        'DUPLICATE_SCANNER_ID',
        'Scanner ID 9002 already belongs to employee EMP-1',
      ),
    );
    renderWithProviders(<ScannerNumberCard person={{ id: 'e1', scannerId: null }} canEdit />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }));
    await user.type(screen.getByLabelText('เลขในเครื่องสแกน'), '9002');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'เลขสแกนนิ้วนี้เป็นของพนักงานคนอื่นอยู่แล้ว',
    );
  });
});
