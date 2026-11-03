// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import { ScannerNumberCard } from '../ScannerNumberCard';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), configure: vi.fn(), onDemoReset: vi.fn() },
}));

const patch = vi.mocked(api.patch);
const post = vi.mocked(api.post);

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

describe("An employee's scanner numbers over time (CW-109)", () => {
  const periods = [
    { id: 'p2', scannerNumber: '012', validFrom: '2026-06-01', validTo: null },
    { id: 'p1', scannerNumber: '007', validFrom: null, validTo: '2026-05-31' },
  ];

  beforeEach(() => {
    useAuthStore.setState({
      canAny: (...permissions: string[]) => permissions.includes(P.ATTENDANCE_MANAGE),
    } as never);
    post.mockResolvedValue({});
  });

  it('lists the numbers the person has had, with when each counts', () => {
    renderWithProviders(
      <ScannerNumberCard
        person={{ id: 'e1', scannerId: '012', scannerNumbers: periods }}
        canEdit={false}
      />,
    );

    const list = screen.getByRole('list', { name: 'เลขที่พนักงานคนนี้เคยใช้' });
    expect(within(list).getByText(/ตั้งแต่ต้น, ถึง/)).toBeInTheDocument();
    expect(within(list).getByText(/ใช้อยู่/)).toBeInTheDocument();
    expect(within(list).getByText('007')).toBeInTheDocument();
  });

  it('ends the number in use on the date given, and only for someone who manages attendance', async () => {
    const { unmount } = renderWithProviders(
      <ScannerNumberCard
        person={{ id: 'e1', scannerId: '012', scannerNumbers: periods }}
        canEdit
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'สิ้นสุดเลขนี้ในวันที่…' }));
    const end = screen.getByRole('button', { name: 'สิ้นสุดเลขนี้' });
    expect(end).toBeDisabled();
    await user.type(screen.getByLabelText('วันสุดท้ายที่เลขนี้นับ'), '31/10/2569');
    await user.click(end);

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/attendance/scanner/numbers/p2/end', {
        endDate: '2026-10-31',
      }),
    );
    unmount();

    useAuthStore.setState({ canAny: () => false } as never);
    renderWithProviders(
      <ScannerNumberCard
        person={{ id: 'e1', scannerId: '012', scannerNumbers: periods }}
        canEdit
      />,
    );
    expect(screen.queryByRole('button', { name: 'สิ้นสุดเลขนี้ในวันที่…' })).toBeNull();
  });
});
