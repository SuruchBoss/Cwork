// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMemo, useRef, useState } from 'react';
import { Button, Card, Field, PageHeader, Textarea } from '@/components/ui';
import { saveBlob } from '@/lib/api-client';
import { lastRoute, recentFailures } from '@/lib/failure-log';
import { useT } from '@/lib/i18n/useT';
import { useUiStore } from '@/stores/ui.store';
import { buildProblemReport, diagnosticsBlock, reportFilename } from './problem-report';

/**
 * "Report a problem" (CW-087). The person says what happened; Cwork attaches
 * what it can tell without personal data (the console's version, the screen,
 * the requests that just failed and why) and builds one text to copy or save.
 * They send it themselves, by LINE or email.
 *
 * Nothing here talks to a server. There is no send button, no request is made
 * on this page, and the text lives only in the browser until the person copies
 * it. Where to send it is not decided yet, and the page says so rather than
 * guess.
 */
export default function ReportProblemPage() {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const [description, setDescription] = useState('');
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  // When the page was opened: the failures and the time are those of the moment
  // the problem was fresh, not of whenever the person finishes typing.
  const opened = useRef({ at: new Date(), failures: recentFailures(), page: lastRoute() });

  const attached = useMemo(
    () => ({
      failures: opened.current.failures,
      page: opened.current.page,
      consoleVersion: __APP_VERSION__,
      userAgent: navigator.userAgent,
      language,
      now: opened.current.at,
    }),
    [language],
  );
  const written = description.trim().length > 0;
  const report = buildProblemReport({ description, ...attached });

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopy('copied');
    } catch {
      // No clipboard outside HTTPS, or the browser said no. The text is on the
      // page, in a box, to select by hand; saving it as a file also works.
      setCopy('failed');
    }
  }

  function saveReport() {
    saveBlob(
      new Blob([report], { type: 'text/plain;charset=utf-8' }),
      reportFilename(opened.current.at),
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t('Report a problem')}
        description={t('Describe what happened, then copy the report and send it yourself')}
      />

      <div className="alert alert--info" role="note">
        {t(
          'Cwork does not send this report anywhere. You copy it or save it, and send it yourself, for example by LINE or email.',
        )}
      </div>

      <Card title={t('What happened?')}>
        <Field
          label={t('Describe the problem')}
          hint={t(
            'What you were doing and what you saw. Please do not write names, ID numbers or salaries; what you write is sent exactly as it is.',
          )}
        >
          <Textarea
            rows={6}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setCopy('idle');
            }}
          />
        </Field>
      </Card>

      <Card title={t('What Cwork attaches')}>
        <p className="subtle" style={{ marginTop: 0 }}>
          {t(
            'The console version, the screen you were on, the time, your browser and the requests that failed, each with its error code. No names, ID numbers, salaries or other personal data.',
          )}
        </p>
        <pre
          tabIndex={0}
          aria-label={t('What Cwork attaches')}
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 13 }}
        >
          {diagnosticsBlock(attached)}
        </pre>
      </Card>

      <Card title={t('Send it')}>
        <div className="row">
          <Button variant="primary" disabled={!written} onClick={copyReport}>
            {t('Copy report')}
          </Button>
          <Button variant="secondary" disabled={!written} onClick={saveReport}>
            {t('Save as a file')}
          </Button>
        </div>
        {!written && (
          <p className="subtle">{t('Write what happened first, then copy or save the report.')}</p>
        )}
        {copy === 'copied' && (
          <div className="alert alert--success" role="status">
            {t('Copied. Paste it into your message.')}
          </div>
        )}
        {copy === 'failed' && (
          <div className="alert alert--warning" role="alert">
            {t('This browser would not copy it. Save it as a file, or select the text below.')}
          </div>
        )}
        {copy === 'failed' && (
          <Textarea readOnly rows={10} value={report} aria-label={t('The report')} />
        )}
        <p className="subtle">
          {t('Where to send it: {channel}', { channel: t('not decided yet') })}
        </p>
      </Card>
    </div>
  );
}
