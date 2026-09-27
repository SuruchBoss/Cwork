// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '@/lib/i18n/useT';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import {
  DEMO_ROLE_COPY,
  DEMO_ROLES,
  minutesUntil,
  useDemoStatus,
  walkthroughUrl,
  type DemoRole,
} from './demo';

/** Re-renders every half minute, so the minutes-left figure keeps moving. */
function useNow(periodMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(timer);
  }, [periodMs]);
  return now;
}

/**
 * The strip across the top of the public demo (CW-031).
 *
 * Says the three things a visitor needs before they type anything: this is a
 * shared demo, what they enter is visible to whoever comes next, and when it
 * all goes back to the start. Inside the console it also switches role in one
 * click — the quickest way from HR's view to the manager's inbox — and points at
 * the walkthrough, since the assistant is off here.
 *
 * Renders nothing on any deployment that is not the demo.
 */
export function DemoBanner({ switcher = false }: { switcher?: boolean }) {
  const status = useDemoStatus();
  const language = useUiStore((s) => s.language);
  const demoRole = useAuthStore((s) => s.demoRole);
  const demoSignIn = useAuthStore((s) => s.demoSignIn);
  const navigate = useNavigate();
  const now = useNow();
  const t = useT();
  const [switching, setSwitching] = useState<DemoRole | null>(null);

  if (!status) return null;

  const at = new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(status.nextResetAt));

  const switchTo = async (role: DemoRole): Promise<void> => {
    setSwitching(role);
    try {
      await demoSignIn(role);
      navigate('/', { replace: true });
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className="demo-banner" role="region" aria-label={t('Demo')}>
      <span className="demo-banner__tag">{t('Demo')}</span>
      <span className="demo-banner__text">
        {t(
          'Everyone trying the demo sees what you enter. It all goes back to the start at {time} (in {minutes} min).',
          {
            time: at,
            minutes: minutesUntil(status.nextResetAt, now),
          },
        )}
      </span>

      {switcher && (
        <span className="demo-banner__roles">
          <span className="subtle">{t('View as')}</span>
          {DEMO_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              className="demo-banner__role"
              aria-pressed={demoRole === role}
              disabled={switching !== null || demoRole === role}
              onClick={() => void switchTo(role)}
            >
              {switching === role ? '…' : t(DEMO_ROLE_COPY[role].title)}
            </button>
          ))}
        </span>
      )}

      <a
        className="demo-banner__link"
        href={walkthroughUrl(language)}
        target="_blank"
        rel="noreferrer"
      >
        {t('The AI assistant is off in the demo — watch the walkthrough')} ▶
      </a>
    </div>
  );
}
