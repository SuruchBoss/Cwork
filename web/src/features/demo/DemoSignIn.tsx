// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/lib/api-error';
import { env } from '@/lib/env';
import { useT } from '@/lib/i18n/useT';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { DEMO_ROLE_COPY, DEMO_ROLES, isDemoRole, useDemoStatus, type DemoRole } from './demo';
import { DemoBanner } from './DemoBanner';

/**
 * The public demo's sign-in page (CW-031): three accounts, one click each.
 *
 * There is no password form, because there is no password anybody knows — the
 * demo's is generated at each reset and never shown. `?as=hr` signs in as HR
 * straight away, which is what the landing page's "Try it now" opens;
 * `?lang=en` picks the console's language on the way in.
 */
export function DemoSignIn() {
  const demoSignIn = useAuthStore((s) => s.demoSignIn);
  const setLanguage = useUiStore((s) => s.setLanguage);
  const status = useDemoStatus();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const t = useT();

  const [pending, setPending] = useState<DemoRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const signIn = async (role: DemoRole): Promise<void> => {
    setError(null);
    setPending(role);
    try {
      await demoSignIn(role);
      navigate('/', { replace: true });
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : t('Could not sign in, please try again'),
      );
      setPending(null);
    }
  };

  const lang = params.get('lang');
  useEffect(() => {
    if (lang === 'th' || lang === 'en') setLanguage(lang);
  }, [lang, setLanguage]);

  // The deep link waits for the status, so a visitor who lands mid-reset is
  // signed in once the reset is over rather than refused during it.
  const as = params.get('as');
  useEffect(() => {
    if (started.current || !isDemoRole(as) || !status || status.resetting) return;
    started.current = true;
    void signIn(as);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [as, status]);

  return (
    <main className="auth auth--demo">
      <div className="auth__card auth__card--wide">
        <div className="auth__brand">
          <span className="sidebar__logo" aria-hidden>
            CW
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {t('Try {app}', { app: env.appName })}
            </div>
            <div className="subtle">
              {t(
                'Choose who to be. No password, no sign-up — every account is shared and fictional.',
              )}
            </div>
          </div>
        </div>

        <div className="demo-roles">
          {DEMO_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              className="demo-role"
              disabled={pending !== null}
              aria-busy={pending === role}
              onClick={() => void signIn(role)}
            >
              <span className="demo-role__title">
                {pending === role ? `${t('Signing in')}…` : t(DEMO_ROLE_COPY[role].title)}
              </span>
              <span className="demo-role__what">{t(DEMO_ROLE_COPY[role].what)}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="alert alert--danger" role="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        <div className="auth__hint">
          <DemoBanner />
        </div>
      </div>
    </main>
  );
}
