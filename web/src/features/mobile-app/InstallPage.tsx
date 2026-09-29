// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { env } from '@/lib/env';
import { useT } from '@/lib/i18n/useT';
import { useUiStore } from '@/stores/ui.store';
import { androidApkUrl, APP_VERSION, currentInstallLinks, RELEASES_URL } from './install';

/**
 * The page HR's QR code opens on an employee's phone (CW-060).
 *
 * Public, because the person reading it has no account on their phone yet, and
 * it shows nothing a stranger could use: the app is published for anyone, and
 * the server's address is the one already in the address bar.
 *
 * Three steps, in the order they happen: install, connect, sign in.
 */
export default function InstallPage() {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);
  const links = currentInstallLinks(env.apiBaseUrl);
  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);

  return (
    <main className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <span className="sidebar__logo" aria-hidden>
            CW
          </span>
          <div>
            <h1 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>
              {t('Install the {name} app', { name: env.appName })}
            </h1>
            <div className="subtle">{links.typedAddress}</div>
          </div>
        </div>

        {!links.secure && (
          <div className="alert alert--warning" role="alert" style={{ marginBottom: 16 }}>
            {t(
              'This page was opened over HTTP. The app connects only over HTTPS, so it cannot connect to this address. Tell HR.',
            )}
          </div>
        )}
        {iphone && (
          <div className="alert alert--info" role="status" style={{ marginBottom: 16 }}>
            {t('The app is not available for iPhone yet. Ask HR how to clock in in the meantime.')}
          </div>
        )}

        <ol className="install__steps">
          <li>
            <h2>{t('Install the app')}</h2>
            <a className="btn btn--primary" href={androidApkUrl()}>
              {t('Download for Android')}
            </a>
            <p className="subtle">
              {t(
                'Version {version}. Android asks once to allow installs from your browser: allow it, then open the downloaded file.',
                { version: APP_VERSION },
              )}
            </p>
          </li>
          <li>
            <h2>{t('Connect it to your company')}</h2>
            <a className="btn btn--secondary" href={links.connectLink}>
              {t('Open the app')}
            </a>
            <p className="subtle">
              {t('The app shows the company it will connect to and asks you first.')}
            </p>
            <p>
              {t('Or scan the QR code again in the app, or type:')}{' '}
              <code className="mono">{links.typedAddress}</code>
            </p>
          </li>
          <li>
            <h2>{t('Sign in')}</h2>
            <p>{t('Use your employee account. If you do not know the password, ask HR.')}</p>
          </li>
        </ol>

        <div className="auth__hint row row--between">
          <a href={RELEASES_URL} target="_blank" rel="noreferrer">
            {t('All versions')}
          </a>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
            lang={language === 'th' ? 'en' : 'th'}
          >
            {language === 'th' ? 'English' : 'ไทย'}
          </button>
        </div>
      </div>
    </main>
  );
}
