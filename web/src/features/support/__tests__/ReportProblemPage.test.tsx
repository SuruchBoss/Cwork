// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from '@/lib/api-client';
import {
  clearFailures,
  describeFailure,
  noteRoute,
  recordFailure,
  resetRoute,
} from '@/lib/failure-log';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import ReportProblemPage from '../ReportProblemPage';

vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  saveBlob: vi.fn(),
}));

const PERSON = {
  name: 'สมศักดิ์ ธนาวงศ์',
  code: 'EMP-0001',
  email: 'ceo@cwork.example',
  salary: '250000',
  nationalId: '1101700230705',
};

/** jsdom's Blob has no reliable text(); read it the way a browser would. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('the Report a problem page (CW-087)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useUiStore.setState({ language: 'en' });
    clearFailures();
    resetRoute();
    noteRoute(`/employees/${PERSON.code}/leave`);
    recordFailure(
      describeFailure(
        {
          method: 'POST',
          path: `/employees/${PERSON.code}/roles`,
          query: { search: PERSON.name },
          status: 403,
          code: 'ROLE_ABOVE_YOUR_OWN',
          requestId: 'req-8f3a2c1d-0b7e',
        },
        new Date('2026-10-16T04:00:00Z'),
      ),
    );
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows what Cwork attaches before anything is written, and none of it is personal', async () => {
    renderWithProviders(<ReportProblemPage />);

    const attached = screen.getByLabelText('What Cwork attaches', { selector: 'pre' });
    expect(attached).toHaveTextContent('Screen: /employees/:id/leave');
    expect(attached).toHaveTextContent(
      'POST /employees/:id/roles ?search -> 403 ROLE_ABOVE_YOUR_OWN (request req-8f3a2c1d-0b7e)',
    );
    for (const secret of Object.values(PERSON)) expect(attached.textContent).not.toContain(secret);
  });

  it('keeps copy and save off until something is written', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportProblemPage />);

    expect(screen.getByRole('button', { name: 'Copy report' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as a file' })).toBeDisabled();

    await user.type(screen.getByLabelText('Describe the problem'), 'The page went blank');
    expect(screen.getByRole('button', { name: 'Copy report' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save as a file' })).toBeEnabled();
  });

  it('copies what the person wrote, exactly, above what Cwork attached', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportProblemPage />);

    await user.type(screen.getByLabelText('Describe the problem'), 'Saving a role gives an error');
    await user.click(screen.getByRole('button', { name: 'Copy report' }));

    expect(await screen.findByText('Copied. Paste it into your message.')).toBeInTheDocument();
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain(
      'What happened (written by the person reporting):\nSaving a role gives an error',
    );
    expect(copied.indexOf('Saving a role gives an error')).toBeLessThan(
      copied.indexOf('Attached by Cwork'),
    );
    expect(copied).toContain('ROLE_ABOVE_YOUR_OWN');
    for (const secret of Object.values(PERSON)) expect(copied).not.toContain(secret);
  });

  it('saves the same text as a file', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportProblemPage />);

    await user.type(screen.getByLabelText('Describe the problem'), 'Export is empty');
    await user.click(screen.getByRole('button', { name: 'Save as a file' }));

    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = vi.mocked(saveBlob).mock.calls[0]!;
    expect(filename).toMatch(/^cwork-problem-report-\d{8}-\d{4}\.txt$/);
    const text = await readBlob(blob);
    expect(text).toContain('Export is empty');
    expect(text).toContain('Console version:');
  });

  it('says so and offers the text to select when the browser will not copy', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportProblemPage />);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));

    await user.type(screen.getByLabelText('Describe the problem'), 'Cannot copy');
    await user.click(screen.getByRole('button', { name: 'Copy report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This browser would not copy it');
    expect((screen.getByLabelText('The report') as HTMLTextAreaElement).value).toContain(
      'Cannot copy',
    );
  });

  it('sends nothing: no request is made, and there is no send button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportProblemPage />);

    await user.type(screen.getByLabelText('Describe the problem'), 'Anything');
    await user.click(screen.getByRole('button', { name: 'Copy report' }));
    await user.click(screen.getByRole('button', { name: 'Save as a file' }));

    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /send|submit/i })).toBeNull();
    expect(document.querySelector('form')).toBeNull();
    expect(screen.getByText(/Cwork does not send this report anywhere/)).toBeInTheDocument();
  });

  it('does not guess where to send it', () => {
    renderWithProviders(<ReportProblemPage />);

    expect(screen.getByText('Where to send it: not decided yet')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /line\.me|@line|mailto:|@[a-z0-9-]+\.(com|co\.th)/i,
    );
  });

  it('is in Thai too', () => {
    useUiStore.setState({ language: 'th' });
    renderWithProviders(<ReportProblemPage />);

    expect(screen.getByRole('heading', { name: 'แจ้งปัญหา' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'คัดลอกรายงาน' })).toBeInTheDocument();
    expect(screen.getByText('ส่งไปที่: ยังไม่กำหนด')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<ReportProblemPage />);
    await expectNoAxeViolations(container);
  });
});
