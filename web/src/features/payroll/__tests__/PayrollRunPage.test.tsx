// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, saveBlob } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import PayrollRunPage from '../PayrollRunPage';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    download: vi.fn(),
    configure: vi.fn(),
    onDemoReset: vi.fn(),
  },
  saveBlob: vi.fn(),
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const secondHalf = {
  id: 'run-h2',
  runNo: 'PR-2026-11-H2-01',
  type: 'REGULAR',
  status: 'DRAFT',
  employeeCount: 0,
  totalGross: '0',
  totalDeduction: '0',
  totalNet: '0',
  totalEmployerCost: '0',
  currency: 'THB',
  calculatedAt: null,
  approvedAt: null,
  paidAt: null,
  failureReason: null,
  period: {
    code: '2026-11-H2',
    year: 2026,
    month: 11,
    payDate: '2026-11-30',
    payFrequency: 'SEMI_MONTHLY',
    half: 2,
  },
  payslips: [],
};

const slip = {
  id: 'ps-1',
  currency: 'THB',
  grossEarnings: '4000',
  totalDeductions: '200',
  netPay: '3800',
  publishedAt: null,
  employee: {
    id: 'e-1',
    employeeCode: 'D001',
    firstNameTh: 'สมชาย',
    lastNameTh: 'ใจดี',
    department: null,
  },
};

function serve(run: unknown) {
  get.mockImplementation((path: string) =>
    path === '/assistant/status'
      ? Promise.resolve({ enabled: false })
      : path === '/payroll/runs/run-h2'
        ? Promise.resolve(run)
        : Promise.resolve([]),
  );
}

function render() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/payroll/runs/run-h2']}>
      <Routes>
        <Route path="/payroll/runs/:id" element={<PayrollRunPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({ language: 'th' });
  useAuthStore.setState({
    can: (...permissions: string[]) =>
      permissions.includes(P.PAYROLL_RUN) || permissions.includes(P.PAYROLL_APPROVE),
  });
});

afterEach(() => vi.clearAllMocks());

describe('A second-half run (CW-069)', () => {
  it('says why it cannot be calculated while the first half is not approved', async () => {
    serve({
      ...secondHalf,
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'CALCULATED' },
    });
    const { container } = render();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('รอบครึ่งแรกเลขที่ PR-2026-11-H1-01 ตอนนี้สถานะ“คำนวณแล้ว”');
    expect(
      screen.getByRole('link', { name: 'เปิดรอบครึ่งแรกเลขที่ PR-2026-11-H1-01' }),
    ).toHaveAttribute('href', '/payroll/runs/run-h1');
    const calculate = screen.getByRole('button', { name: 'คำนวณเงินเดือน' });
    expect(calculate).toBeDisabled();
    expect(calculate).toHaveAccessibleDescription(
      expect.stringContaining('ต้องอนุมัติครึ่งแรกก่อนจึงจะคำนวณครึ่งนี้ได้'),
    );
    expect(screen.getByText(/16–30 พฤศจิกายน 2569/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says the first half has no run yet', async () => {
    serve({ ...secondHalf, firstHalf: null });
    render();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'แต่ครึ่งแรกยังไม่มีรอบคำนวณ ให้สร้างรอบครึ่งแรก คำนวณ และอนุมัติก่อน',
    );
  });

  it('lets the run be calculated once the first half is approved, paid or not (CW-104)', async () => {
    serve({
      ...secondHalf,
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'APPROVED' },
    });
    render();
    expect(await screen.findByRole('button', { name: 'คำนวณเงินเดือน' })).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lets the run be calculated once the first half is paid', async () => {
    serve({
      ...secondHalf,
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
    });
    render();
    expect(await screen.findByRole('button', { name: 'คำนวณเงินเดือน' })).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('The refusal to approve one’s own run (CW-103)', () => {
  it('is in Thai, and says who has to approve', async () => {
    serve({
      ...secondHalf,
      status: 'CALCULATED',
      calculatedAt: '2026-11-30T03:00:00.000Z',
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
    });
    post.mockRejectedValueOnce(
      new ApiError(
        422,
        'SELF_APPROVAL_NOT_ALLOWED',
        'A payroll run must be approved by someone other than the person who prepared it',
      ),
    );
    render();

    await userEvent.click(await screen.findByRole('button', { name: 'อนุมัติรอบ' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'อนุมัติรอบ' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'รอบเงินเดือนต้องอนุมัติโดยคนอื่นที่ไม่ใช่คนเตรียมรอบ',
    );
  });
});

describe('A step the signed-in person cannot take is shown closed, with the reason (CW-112)', () => {
  const calculated = {
    ...secondHalf,
    status: 'CALCULATED',
    calculatedAt: '2026-11-30T03:00:00.000Z',
    createdById: 'creator',
    calculatedById: 'preparer',
    firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
  };

  it('closes Approve for whoever calculated the run, and says why on the screen', async () => {
    useAuthStore.setState({ user: { id: 'preparer' } as never });
    serve(calculated);
    render();

    const button = await screen.findByRole('button', { name: 'อนุมัติรอบ' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/คุณเป็นคนเตรียมรอบนี้ จึงอนุมัติเองไม่ได้/);
    await userEvent.click(button);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('closes Approve for whoever created the run as well', async () => {
    useAuthStore.setState({ user: { id: 'creator' } as never });
    serve(calculated);
    render();

    expect(await screen.findByRole('button', { name: 'อนุมัติรอบ' })).toBeDisabled();
  });

  it('leaves Approve open for another approver, with no notice', async () => {
    useAuthStore.setState({ user: { id: 'owner' } as never });
    serve(calculated);
    render();

    expect(await screen.findByRole('button', { name: 'อนุมัติรอบ' })).toBeEnabled();
    expect(screen.queryByText(/จึงอนุมัติเองไม่ได้/)).not.toBeInTheDocument();
  });

  it('closes Approve and payment for a person who runs payroll but may not approve it', async () => {
    useAuthStore.setState({
      user: { id: 'officer' } as never,
      can: (...permissions: string[]) => permissions.includes(P.PAYROLL_RUN),
    });
    serve(calculated);
    const first = render();

    const approve = await screen.findByRole('button', { name: 'อนุมัติรอบ' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(/ต้องมีสิทธิ์อนุมัติเงินเดือน/);
    first.unmount();

    serve({ ...calculated, status: 'APPROVED' });
    render();
    const pay = await screen.findByRole('button', {
      name: 'บันทึกการจ่ายและเผยแพร่สลิป',
    });
    expect(pay).toBeDisabled();
    expect(pay).toHaveAccessibleDescription(/ต้องมีสิทธิ์อนุมัติเงินเดือน/);
  });
});

describe('One question before approving or paying a run', () => {
  const calculated = {
    ...secondHalf,
    status: 'CALCULATED',
    calculatedAt: '2026-11-30T03:00:00.000Z',
    employeeCount: 1,
    payslips: [slip],
    firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
  };
  const approvedRun = { ...calculated, status: 'APPROVED' };
  const dialog = () => screen.findByRole('alertdialog');

  it('asks before approving, and approves only on the yes', async () => {
    serve(calculated);
    post.mockResolvedValue({});
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'อนุมัติรอบ' }));

    const box = await dialog();
    expect(
      within(box).getByRole('heading', { name: 'อนุมัติรอบ PR-2026-11-H2-01 หรือไม่' }),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.click(within(box).getByRole('button', { name: 'อนุมัติรอบ' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/payroll/runs/run-h2/approve'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('opens on the safe answer, and the first answer closes it without doing anything', async () => {
    serve(calculated);
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole('button', { name: 'อนุมัติรอบ' }));
    const box = await dialog();

    expect(within(box).getByRole('button', { name: 'ยังไม่กด' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'อนุมัติรอบ' })).toHaveFocus();
  });

  it('keeps Tab inside the box while it is open', async () => {
    serve(calculated);
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole('button', { name: 'อนุมัติรอบ' }));
    const box = await dialog();

    await user.tab();
    expect(within(box).getByRole('button', { name: 'อนุมัติรอบ' })).toHaveFocus();
    await user.tab();

    expect(within(box).getByRole('button', { name: 'ยังไม่กด' })).toHaveFocus();
  });

  it('warns the approver whose own payslip is in the run, and nobody else', async () => {
    useAuthStore.setState({ user: { employeeId: 'e-1' } as never });
    serve(calculated);
    const user = userEvent.setup();
    const { unmount } = render();
    await user.click(await screen.findByRole('button', { name: 'อนุมัติรอบ' }));

    expect(within(await dialog()).getByRole('note')).toHaveTextContent(
      'รอบนี้มีสลิปของคุณเองอยู่ด้วย อนุมัติได้ แต่จะถูกบันทึกไว้ในประวัติการตรวจสอบ',
    );

    unmount();
    useAuthStore.setState({ user: { employeeId: 'someone-else' } as never });
    render();
    await user.click(await screen.findByRole('button', { name: 'อนุมัติรอบ' }));

    expect(within(await dialog()).queryByRole('note')).not.toBeInTheDocument();
  });

  it('says paying cannot be undone, tells a parallel run not to, and pays only on the yes', async () => {
    serve(approvedRun);
    post.mockResolvedValue({});
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'บันทึกการจ่ายและเผยแพร่สลิป' }));

    const box = await dialog();
    expect(box).toHaveTextContent('ย้อนกลับไม่ได้');
    expect(box).toHaveTextContent('ยกเลิกรอบนั้นไม่ได้แล้ว');
    expect(within(box).getByRole('note')).toHaveTextContent('รันคู่ขนาน');
    expect(within(box).getByRole('note')).toHaveTextContent('ไม่ต้องกด');
    expect(post).not.toHaveBeenCalled();

    await user.click(
      within(box).getByRole('button', { name: 'ยืนยัน บันทึกการจ่ายและเผยแพร่สลิป' }),
    );

    await waitFor(() => expect(post).toHaveBeenCalledWith('/payroll/runs/run-h2/pay'));
  });

  it('does not pay when the question is turned down', async () => {
    serve(approvedRun);
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole('button', { name: 'บันทึกการจ่ายและเผยแพร่สลิป' }));

    await user.click(within(await dialog()).getByRole('button', { name: 'ยังไม่กด' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('has nothing an accessibility check would flag while it is open', async () => {
    serve(approvedRun);
    const user = userEvent.setup();
    const { container } = render();
    await user.click(await screen.findByRole('button', { name: 'บันทึกการจ่ายและเผยแพร่สลิป' }));
    await dialog();

    await expectNoAxeViolations(container);
  });

  it('names a day the employee decided for themselves among the things to check', async () => {
    serve({
      ...calculated,
      payslips: [
        {
          ...slip,
          warnings: [{ code: 'OWN_SCANNER_DAY_DECIDED', params: { days: 1, dates: '2026-11-17' } }],
        },
      ],
    });
    render();

    expect(
      await screen.findByText(
        'มี 1 วันสแกนที่พนักงานตัดสินเอง เพราะไม่มีผู้อื่นที่ตัดสินแทนได้: 17 พ.ย. 2569',
      ),
    ).toBeInTheDocument();
    // The box already says "check before approving" in its heading; no line repeats it (CW-112).
    expect(screen.getAllByText(/ตรวจก่อนอนุมัติ/)).toHaveLength(1);
  });
});

describe('Payslip warnings on the run page (CW-069)', () => {
  it('lists each warning in Thai, with Thai dates, before approval', async () => {
    serve({
      ...secondHalf,
      status: 'CALCULATED',
      calculatedAt: '2026-11-30T03:00:00.000Z',
      employeeCount: 1,
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
      payslips: [
        {
          ...slip,
          warnings: [
            {
              code: 'NO_ATTENDANCE_RECORD',
              params: { days: 2, dates: '2026-11-17, 2026-11-18' },
            },
            { code: 'SSO_OVER_IN_FIRST_HALF', params: { amount: 12.5 } },
            { code: 'REST_DAY_WORK_RATE', params: { hours: 8, rates: 'DAY_OFF 1x' } },
            { code: 'ADVANCE_CARRIED_OVER', params: { amount: 1620 } },
            { code: 'SOMETHING_NEW' },
          ],
        },
        { ...slip, id: 'ps-2', warnings: [] },
      ],
    });
    const { container } = render();

    expect(await screen.findByRole('heading', { name: 'ตรวจก่อนอนุมัติ (1)' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'ไม่จ่าย 2 วันทำงานที่ไม่มีบันทึกเวลาและไม่มีการลา: 17 พ.ย. 2569, 18 พ.ย. 2569',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('ครึ่งแรกหักประกันสังคมเกินยอดทั้งเดือนไป ฿12.50 ระบบไม่คืนให้อัตโนมัติ'),
    ).toBeInTheDocument();
    expect(screen.getByText(/ทำงานในวันหยุด \(8 ชม\. ที่ .* 1×\)/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'เงินเบิก ฿1,620.00 เกินกว่าที่งวดนี้หักได้ ส่วนที่เหลือจะหักในรอบถัดไป มาตรา 76 ของ พ.ร.บ.คุ้มครองแรงงานไม่ได้ระบุการหักคืนเงินเบิกไว้ในรายการที่หักจากค่าจ้างได้ การหักจากรอบหลังจึงอาจต้องมีหนังสือยินยอมของลูกจ้างที่ลงชื่อและระบุเรื่องนี้ชัดเจน (มาตรา 77) Cwork ไม่ได้เก็บหนังสือยินยอมนี้ ฝ่ายบุคคลต้องเก็บเอง',
      ),
    ).toBeInTheDocument();
    // A code this screen does not know yet is still shown, not dropped.
    expect(screen.getByText('SOMETHING_NEW')).toBeInTheDocument();
    expect(screen.getByText('ตรวจ 5 เรื่อง')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('lists a substitute holiday and a raised rest-day rate in Thai (CW-076)', async () => {
    serve({
      ...secondHalf,
      status: 'CALCULATED',
      calculatedAt: '2026-11-30T03:00:00.000Z',
      employeeCount: 1,
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
      payslips: [
        {
          ...slip,
          warnings: [
            { code: 'SUBSTITUTE_HOLIDAY', params: { days: 1, dates: '2026-12-05 → 2026-12-07' } },
            { code: 'REST_DAY_RATE_RAISED', params: { hours: 4, rates: 'DAY_OFF 1x → 2x' } },
          ],
        },
      ],
    });
    const { container } = render();

    expect(
      await screen.findByText(
        'จ่ายวันหยุดตามประเพณีที่ตรงกับวันหยุดประจำสัปดาห์ 1 วัน เป็นวันหยุดชดเชยในวันทำงานถัดไปแล้ว: 5 ธ.ค. 2569 → 7 ธ.ค. 2569 ไม่ต้องเพิ่มวันเหล่านี้ในปฏิทินวันหยุดซ้ำ',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^จ่ายค่าทำงานในวันหยุด 4 ชม\. ตามอัตราขั้นต่ำของลูกจ้างรายวัน \(มาตรา 62\): .+ 1× → 2×$/,
      ),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says in English what sections 76 and 77 mean for a carried advance (CW-078)', async () => {
    useUiStore.setState({ language: 'en' });
    serve({
      ...secondHalf,
      status: 'CALCULATED',
      calculatedAt: '2026-11-30T03:00:00.000Z',
      employeeCount: 1,
      firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
      payslips: [
        { ...slip, warnings: [{ code: 'ADVANCE_CARRIED_OVER', params: { amount: 1620 } }] },
      ],
    });
    render();

    expect(
      await screen.findByText(
        "Advances of THB 1,620.00 were more than this period could take back; the rest comes off the next pay run. Section 76 of the Labour Protection Act does not list repaying an advance among the deductions from wages it allows, so taking it from a later pay run may need the employee's consent in writing, signed and naming this purpose (section 77); Cwork does not keep that consent, HR must",
      ),
    ).toBeInTheDocument();
  });
});

describe('Printing payslips and wage receipts (CW-071)', () => {
  const approved = {
    ...secondHalf,
    id: 'run-h2',
    status: 'APPROVED',
    employeeCount: 1,
    payslips: [slip],
    firstHalf: { id: 'run-h1', runNo: 'PR-2026-11-H1-01', status: 'PAID' },
  };
  const blob = new Blob(['%PDF-'], { type: 'application/pdf' });

  beforeEach(() => {
    useAuthStore.setState({
      can: (...permissions: string[]) => permissions.includes(P.PAYROLL_READ),
    });
    vi.mocked(api.download).mockResolvedValue({ blob, filename: 'payslips-PR.pdf' });
    URL.createObjectURL = vi.fn(() => 'blob:slips');
    URL.revokeObjectURL = vi.fn();
  });

  it('asks the server for the layout chosen and opens the PDF', async () => {
    serve(approved);
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const user = userEvent.setup();
    const { container } = render();

    await user.selectOptions(await screen.findByLabelText('จำนวนสลิปต่อหน้า A4'), '4');
    await user.click(screen.getByRole('button', { name: 'พิมพ์สลิปเงินเดือน' }));

    await waitFor(() =>
      expect(api.download).toHaveBeenCalledWith('/payroll/runs/run-h2/print/payslips', {
        query: { perPage: '4' },
      }),
    );
    await waitFor(() => expect(open).toHaveBeenCalledWith('blob:slips', '_blank'));
    expect(screen.getByText('การพิมพ์ทุกครั้งถูกบันทึกไว้ในประวัติการใช้งาน')).toBeInTheDocument();
    await expectNoAxeViolations(container);
    open.mockRestore();
  });

  it('prints the wage-receipt sheet', async () => {
    serve(approved);
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'พิมพ์ใบรับเงิน' }));
    await waitFor(() =>
      expect(api.download).toHaveBeenCalledWith('/payroll/runs/run-h2/print/receipts'),
    );
    open.mockRestore();
  });

  it('prints the cash sheet (CW-088)', async () => {
    serve(approved);
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'พิมพ์ใบเตรียมเงินสด' }));
    await waitFor(() =>
      expect(api.download).toHaveBeenCalledWith('/payroll/runs/run-h2/print/cash'),
    );
    open.mockRestore();
  });

  it('saves the file when the browser will not open a tab', async () => {
    serve(approved);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'พิมพ์ใบรับเงิน' }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'payslips-PR.pdf'));
    open.mockRestore();
  });

  it('shows the reason when the server refuses to print', async () => {
    serve(approved);
    vi.mocked(api.download).mockRejectedValue(
      new Error('Payslip of D001 in run PR does not add up'),
    );
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'พิมพ์สลิปเงินเดือน' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not add up');
  });

  it('keeps printing off until the run is approved', async () => {
    serve({ ...approved, status: 'CALCULATED' });
    render();

    expect(await screen.findByRole('button', { name: 'พิมพ์สลิปเงินเดือน' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'พิมพ์ใบรับเงิน' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'พิมพ์ใบเตรียมเงินสด' })).toBeDisabled();
    expect(screen.getByText('พิมพ์สลิปได้เมื่อรอบเงินเดือนได้รับอนุมัติแล้ว')).toBeInTheDocument();
  });

  it('does not offer printing to someone who cannot see pay', async () => {
    useAuthStore.setState({ can: () => false });
    serve(approved);
    render();

    await screen.findByText(/PR-2026-11-H2-01/);
    expect(screen.queryByRole('button', { name: 'พิมพ์สลิปเงินเดือน' })).toBeNull();
  });
});

describe('A run HR meets for the first time', () => {
  it('explains an empty half-month run instead of showing zero and nothing else', async () => {
    serve({ ...secondHalf, status: 'CALCULATED', firstHalf: undefined });
    render();

    expect(
      await screen.findByText(/งวดนี้ไม่มีใครได้รับค่าจ้างรายวัน งวดครึ่งเดือนจ่ายเฉพาะ/),
    ).toBeInTheDocument();
  });

  it('explains an empty monthly run in its own words', async () => {
    serve({
      ...secondHalf,
      status: 'CALCULATED',
      firstHalf: undefined,
      period: { ...secondHalf.period, payFrequency: 'MONTHLY', half: 0 },
    });
    render();

    expect(await screen.findByText(/งวดนี้ยังไม่มีใครตั้งเงินเดือนไว้/)).toBeInTheDocument();
  });

  it('names the employees the calculation left out', async () => {
    serve({ ...secondHalf, firstHalf: undefined });
    vi.mocked(api.post).mockResolvedValue({
      skipped: [{ employeeCode: 'D009', reason: 'No effective compensation record' }],
    });
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'คำนวณเงินเดือน' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'มีพนักงาน 1 คนที่ไม่อยู่ในรอบนี้ เพราะยังไม่ได้ตั้งค่าจ้างตั้งแต่งวดนี้: D009',
    );
  });

  it('tells whoever calculated who has to approve, and how', async () => {
    useAuthStore.setState({ user: { id: 'preparer' } as never });
    serve({
      ...secondHalf,
      status: 'CALCULATED',
      calculatedById: 'preparer',
      firstHalf: undefined,
      payslips: [slip],
    });
    render();

    expect(await screen.findByText(/จึงอนุมัติเองไม่ได้ ให้ผู้มีสิทธิ์อีกคน/)).toBeInTheDocument();
  });
});
