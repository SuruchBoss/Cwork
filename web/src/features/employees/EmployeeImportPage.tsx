// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Link } from 'react-router-dom';
import { Badge, Button } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { ImportProblem } from '../imports/import-problems';
import { SpreadsheetImport } from '../imports/SpreadsheetImport';

export interface EmployeeImportPreview {
  fileName: string;
  employees: {
    row: number;
    employeeCode: string;
    name: string;
    hireDate: string;
    onProbation: boolean;
    scannerId: string | null;
    hasBankAccount: boolean;
  }[];
  problems: ImportProblem[];
}

/**
 * Bringing a company's people in from a spreadsheet (CW-059): a template
 * filled in by hand, or an Odoo export pasted into it.
 */
export default function EmployeeImportPage() {
  const t = useT();
  const canImportLeave = useAuthStore((s) => s.canAny(P.LEAVE_BALANCE_ADJUST));

  return (
    <SpreadsheetImport<EmployeeImportPreview, { created: number }>
      title={t('Import employees')}
      description={t(
        'From a spreadsheet: a template filled in by hand, or an export pasted into it',
      )}
      back={{ to: '/employees', label: t('Back to the directory') }}
      paths={{
        template: '/employees/import/template',
        preview: '/employees/import/preview',
        commit: '/employees/import',
      }}
      templateNote={t(
        'One person per row. The second sheet says what goes in each column. Columns you do not need can be deleted.',
      )}
      count={(preview) => preview.employees.length}
      readyNote={() => t('The file is clean. These employees will be created, all together:')}
      importLabel={(count) => t('Import {count} employees', { count })}
      invalidate={[['employees']]}
      renderReady={(preview) => (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Row')}</th>
                <th>{t('Code')}</th>
                <th>{t('Name')}</th>
                <th>{t('Hire date')}</th>
                <th>{t('Scanner ID')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.employees.map((employee) => (
                <tr key={employee.employeeCode}>
                  <td className="mono">{employee.row}</td>
                  <td className="mono">{employee.employeeCode}</td>
                  <td>{employee.name}</td>
                  <td>{formatDate(employee.hireDate)}</td>
                  <td className="mono">{employee.scannerId ?? '—'}</td>
                  <td>
                    <Badge tone={employee.onProbation ? 'warning' : 'success'}>
                      {employee.onProbation ? t('Probation') : t('Active')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      done={(result, again) => (
        <>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {t('{count} employees imported', { count: result.created })}
          </p>
          {canImportLeave && (
            <p className="muted" style={{ margin: 0 }}>
              {t(
                'If they took leave this year before Cwork, import that next so their balances are right.',
              )}
            </p>
          )}
          <div className="row">
            <Link to="/employees" className="btn btn--primary">
              {t('Open the directory')}
            </Link>
            {canImportLeave && (
              <Link to="/leave/import" className="btn btn--secondary">
                {t('Import leave taken')}
              </Link>
            )}
            <Button onClick={again}>{t('Import another file')}</Button>
          </div>
        </>
      )}
    />
  );
}
