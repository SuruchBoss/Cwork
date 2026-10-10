// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Field, Select } from '@/components/ui';
import { formatDate, formatMoney, formatPeriod, formatYear } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type { ImportProblem } from '../imports/import-problems';
import { SpreadsheetImport } from '../imports/SpreadsheetImport';

interface Figures {
  taxableIncome: number;
  withholdingTax: number;
  ssoEmployee: number;
}

/** A run calculated without the figures, which needs calculating again. */
interface StaleRun {
  runId: string;
  runNo: string;
  period: string;
}

export interface PayrollImportPreview {
  fileName: string;
  year: number;
  throughMonth: number;
  rows: (Figures & {
    row: number;
    employeeId: string;
    employeeCode: string;
    name: string;
    /** The employee already had figures for the year; these replace them. */
    replaces: boolean;
  })[];
  totals: Figures;
  /** Runs already calculated for these employees without the figures. */
  recalculate: StaleRun[];
  problems: ImportProblem[];
}

export interface PayrollImportResult {
  employees: number;
  year: number;
  throughMonth: number;
  recalculate: StaleRun[];
}

/** The month names in the reader's language. */
function monthName(year: number, month: number): string {
  return formatDate(new Date(year, month - 1, 1), 'LLLL');
}

/** The month before this one: most often the last month the old system paid. */
function lastMonth(today: Date): { year: number; month: number } {
  const month = today.getMonth(); // January is 0, so this is last month counted from 1
  return month === 0
    ? { year: today.getFullYear() - 1, month: 12 }
    : { year: today.getFullYear(), month };
}

/**
 * This year's pay before the company moved to Cwork (CW-059): each person's
 * taxable income, tax withheld and social security, January to the last month
 * the old system paid. Withholding projects the year from these, and the
 * year-end filings count them as this company's own.
 */
export default function PayrollImportPage() {
  const t = useT();
  const today = new Date();
  const thisYear = today.getFullYear();
  const [period, setPeriod] = useState(() => lastMonth(today));
  const months = period.year === thisYear ? today.getMonth() + 1 : 12;

  /** "January to August 2026", or "January 2026" alone. */
  const span = (year: number, month: number) =>
    month === 1
      ? `${monthName(year, 1)} ${formatYear(year)}`
      : t('January to {month} {year}', { month: monthName(year, month), year: formatYear(year) });

  const money = (value: number) => formatMoney(value);

  /** Runs worked out before the figures were in: their withholding is too low. */
  const stale = (runs: StaleRun[], links: boolean) =>
    runs.length > 0 && (
      <div className="alert alert--warning" role="note">
        {t(
          'Already calculated without these figures, so its tax is too low. Calculate it again before it is approved:',
        )}{' '}
        {runs.map((run, i) => (
          <span key={run.runId}>
            {i > 0 && ', '}
            {links ? <Link to={`/payroll/runs/${run.runId}`}>{run.runNo}</Link> : run.runNo} (
            {formatPeriod(run.period)})
          </span>
        ))}
      </div>
    );

  return (
    <SpreadsheetImport<PayrollImportPreview, PayrollImportResult>
      title={t('Import pay before Cwork')}
      description={t(
        'Pay, tax and social security from earlier this year, so withholding and the year-end filings count the whole year',
      )}
      back={{ to: '/payroll', label: t('Back to payroll') }}
      paths={{
        template: '/payroll/opening-balances/import/template',
        preview: '/payroll/opening-balances/import/preview',
        commit: '/payroll/opening-balances/import',
      }}
      query={{ year: period.year, month: period.month }}
      intro={
        <Card title={t('Which months were paid before Cwork')}>
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              {t(
                'From January to the last month the old system paid. Cwork pays from the month after.',
              )}
            </p>
            <div className="toolbar">
              <Field label={t('Up to and including')}>
                <Select
                  value={period.month}
                  onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })}
                >
                  {Array.from({ length: months }, (_, i) => i + 1).map((month) => (
                    <option key={month} value={month}>
                      {monthName(period.year, month)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('Year')}>
                <Select
                  value={period.year}
                  onChange={(e) => {
                    const year = Number(e.target.value);
                    const latest = year === thisYear ? today.getMonth() + 1 : 12;
                    setPeriod({ year, month: Math.min(period.month, latest) });
                  }}
                >
                  <option value={thisYear}>{formatYear(thisYear)}</option>
                  <option value={thisYear - 1}>{formatYear(thisYear - 1)}</option>
                </Select>
              </Field>
            </div>
          </div>
        </Card>
      }
      templateNote={t(
        "Everyone employed from {months} is listed, with any figures imported before. Type each person's totals for those months; importing again replaces the figures rather than adding to them.",
        { months: span(period.year, period.month) },
      )}
      count={(preview) => preview.rows.length}
      readyNote={(preview) =>
        t("The file is clean. Pay for {months}, counted as this company's own:", {
          months: span(preview.year, preview.throughMonth),
        })
      }
      importLabel={(count) => t('Import pay for {count} employees', { count })}
      invalidate={[['payroll']]}
      renderReady={(preview) => (
        <>
          {preview.recalculate.length > 0 && (
            <div style={{ padding: '12px 16px 0' }}>{stale(preview.recalculate, false)}</div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Row')}</th>
                  <th>{t('Code')}</th>
                  <th>{t('Name')}</th>
                  <th className="num">{t('Taxable income')}</th>
                  <th className="num">{t('Tax withheld')}</th>
                  <th className="num">{t('Social security')}</th>
                  <th>{t('Status')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.employeeId}>
                    <td className="mono">{row.row}</td>
                    <td className="mono">{row.employeeCode}</td>
                    <td>{row.name}</td>
                    <td className="num">{money(row.taxableIncome)}</td>
                    <td className="num">{money(row.withholdingTax)}</td>
                    <td className="num">{money(row.ssoEmployee)}</td>
                    <td>
                      {row.replaces ? (
                        <Badge tone="warning">{t('Replaces the figures on file')}</Badge>
                      ) : (
                        <Badge tone="success">{t('New')}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    {t('Total')}
                  </th>
                  <td className="num">{money(preview.totals.taxableIncome)}</td>
                  <td className="num">{money(preview.totals.withholdingTax)}</td>
                  <td className="num">{money(preview.totals.ssoEmployee)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      done={(result, again) => {
        const next =
          result.throughMonth === 12
            ? { year: result.year + 1, month: 1 }
            : { year: result.year, month: result.throughMonth + 1 };
        return (
          <>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {t('Pay for {months} imported for {count} employees', {
                months: span(result.year, result.throughMonth),
                count: result.employees,
              })}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {t('Run payroll in Cwork from {month} {year}.', {
                month: monthName(next.year, next.month),
                year: formatYear(next.year),
              })}
            </p>
            {stale(result.recalculate, true)}
            <div className="row">
              <Link to="/payroll" className="btn btn--primary">
                {t('Back to payroll')}
              </Link>
              <Button onClick={again}>{t('Import another file')}</Button>
            </div>
          </>
        );
      }}
    />
  );
}
