import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api-client';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import type { ApprovalTask } from '@/types/api';
import ApprovalsPage from '../ApprovalsPage';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    configure: vi.fn(),
  },
}));

const task: ApprovalTask = {
  id: 'task-1',
  stepIndex: 0,
  status: 'PENDING',
  dueAt: null,
  createdAt: '2026-09-10T00:00:00.000Z',
  instance: {
    id: 'inst-1',
    entityType: 'LEAVE_REQUEST',
    entityId: 'leave-1',
    snapshot: { leaveTypeCode: 'ANNUAL', totalDays: 2, startDate: '2026-09-20' },
    submittedAt: '2026-09-10T00:00:00.000Z',
    submittedBy: {
      id: 'user-2',
      email: 'somchai@example.com',
      employee: { firstNameTh: 'สมชาย', lastNameTh: 'ใจดี', employeeCode: 'EMP-002' },
    },
  },
};

describe('ApprovalsPage accessibility', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue([task]);
    vi.mocked(api.post).mockResolvedValue({});
  });

  it('has no critical or serious axe violations', async () => {
    const { container } = renderWithProviders(<ApprovalsPage />);
    await screen.findByText('สมชาย ใจดี');
    await expectNoAxeViolations(container);
  });

  it('lets a reviewer approve a request with the keyboard alone', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsPage />);
    await screen.findByText('สมชาย ใจดี');

    // Tab to the first action and activate it — no pointer involved.
    await user.tab();
    const approve = screen.getByRole('button', { name: 'อนุมัติ' });
    expect(approve).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(vi.mocked(api.post)).toHaveBeenCalledWith(
        '/approvals/tasks/task-1/decide',
        expect.objectContaining({ decision: 'APPROVE' }),
      ),
    );
  });

  it('moves focus to the reason field when rejecting, and stays accessible', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ApprovalsPage />);
    await screen.findByText('สมชาย ใจดี');

    await user.click(screen.getByRole('button', { name: 'ไม่อนุมัติ' }));

    const reason = screen.getByLabelText('เหตุผลที่ไม่อนุมัติ');
    expect(reason).toHaveFocus();
    await expectNoAxeViolations(container);
  });
});
