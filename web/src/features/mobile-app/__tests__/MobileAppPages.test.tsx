// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/stores/ui.store';
import { expectNoAxeViolations, renderWithProviders } from '@/test/a11y';
import InstallPage from '../InstallPage';
import MobileAppPage from '../MobileAppPage';

vi.mock('qrcode', () => ({ toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,') }));

/** jsdom serves the page from http://localhost; the pilot serves it over HTTPS. */
function servedFrom(origin: string) {
  vi.spyOn(window, 'location', 'get').mockReturnValue(new URL(`${origin}/app`) as never);
}

function render(page: ReactElement) {
  return renderWithProviders(<MemoryRouter>{page}</MemoryRouter>);
}

describe('the Mobile app page HR hands out (CW-060)', () => {
  beforeEach(() => {
    useUiStore.setState({ language: 'en' });
    servedFrom('https://hr.example.co.th');
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a QR code for the install page, and the link it holds', async () => {
    const { container } = render(<MobileAppPage />);

    expect(
      await screen.findByAltText('QR code for https://hr.example.co.th/app'),
    ).toBeInTheDocument();
    expect(screen.getByText('https://hr.example.co.th/app')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the install page' })).toHaveAttribute(
      'href',
      'https://hr.example.co.th/app',
    );
    expect(screen.getByText(/or type hr\.example\.co\.th\./)).toBeInTheDocument();
    expect(screen.getByText(/not available for iPhone yet/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('copies the link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<MobileAppPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(writeText).toHaveBeenCalledWith('https://hr.example.co.th/app');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('warns that the app cannot connect to a console served over HTTP', () => {
    servedFrom('http://hr.example.co.th');
    render(<MobileAppPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('connects only over HTTPS');
  });
});

describe('the install page an employee opens (CW-060)', () => {
  beforeEach(() => {
    useUiStore.setState({ language: 'en' });
    servedFrom('https://hr.example.co.th');
  });
  afterEach(() => vi.restoreAllMocks());

  it('offers the APK of this release, then the app, then sign-in', async () => {
    const { container } = render(<InstallPage />);

    expect(screen.getByRole('link', { name: 'Download for Android' })).toHaveAttribute(
      'href',
      expect.stringMatching(
        /^https:\/\/github\.com\/SuruchBoss\/Cwork\/releases\/download\/v\d+\.\d+\.\d+\/cwork-android\.apk$/,
      ),
    );
    expect(screen.getByRole('link', { name: 'Open the app' })).toHaveAttribute(
      'href',
      'cwork://connect?server=https%3A%2F%2Fhr.example.co.th%2Fapi%2Fv1',
    );
    expect(screen.getAllByText('hr.example.co.th').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Install the app',
      'Connect it to your company',
      'Sign in',
    ]);
    await expectNoAxeViolations(container);
  });

  it('is in Thai by default', () => {
    useUiStore.setState({ language: 'th' });
    render(<InstallPage />);

    expect(screen.getByRole('link', { name: 'ดาวน์โหลดสำหรับ Android' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เปิดแอป' })).toBeInTheDocument();
  });

  it('tells an iPhone user plainly that there is no app for it yet', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    );
    render(<InstallPage />);

    expect(screen.getByRole('status')).toHaveTextContent('not available for iPhone yet');
  });

  it('warns when it was opened over HTTP, which the app would refuse', async () => {
    servedFrom('http://hr.example.co.th');
    render(<InstallPage />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('connects only over HTTPS'),
    );
  });
});
