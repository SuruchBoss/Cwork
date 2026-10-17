// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { qk } from '@/app/query-client';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Stat } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatMoney, formatNumber, formatPeriod } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type { PayrollPeriod } from '@/types/api';
import { describeProblem } from '../imports/import-problems';
import type {
  FigureKey,
  ParallelRunReport,
  PeriodComparison,
  TotalCheck,
} from './period-check-types';

/** Baht the way the API takes it: digits and at most two decimals. */
const BAHT = /^\d{1,12}(\.\d{1,2})?$/;

/** What e-Filing and Excel show ("1,250.00", spaces) becomes what the API takes. */
const tidy = (typed: string) => typed.replace(/[,\s]/g, '');

const FIGURE_ORDER: FigureKey[] = ['gross', 'tax', 'sso', 'net'];

/** A signed difference in baht, "+0.01" or "−12.50", never a bare number. */
function signed(difference: string): string {
  const value = Number(difference);
  const text = formatMoney(Math.abs(value));
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

function TotalRow({ label, check, note }: { label: string; check: TotalCheck; note?: string }) {
  const t = useT();
  return (
    <tr>
      <td>
        {label}
        {note && <div className="subtle">{note}</div>}
      </td>
      <td className="num">{formatMoney(Number(check.cwork))}</td>
      <td className="num">{formatMoney(Number(check.filed))}</td>
      <td className="num">{signed(check.difference)}</td>
      <td>
        <Badge tone={check.matches ? 'success' : 'danger'}>
          {check.matches ? t('Same') : t('Different')}
        </Badge>
      </td>
    </tr>
  );
}

/**
 * Checking a period against what was filed (CW-089). HR types the totals the
 * outside filings produced, or uploads HR's own figures person by person, and
 * Cwork shows its own beside them, to the satang. Nothing here is saved and
 * nothing changes a payslip.
 */
export default function PeriodCheckPage() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [periodId, setPeriodId] = useState('');
  const [tax, setTax] = useState('');
  const [sso, setSso] = useState('');
  const [onlyDiffering, setOnlyDiffering] = useState(true);

  const periods = useQuery({
    queryKey: qk.payrollPeriods(),
    queryFn: () => api.get<PayrollPeriod[]>('/payroll/periods'),
  });
  const chosen = periodId || periods.data?.[0]?.id || '';

  const reason = (caught: unknown) =>
    caught instanceof ApiError ? caught.message : t('Something went wrong');

  const compare = useMutation({
    mutationFn: (body: { taxFiled?: string; ssoFiled?: string }) =>
      api.post<PeriodComparison>(`/payroll/periods/${chosen}/compare`, body),
  });
  const parallel = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.post<ParallelRunReport>(`/payroll/periods/${chosen}/parallel-run`, body);
    },
  });

  const taxText = tidy(tax);
  const ssoText = tidy(sso);
  const taxBad = taxText !== '' && !BAHT.test(taxText);
  const ssoBad = ssoText !== '' && !BAHT.test(ssoText);
  const nothing = taxText === '' && ssoText === '';

  // A result belongs to the period it was worked out for.
  const switchPeriod = (id: string) => {
    setPeriodId(id);
    compare.reset();
    parallel.reset();
    if (input.current) input.current.value = '';
  };

  const result = compare.data;
  const report = parallel.data;
  const figureLabels: Record<FigureKey, string> = {
    gross: t('Gross pay'),
    tax: t('Tax'),
    sso: t('Social security'),
    net: t('Net pay'),
  };
  const shown = report ? report.people.filter((p) => !onlyDiffering || p.differs) : [];

  return (
    <div className="page">
      <PageHeader
        title={t('Check against filings')}
        description={t(
          'Set what the accountant filed, or HR’s own figures, beside what Cwork worked out for the month. Nothing is saved and no payslip changes.',
        )}
        actions={
          <Link to="/payroll" className="btn btn--secondary btn--sm">
            ← {t('Back')}
          </Link>
        }
      />

      <Card>
        <Field label={t('Period')}>
          <Select value={chosen} onChange={(event) => switchPeriod(event.target.value)}>
            {(periods.data ?? []).map((period) => (
              <option key={period.id} value={period.id}>
                {formatPeriod(period.code)}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card title={t('1. The totals that were filed')}>
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            {t(
              'Type the withholding tax total e-Filing produced for the month, and the social security total filed (the employee and employer shares together). Either one is enough. A difference of one satang is shown as a difference.',
            )}
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <Field
              label={t('Withholding tax filed (baht)')}
              error={taxBad ? t('An amount in baht, with at most two decimals') : undefined}
            >
              <Input
                inputMode="decimal"
                value={tax}
                onChange={(event) => setTax(event.target.value)}
              />
            </Field>
            <Field
              label={t('Social security filed (baht)')}
              error={ssoBad ? t('An amount in baht, with at most two decimals') : undefined}
            >
              <Input
                inputMode="decimal"
                value={sso}
                onChange={(event) => setSso(event.target.value)}
              />
            </Field>
          </div>
          <div className="row">
            <Button
              variant="primary"
              disabled={!chosen || nothing || taxBad || ssoBad}
              loading={compare.isPending}
              onClick={() =>
                compare.mutate({
                  ...(taxText !== '' ? { taxFiled: taxText } : {}),
                  ...(ssoText !== '' ? { ssoFiled: ssoText } : {}),
                })
              }
            >
              {t('Compare')}
            </Button>
          </div>
          {compare.isError && (
            <div className="alert alert--danger" role="alert">
              {reason(compare.error)}
            </div>
          )}
          {result && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Total')}</th>
                    <th className="num">{t('Cwork')}</th>
                    <th className="num">{t('Filed')}</th>
                    <th className="num">{t('Difference')}</th>
                    <th>
                      <span className="visually-hidden">{t('Result')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.tax && <TotalRow label={t('Withholding tax')} check={result.tax} />}
                  {result.sso && (
                    <TotalRow
                      label={t('Social security')}
                      check={result.sso}
                      note={t('Employee {employee} + employer {employer}', {
                        employee: formatMoney(Number(result.sso.employee)),
                        employer: formatMoney(Number(result.sso.employer)),
                      })}
                    />
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card title={t('2. HR’s own figures, person by person')}>
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            {t(
              'A spreadsheet or CSV with one row for each person: employee code, gross pay, tax, social security (the employee’s share) and net pay, all filled in and rounded to the satang. Other columns are ignored. Cwork marks every person and column that differs.',
            )}
          </p>
          <label className="btn btn--secondary file-button">
            {parallel.isPending ? t('Checking…') : t('Choose a file')}
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv,.txt"
              className="visually-hidden"
              disabled={!chosen || parallel.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) parallel.mutate(file);
              }}
            />
          </label>
          {parallel.isError && (
            <div className="alert alert--danger" role="alert">
              {reason(parallel.error)}
            </div>
          )}
        </div>
      </Card>

      {report && report.problems.length > 0 && (
        <Card title={t('Fix these in the file')} flush>
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
                {report.problems.map((problem, i) => (
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

      {report && report.problems.length === 0 && (
        <>
          <div className="grid grid--4">
            <Stat label={t('People compared')} value={formatNumber(report.totals.people)} />
            <Stat
              label={t('People who differ')}
              value={formatNumber(report.totals.differing)}
              hint={report.totals.differing === 0 ? t('Every figure matches') : undefined}
            />
            <Stat label={t('Only in your file')} value={formatNumber(report.totals.onlyInFile)} />
            <Stat label={t('Only in Cwork')} value={formatNumber(report.totals.onlyInCwork)} />
          </div>

          <Card
            title={t('Person by person')}
            actions={
              <Button size="sm" onClick={() => setOnlyDiffering(!onlyDiffering)}>
                {onlyDiffering ? t('Show everyone') : t('Show only those who differ')}
              </Button>
            }
            flush
          >
            {shown.length === 0 ? (
              <p className="muted" style={{ padding: 16, margin: 0 }}>
                {t('Nobody differs.')}
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('Employee')}</th>
                      {FIGURE_ORDER.map((key) => (
                        <th key={key} className="num">
                          {figureLabels[key]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((person) => (
                      <tr key={person.employeeCode}>
                        <td>
                          {person.name}
                          <div className="subtle mono">{person.employeeCode}</div>
                        </td>
                        {FIGURE_ORDER.map((key) => {
                          const figure = person.figures[key];
                          return (
                            <td key={key} className="num">
                              {figure.differs ? (
                                <>
                                  <Badge tone="danger">{signed(figure.difference)}</Badge>
                                  <div className="subtle">
                                    {t('Cwork {cwork} · yours {theirs}', {
                                      cwork: formatMoney(Number(figure.cwork)),
                                      theirs: formatMoney(Number(figure.theirs)),
                                    })}
                                  </div>
                                </>
                              ) : (
                                formatMoney(Number(figure.cwork))
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {report.onlyInFile.length > 0 && (
            <Card title={t('Only in your file')}>
              <p className="muted" style={{ margin: 0 }}>
                {t('Cwork has no payslip for these people in this period:')}{' '}
                {report.onlyInFile.map((p) => p.employeeCode).join(', ')}
              </p>
            </Card>
          )}
          {report.onlyInCwork.length > 0 && (
            <Card title={t('Only in Cwork')}>
              <p className="muted" style={{ margin: 0 }}>
                {t('Your file leaves these people out:')}{' '}
                {report.onlyInCwork.map((p) => `${p.name} (${p.employeeCode})`).join(', ')}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
