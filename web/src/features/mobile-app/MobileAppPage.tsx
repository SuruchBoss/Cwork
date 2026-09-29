// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Button, Card, PageHeader } from '@/components/ui';
import { env } from '@/lib/env';
import { useT } from '@/lib/i18n/useT';
import { APP_VERSION, currentInstallLinks } from './install';
import { useQrCode } from './useQrCode';

/**
 * What HR hands employees so they can install the app (CW-060): one QR code,
 * or the link it holds, for a poster, a chat group or the screen at the desk.
 *
 * Nothing here is secret. The code holds this server's public address, which
 * every employee needs anyway, and the page behind it holds no data.
 */
export default function MobileAppPage() {
  const t = useT();
  const links = currentInstallLinks(env.apiBaseUrl);
  const qr = useQrCode(links.installPageUrl, 240);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(links.installPageUrl);
      setCopy('copied');
    } catch {
      // No clipboard outside HTTPS, or the browser said no. The link is on the
      // page to select by hand.
      setCopy('failed');
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('Mobile app')}
        description={t('How employees install the app and connect it to this company')}
        actions={<Button onClick={() => window.print()}>{t('Print')}</Button>}
      />

      {!links.secure && (
        <div className="alert alert--warning" role="alert">
          {t(
            'This console is open over HTTP. The app connects only over HTTPS, so employees cannot connect it to this address. Serve Cwork over HTTPS and open the console at its https:// address.',
          )}
        </div>
      )}

      <div className="mobile-app">
        <Card title={t('Show employees this QR code')}>
          <div className="mobile-app__qr">
            {qr ? (
              <img
                src={qr}
                width={240}
                height={240}
                alt={t('QR code for {url}', { url: links.installPageUrl })}
              />
            ) : (
              <span className="spinner" aria-hidden />
            )}
            <code className="mono mobile-app__url">{links.installPageUrl}</code>
            <div className="row no-print" style={{ justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => void copyLink()}>
                {copy === 'copied' ? t('Copied') : t('Copy link')}
              </Button>
              <a
                className="btn btn--secondary"
                href={links.installPageUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('Open the install page')}
              </a>
            </div>
            {copy === 'failed' && (
              <p className="subtle" role="status">
                {t('Could not copy. Select the link above and copy it.')}
              </p>
            )}
          </div>
        </Card>

        <Card title={t('What employees do')}>
          <ol className="steps">
            <li>
              {t(
                'Scan the code with the phone camera, or open the link. It opens the install page on this server.',
              )}
            </li>
            <li>
              {t(
                'Download and install the app. Android asks once to allow installs from the browser.',
              )}
            </li>
            <li>
              {t('Open the app and scan the same code, or type {address}.', {
                address: links.typedAddress,
              })}
            </li>
            <li>{t('Sign in with their employee account.')}</li>
          </ol>
          <div className="stack stack--sm" style={{ marginTop: 16 }}>
            <p className="subtle">
              {t('Android only for now. The app is not available for iPhone yet.')}
            </p>
            <p className="subtle">
              {t('App version {version}, from the same release as this server.', {
                version: APP_VERSION,
              })}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
