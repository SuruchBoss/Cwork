// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { qk } from '@/app/query-client';
import { Button, Card, ErrorState, PageHeader, Stat } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { plural } from '@/lib/i18n';
import { useT } from '@/lib/i18n/useT';
import { describeProblem, type ImportProblem } from '../imports/import-problems';
import { ScannerStatusBadge, UnmappedTable } from './ScannerParts';
import type {
  ScannerCommitResult,
  ScannerDayStatus,
  ScannerImportRow,
  ScannerPreview,
} from './scanner-types';

type Step =
  | { name: 'choose' }
  | { name: 'checking'; file: File }
  | { name: 'checked'; file: File; preview: ScannerPreview }
  | { name: 'importing'; file: File; preview: ScannerPreview }
  | { name: 'done'; result: ScannerCommitResult };

const STATUS_ORDER: ScannerDayStatus[] = [
  'COUNTED',
  'WAITING',
  'NO_PUNCH',
  'UNMAPPED',
  'DECIDED_USE',
  'DECIDED_IGNORE',
];

function formFor(file: File) {
  const body = new FormData();
  body.append('file', file);
  return body;
}

/**
 * Bringing in the export of a fingerprint scanner (CW-061): choose the file,
 * see what each day of it is and which scanner numbers nobody has registered,
 * then import. Nothing is written until the last step, and importing a file
 * that overlaps an earlier one adds only what is new.
 */
export default function ScannerImportPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ name: 'choose' });
  const [error, setError] = useState<string | null>(null);

  const history = useQuery({
    queryKey: qk.scannerImports,
    queryFn: () => api.get<ScannerImportRow[]>('/attendance/scanner/imports'),
  });

  const reason = (caught: unknown) =>
    caught instanceof ApiError ? caught.message : t('Something went wrong');

  async function check(file: File) {
    setError(null);
    setStep({ name: 'checking', file });
    try {
      const preview = await api.post<ScannerPreview>('/attendance/scanner/preview', formFor(file));
      setStep({ name: 'checked', file, preview });
    } catch (caught) {
      setStep({ name: 'choose' });
      setError(reason(caught));
    }
  }

  async function commit(file: File, preview: ScannerPreview) {
    setError(null);
    setStep({ name: 'importing', file, preview });
    try {
      const result = await api.post<ScannerCommitResult>(
        '/attendance/scanner/import',
        formFor(file),
      );
      await queryClient.invalidateQueries({ queryKey: ['attendance'] });
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
        title={t('Import from the fingerprint scanner')}
        description={t(
          'The scanner’s export for one month, kept exactly as the scanner wrote it, with the punches that can be counted added to attendance',
        )}
        actions={
          <Link to="/attendance/scanner" className="btn btn--secondary">
            {t('Review scanner days')}
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
            <p style={{ margin: 0, fontWeight: 600 }}>
              {t(
                plural(
                  step.result.punchesAdded,
                  'Imported {file}: {count} punch added to attendance',
                  'Imported {file}: {count} punches added to attendance',
                ),
                { file: step.result.fileName, count: formatNumber(step.result.punchesAdded) },
              )}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {t(
                'Days from {from} to {to}: {added} new, {changed} with new times, {same} as before',
                {
                  from: formatDate(step.result.dateFrom),
                  to: formatDate(step.result.dateTo),
                  added: formatNumber(step.result.days.added),
                  changed: formatNumber(step.result.days.changed),
                  same: formatNumber(step.result.days.unchanged),
                },
              )}
            </p>
            {step.result.lockedDays > 0 && (
              <p className="muted" style={{ margin: 0 }}>
                {t(
                  plural(
                    step.result.lockedDays,
                    '{count} day was left as it was because payroll has already used it',
                    '{count} days were left as they were because payroll has already used them',
                  ),
                  { count: formatNumber(step.result.lockedDays) },
                )}
              </p>
            )}
            {step.result.byStatus.WAITING > 0 && (
              <div className="alert alert--info" role="note">
                {t(
                  plural(
                    step.result.byStatus.WAITING,
                    '{count} day is waiting for HR to decide, and is not counted until then',
                    '{count} days are waiting for HR to decide, and are not counted until then',
                  ),
                  { count: formatNumber(step.result.byStatus.WAITING) },
                )}
              </div>
            )}
            {step.result.unmapped.length > 0 && (
              <div className="alert alert--info" role="note">
                {t(
                  plural(
                    step.result.unmapped.length,
                    '{count} scanner number belongs to nobody yet; match it on the review page',
                    '{count} scanner numbers belong to nobody yet; match them on the review page',
                  ),
                  { count: formatNumber(step.result.unmapped.length) },
                )}
              </div>
            )}
            <div className="row">
              <Link to="/attendance/scanner" className="btn btn--primary">
                {t('Review scanner days')}
              </Link>
              <Button onClick={again}>{t('Import another file')}</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card title={t('1. Choose the scanner’s file')}>
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>
                {t(
                  'Use the file the scanner wrote, as it is: do not open it in Excel and save it again. It may be called .xls. It is checked first; nothing is saved yet. Fingerprints are never part of the file and are never kept.',
                )}
              </p>
              <label className="btn btn--secondary file-button">
                {step.name === 'checking' ? t('Checking…') : t('Choose a file')}
                <input
                  ref={input}
                  type="file"
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
            <Card title={t('2. Fix these in the file')} flush>
              <div className="stack" style={{ padding: '12px 16px' }}>
                <p className="muted" style={{ margin: 0 }} role="status">
                  {t(
                    plural(
                      preview.problems.length,
                      '{count} problem. Nothing has been imported: fix it in the file and upload it again.',
                      '{count} problems. Nothing has been imported: fix them in the file and upload it again.',
                    ),
                    { count: preview.problems.length },
                  )}
                </p>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('Line')}</th>
                      <th>{t('Problem')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.problems.map((problem, i) => (
                      <tr key={i}>
                        <td className="mono">{problem.row > 0 ? problem.row : t('File')}</td>
                        <td>{describeProblem(problem, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {preview && preview.problems.length === 0 && (
            <>
              <Card
                title={t('2. What this file holds')}
                actions={
                  <Button
                    variant="primary"
                    loading={step.name === 'importing'}
                    onClick={() => step.name === 'checked' && void commit(step.file, step.preview)}
                  >
                    {t('Import this file')}
                  </Button>
                }
              >
                <div className="stack">
                  <p className="muted" style={{ margin: 0 }} role="status">
                    {t(
                      plural(
                        preview.lines,
                        'The file is clean. {lines} line, from {from} to {to}.',
                        'The file is clean. {lines} lines, from {from} to {to}.',
                      ),
                      {
                        lines: formatNumber(preview.lines),
                        from: formatDate(preview.dateFrom),
                        to: formatDate(preview.dateTo),
                      },
                    )}
                  </p>
                  <div className="grid grid--4">
                    <Stat label={t('New days')} value={formatNumber(preview.days.added)} />
                    <Stat
                      label={t('Days with new times')}
                      value={formatNumber(preview.days.changed)}
                    />
                    <Stat
                      label={t('Days already as they are')}
                      value={formatNumber(preview.days.unchanged)}
                    />
                    <Stat
                      label={t('Punches to add')}
                      value={formatNumber(preview.punchesToAdd)}
                      hint={t('Only punches not already in attendance')}
                    />
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
                    {STATUS_ORDER.filter((status) => preview.byStatus[status] > 0).map((status) => (
                      <span key={status}>
                        <ScannerStatusBadge status={status} />{' '}
                        <span className="mono">{formatNumber(preview.byStatus[status])}</span>
                      </span>
                    ))}
                  </div>
                  {preview.lockedDays > 0 && (
                    <div className="alert alert--info" role="note">
                      {t(
                        plural(
                          preview.lockedDays,
                          '{count} day is in a month payroll has already used; it will be left as it is',
                          '{count} days are in a month payroll has already used; they will be left as they are',
                        ),
                        { count: formatNumber(preview.lockedDays) },
                      )}
                    </div>
                  )}
                  {preview.punchesToAdd === 0 &&
                    preview.days.added + preview.days.changed === 0 && (
                      <div className="alert alert--info" role="note">
                        {t('Nothing in this file is new: every day is already in Cwork.')}
                      </div>
                    )}
                </div>
              </Card>

              {preview.unmapped.length > 0 && (
                <Card title={t('Scanner numbers nobody has registered')} flush>
                  <div className="stack" style={{ padding: '12px 16px' }}>
                    <p className="muted" style={{ margin: 0 }}>
                      {t(
                        'This is not a mistake in the file. Nothing is counted for these numbers until you say whose they are, which you can do after importing; their days stay listed here and on the review page.',
                      )}
                    </p>
                  </div>
                  <UnmappedTable items={preview.unmapped} />
                </Card>
              )}
            </>
          )}

          <Card title={t('Files imported so far')} flush>
            {history.isError ? (
              <ErrorState error={history.error} onRetry={() => void history.refetch()} />
            ) : (history.data?.length ?? 0) === 0 ? (
              <p className="muted" style={{ padding: 16, margin: 0 }}>
                {history.isLoading ? t('Loading…') : t('No file has been imported yet.')}
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('File')}</th>
                      <th>{t('Days covered')}</th>
                      <th>{t('Punches added')}</th>
                      <th>{t('Imported')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data!.map((row) => (
                      <tr key={row.id}>
                        <td>{row.fileName}</td>
                        <td>
                          {formatDate(row.dateFrom)} – {formatDate(row.dateTo)}
                        </td>
                        <td>{formatNumber(row.punchesAdded)}</td>
                        <td>{formatDateTime(row.importedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
