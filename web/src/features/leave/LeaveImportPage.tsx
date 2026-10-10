// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { formatNumber, formatYear } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import type { ImportProblem } from '../imports/import-problems';
import { SpreadsheetImport } from '../imports/SpreadsheetImport';

export interface LeaveImportPreview {
  fileName: string;
  year: number;
  leaveTypes: { id: string; code: string; name: string }[];
  rows: {
    row: number;
    employeeId: string;
    employeeCode: string;
    name: string;
    taken: { leaveTypeId: string; days: number; availableAfter: number }[];
  }[];
  problems: ImportProblem[];
}

/**
 * Leave taken this year before the company moved to Cwork (CW-059). The
 * template already lists everyone and every leave type; HR types the days, and
 * the preview shows each balance as it will be.
 */
/** 3, 2.5 or 0.25: as many decimals as the figure has, never rounded away. */
function days(value: number): string {
  const digits = Number.isInteger(value) ? 0 : Number.isInteger(value * 10) ? 1 : 2;
  return formatNumber(value, digits);
}

export default function LeaveImportPage() {
  const t = useT();

  return (
    <SpreadsheetImport<LeaveImportPreview, { employees: number; year: number }>
      title={t('Import leave taken')}
      description={t(
        'Leave employees took this year before the company started using Cwork, so their balances start right',
      )}
      back={{ to: '/leave', label: t('Back to leave') }}
      paths={{
        template: '/leave/balances/import/template',
        preview: '/leave/balances/import/preview',
        commit: '/leave/balances/import',
      }}
      templateNote={t(
        'Everyone and every leave type is listed already: type the days each person has taken. A blank cell changes nothing, and importing again replaces the figures rather than adding to them.',
      )}
      count={(preview) => preview.rows.length}
      readyNote={(preview) =>
        t('The file is clean. Leave taken in {year}, and the balance each person is left with:', {
          year: formatYear(preview.year),
        })
      }
      importLabel={(count) => t('Import leave for {count} employees', { count })}
      invalidate={[['leave']]}
      renderReady={(preview) => {
        const used = preview.leaveTypes.filter((type) =>
          preview.rows.some((row) => row.taken.some((taken) => taken.leaveTypeId === type.id)),
        );
        return (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Row')}</th>
                  <th>{t('Code')}</th>
                  <th>{t('Name')}</th>
                  {used.map((type) => (
                    <th key={type.id}>{type.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.employeeId}>
                    <td className="mono">{row.row}</td>
                    <td className="mono">{row.employeeCode}</td>
                    <td>{row.name}</td>
                    {used.map((type) => {
                      const taken = row.taken.find((entry) => entry.leaveTypeId === type.id);
                      return (
                        <td key={type.id}>
                          {taken ? (
                            <>
                              {t('{days} taken', { days: days(taken.days) })}
                              <div className="subtle">
                                {t('{days} left', { days: days(taken.availableAfter) })}
                              </div>
                            </>
                          ) : (
                            <span className="subtle">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
      done={(result, again) => (
        <>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {t('Leave taken in {year} imported for {count} employees', {
              year: formatYear(result.year),
              count: result.employees,
            })}
          </p>
          <div className="row">
            <Link to="/leave" className="btn btn--primary">
              {t('Back to leave')}
            </Link>
            <Button onClick={again}>{t('Import another file')}</Button>
          </div>
        </>
      )}
    />
  );
}
