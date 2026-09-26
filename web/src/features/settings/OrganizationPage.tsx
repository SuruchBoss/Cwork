// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import { qk } from '@/app/query-client';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';

interface DepartmentNode {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  employeeCount: number;
  children: DepartmentNode[];
}

interface Organization {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  timezone: string;
  currency: string;
  defaultLocale: string;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
  nameEn: string | null;
}

export default function OrganizationPage() {
  const t = useT();
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<Organization>('/organization'),
  });

  const tree = useQuery({
    queryKey: qk.departmentTree,
    queryFn: () => api.get<DepartmentNode[]>('/departments/tree'),
  });

  const year = new Date().getFullYear();
  const holidays = useQuery({
    queryKey: qk.holidays(year),
    queryFn: () => api.get<Holiday[]>('/holidays', { query: { year } }),
  });

  return (
    <div className="page">
      <PageHeader
        title={t('Organisation structure')}
        description={t('Company details, departments and public holidays')}
      />

      {organization.data && (
        <div className="grid grid--4">
          <Stat
            label={t('Company')}
            value={organization.data.name}
            hint={organization.data.legalName ?? ''}
          />
          <Stat label={t('Tax ID')} value={organization.data.taxId ?? '—'} />
          <Stat label={t('Timezone')} value={organization.data.timezone} />
          <Stat label={t('Currency')} value={organization.data.currency} />
        </div>
      )}

      <div className="grid grid--2">
        <Card title={t('Department tree')}>
          {tree.isLoading ? (
            <TableSkeleton rows={5} columns={2} />
          ) : tree.isError ? (
            <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />
          ) : tree.data && tree.data.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {tree.data.map((node) => (
                <DepartmentBranch key={node.id} node={node} depth={0} />
              ))}
            </ul>
          ) : (
            <EmptyState icon="⌗" title={t('No departments yet')} />
          )}
        </Card>

        <Card title={t('Public holidays {year}', { year })} flush>
          {holidays.data && holidays.data.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {holidays.data.map((holiday) => (
                    <tr key={holiday.id}>
                      <td style={{ width: 130 }}>{formatDate(holiday.date)}</td>
                      <td>
                        {holiday.name}
                        {holiday.nameEn && <div className="subtle">{holiday.nameEn}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="⌗" title={t('No holidays set yet')} />
          )}
        </Card>
      </div>
    </div>
  );
}

function DepartmentBranch({ node, depth }: { node: DepartmentNode; depth: number }) {
  const t = useT();
  return (
    <li>
      <div
        className="row row--between"
        style={{
          padding: '7px 0',
          paddingLeft: depth * 18,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span className="row" style={{ gap: 8 }}>
          {depth > 0 && <span className="subtle">└</span>}
          <span style={{ fontWeight: depth === 0 ? 600 : 400 }}>{node.name}</span>
          <code className="mono subtle">{node.code}</code>
        </span>
        <Badge tone="neutral">
          {node.employeeCount} {t('people')}
        </Badge>
      </div>
      {node.children.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {node.children.map((child) => (
            <DepartmentBranch key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
