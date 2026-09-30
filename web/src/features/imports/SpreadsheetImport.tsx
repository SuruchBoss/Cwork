// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, PageHeader } from '@/components/ui';
import { api, saveBlob } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useT } from '@/lib/i18n/useT';
import { useUiStore } from '@/stores/ui.store';
import { describeProblem, type ImportProblem } from './import-problems';

type Step<P, R> =
  | { name: 'choose' }
  | { name: 'checking'; file: File }
  | { name: 'checked'; file: File; preview: P }
  | { name: 'importing'; file: File; preview: P }
  | { name: 'done'; result: R };

export interface SpreadsheetImportProps<P extends { problems: ImportProblem[] }, R> {
  title: string;
  description: string;
  back: { to: string; label: string };
  /** The API's three routes for this import: template, preview, commit. */
  paths: { template: string; preview: string; commit: string };
  /** What the template holds, above its download buttons. */
  templateNote: string;
  /** How many records the file would write. */
  count: (preview: P) => number;
  /** What the clean file would do, above the table of it. */
  readyNote: (preview: P) => string;
  renderReady: (preview: P) => ReactNode;
  importLabel: (count: number) => string;
  done: (result: R, again: () => void) => ReactNode;
  /** Queries the import makes stale. */
  invalidate: QueryKey[];
}

/**
 * One spreadsheet import, start to finish (CW-059): download the template,
 * upload the file, see every problem by row and column or everything it would
 * write, then write it all in one step. The API checks the file again on the
 * way in, so a file that was clean a minute ago but is not now is shown with
 * what is wrong now.
 */
export function SpreadsheetImport<P extends { problems: ImportProblem[] }, R>(
  props: SpreadsheetImportProps<P, R>,
) {
  const t = useT();
  const language = useUiStore((s) => s.language);
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step<P, R>>({ name: 'choose' });
  const [error, setError] = useState<string | null>(null);

  const reason = (caught: unknown) =>
    caught instanceof ApiError ? caught.message : t('Something went wrong');

  const form = (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return body;
  };

  async function downloadTemplate(lang: 'th' | 'en') {
    setError(null);
    try {
      const { blob, filename } = await api.download(props.paths.template, { query: { lang } });
      saveBlob(blob, filename);
    } catch (caught) {
      setError(reason(caught));
    }
  }

  async function check(file: File) {
    setError(null);
    setStep({ name: 'checking', file });
    try {
      const preview = await api.post<P>(props.paths.preview, form(file));
      setStep({ name: 'checked', file, preview });
    } catch (caught) {
      setStep({ name: 'choose' });
      setError(reason(caught));
    }
  }

  async function commit(file: File, preview: P) {
    setError(null);
    setStep({ name: 'importing', file, preview });
    try {
      const result = await api.post<R>(props.paths.commit, form(file));
      await Promise.all(
        props.invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      setStep({ name: 'done', result });
    } catch (caught) {
      const problems =
        caught instanceof ApiError
          ? (caught.details as { problems?: ImportProblem[] } | undefined)?.problems
          : undefined;
      setStep({ name: 'checked', file, preview: problems ? { ...preview, problems } : preview });
      if (!problems) setError(reason(caught));
    }
  }

  function again() {
    setError(null);
    setStep({ name: 'choose' });
    if (input.current) input.current.value = '';
  }

  const preview = step.name === 'checked' || step.name === 'importing' ? step.preview : null;
  const busy = step.name === 'checking' || step.name === 'importing';

  return (
    <div className="page">
      <PageHeader
        title={props.title}
        description={props.description}
        actions={
          <Link to={props.back.to} className="btn btn--secondary">
            {props.back.label}
          </Link>
        }
      />

      {error && (
        <div className="alert alert--danger" role="alert">
          {error}
        </div>
      )}

      {step.name === 'done' ? (
        <Card>
          <div className="stack" role="status">
            {props.done(step.result, again)}
          </div>
        </Card>
      ) : (
        <>
          <Card title={t('1. Download the template')}>
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>
                {props.templateNote}
              </p>
              <div className="row">
                <Button
                  variant={language === 'th' ? 'primary' : 'secondary'}
                  onClick={() => void downloadTemplate('th')}
                >
                  {t('Template in Thai')}
                </Button>
                <Button
                  variant={language === 'en' ? 'primary' : 'secondary'}
                  onClick={() => void downloadTemplate('en')}
                >
                  {t('Template in English')}
                </Button>
              </div>
            </div>
          </Card>

          <Card title={t('2. Upload the file')}>
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>
                {t(
                  'Save it as .xlsx or CSV, either from Thai Excel is fine. It is checked first; nothing is saved yet.',
                )}
              </p>
              <label className="btn btn--secondary file-button">
                {step.name === 'checking' ? t('Checking…') : t('Choose a file')}
                <input
                  ref={input}
                  type="file"
                  accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="visually-hidden"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void check(file);
                  }}
                />
              </label>
              {'file' in step && (
                <p className="subtle" style={{ margin: 0 }}>
                  {step.file.name}
                </p>
              )}
            </div>
          </Card>

          {preview && preview.problems.length > 0 && (
            <Card title={t('3. Fix these in the file')} flush>
              <div className="stack" style={{ padding: '12px 16px 0' }}>
                <p className="muted" style={{ margin: 0 }} role="status">
                  {t(
                    '{count} problems. Nothing has been imported: fix them in the file and upload it again.',
                    { count: preview.problems.length },
                  )}
                </p>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('Row')}</th>
                      <th>{t('Column')}</th>
                      <th>{t('Problem')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.problems.map((problem, i) => (
                      <tr key={i}>
                        <td className="mono">{problem.row > 0 ? problem.row : t('File')}</td>
                        <td>
                          {problem.column ? (
                            <>
                              <span className="mono">{problem.column}</span>{' '}
                              {problem.header && <span className="subtle">{problem.header}</span>}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{describeProblem(problem, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {preview && preview.problems.length === 0 && (
            <Card
              title={t('3. Import')}
              actions={
                <Button
                  variant="primary"
                  loading={step.name === 'importing'}
                  onClick={() => step.name === 'checked' && void commit(step.file, step.preview)}
                >
                  {props.importLabel(props.count(preview))}
                </Button>
              }
              flush
            >
              <div className="stack" style={{ padding: '12px 16px 0' }}>
                <p className="muted" style={{ margin: 0 }} role="status">
                  {props.readyNote(preview)}
                </p>
              </div>
              {props.renderReady(preview)}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
