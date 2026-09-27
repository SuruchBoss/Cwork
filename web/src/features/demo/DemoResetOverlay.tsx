// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/useT';
import { usePlatformConfig } from '@/lib/platform';
import { useAuthStore } from '@/stores/auth.store';
import { useDemoStatus, type DemoStatus } from './demo';

const POLL_MS = 3_000;

/**
 * What a visitor sees while the public demo puts its data back (CW-031): one
 * message over the whole screen, rather than every panel failing on its own.
 *
 * Shown when any request comes back 503 `DEMO_RESETTING`, or when the status
 * says so. It asks again every few seconds; once the demo is back, the visitor
 * is signed straight back in as the role they had — the reset removed every
 * session along with everything else — and lands on the dashboard.
 */
export function DemoResetOverlay({ onDone }: { onDone: (to: string) => void }) {
  const { demo } = usePlatformConfig();
  const queryClient = useQueryClient();
  const t = useT();
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    api.onDemoReset(() => setResetting(true));
    return () => api.onDemoReset(() => {});
  }, []);

  // A visitor who arrives mid-reset has made no request to be refused yet.
  const status = useDemoStatus();
  const arrivedMidReset = status?.resetting === true;
  useEffect(() => {
    if (arrivedMidReset) setResetting(true);
  }, [arrivedMidReset]);

  useEffect(() => {
    if (!demo || !resetting) return;

    let cancelled = false;
    const poll = async (): Promise<void> => {
      while (!cancelled) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        try {
          const status = await api.get<DemoStatus>('/demo', { anonymous: true });
          if (!status.resetting) break;
        } catch {
          // Still coming back. Keep asking.
        }
      }
      if (cancelled) return;

      const { demoRole, demoSignIn } = useAuthStore.getState();
      useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
      queryClient.clear();
      let to = '/login';
      if (demoRole) {
        try {
          await demoSignIn(demoRole);
          to = '/';
        } catch {
          // The sign-in page will offer the choice again.
        }
      }
      setResetting(false);
      onDone(to);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [demo, resetting, queryClient, onDone]);

  if (!demo || !resetting) return null;

  return (
    <div
      className="demo-reset"
      role="alertdialog"
      aria-live="assertive"
      aria-labelledby="demo-reset-title"
    >
      <div className="demo-reset__card">
        <span className="spinner" aria-hidden />
        <h2 id="demo-reset-title">{t('The demo is going back to the start')}</h2>
        <p className="muted">
          {t(
            'Everything visitors changed in the last hour is being put back. It takes under a minute, and you will be signed back in.',
          )}
        </p>
      </div>
    </div>
  );
}
