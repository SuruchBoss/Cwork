// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { qk } from '@/app/query-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatYear } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import {
  OrgEditorCard,
  type DepartmentRecord,
  type OrgEditor,
  type PositionRecord,
  type WorkLocationRecord,
} from './organization-forms';

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
  const canManage = useAuthStore((s) => s.can)(P.ORG_MANAGE);
  const [editor, setEditor] = useState<OrgEditor | null>(null);
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<Organization>('/organization'),
  });

  const tree = useQuery({
    queryKey: qk.departmentTree,
    queryFn: () => api.get<DepartmentNode[]>('/departments/tree'),
  });

  const departments = useQuery({
    queryKey: qk.departments,
    queryFn: () => api.get<DepartmentRecord[]>('/departments'),
  });

  const positions = useQuery({
    queryKey: qk.positions,
    queryFn: () => api.get<PositionRecord[]>('/positions'),
  });

  const locations = useQuery({
    queryKey: qk.workLocations,
    queryFn: () => api.get<WorkLocationRecord[]>('/work-locations'),
  });

  /** One form at a time, at the top of the page; its first field takes focus, which scrolls to it. */
  const open = (next: OrgEditor) => setEditor(next);
  const renameDepartment = (id: string) => {
    const record = departments.data?.find((d) => d.id === id);
    if (record) open({ kind: 'department', record });
  };

  const year = new Date().getFullYear();
  const holidays = useQuery({
    queryKey: qk.holidays(year),
    queryFn: () => api.get<Holiday[]>('/holidays', { query: { year } }),
  });

  return (
    <div className="page">
      <PageHeader
        title={t('Organisation structure')}
        description={t(
          'Company details, departments, positions, work locations and public holidays',
        )}
      />

      {editor && (
        <OrgEditorCard
          // A new key per form, so switching from one record to another starts clean.
          key={`${editor.kind}-${editor.record?.id ?? 'new'}`}
          editor={editor}
          departments={departments.data ?? []}
          positions={positions.data ?? []}
          locations={locations.data ?? []}
          onDone={() => setEditor(null)}
        />
      )}

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
        <Card
          title={t('Department tree')}
          actions={
            canManage && (
              <Button size="sm" onClick={() => open({ kind: 'department' })}>
                + {t('Add a department')}
              </Button>
            )
          }
        >
          {tree.isLoading ? (
            <TableSkeleton rows={5} columns={2} />
          ) : tree.isError ? (
            <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />
          ) : tree.data && tree.data.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {tree.data.map((node) => (
                <DepartmentBranch
                  key={node.id}
                  node={node}
                  depth={0}
                  onRename={canManage ? renameDepartment : undefined}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon="⌗" title={t('No departments yet')} />
          )}
        </Card>

        <Card title={t('Public holidays {year}', { year: formatYear(year) })} flush>
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

      <div className="grid grid--2">
        <Card
          title={t('Positions')}
          flush
          actions={
            canManage && (
              <Button size="sm" onClick={() => open({ kind: 'position' })}>
                + {t('Add a position')}
              </Button>
            )
          }
        >
          {positions.isLoading ? (
            <TableSkeleton rows={4} columns={3} />
          ) : positions.isError ? (
            <ErrorState error={positions.error} onRetry={() => void positions.refetch()} />
          ) : positions.data && positions.data.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {positions.data.map((position) => (
                    <tr key={position.id}>
                      <td>
                        {position.title}
                        {position.department && (
                          <div className="subtle">{position.department.name}</div>
                        )}
                      </td>
                      <td className="mono subtle">{position.code}</td>
                      {canManage && (
                        <td style={{ width: 1 }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t('Rename {name}', { name: position.title })}
                            onClick={() => open({ kind: 'position', record: position })}
                          >
                            {t('Rename')}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="⌗" title={t('No positions yet')} />
          )}
        </Card>

        <Card
          title={t('Work locations')}
          flush
          actions={
            canManage && (
              <Button size="sm" onClick={() => open({ kind: 'location' })}>
                + {t('Add a work location')}
              </Button>
            )
          }
        >
          {locations.isLoading ? (
            <TableSkeleton rows={3} columns={2} />
          ) : locations.isError ? (
            <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
          ) : locations.data && locations.data.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {locations.data.map((location) => (
                    <tr key={location.id}>
                      <td>
                        {location.name}
                        <div className="subtle">
                          {location.minimumDailyWage
                            ? t('Minimum wage {amount} a day · {source}', {
                                amount: formatMoney(location.minimumDailyWage),
                                source: location.minimumDailyWageSource ?? '',
                              })
                            : t('No minimum wage set')}
                        </div>
                      </td>
                      <td className="mono subtle">{location.code}</td>
                      <td style={{ width: 1 }}>
                        {!location.isActive ? (
                          <Badge tone="neutral">{t('Replaced')}</Badge>
                        ) : (
                          canManage && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={t('Edit {name}', { name: location.name })}
                              onClick={() => open({ kind: 'location', record: location })}
                            >
                              {t('Edit')}
                            </Button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="⌗" title={t('No work locations yet')} />
          )}
        </Card>
      </div>
    </div>
  );
}

function DepartmentBranch({
  node,
  depth,
  onRename,
}: {
  node: DepartmentNode;
  depth: number;
  onRename?: (id: string) => void;
}) {
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
        <span className="row" style={{ gap: 8 }}>
          <Badge tone="neutral">
            {node.employeeCount} {t('people')}
          </Badge>
          {onRename && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('Rename {name}', { name: node.name })}
              onClick={() => onRename(node.id)}
            >
              {t('Rename')}
            </Button>
          )}
        </span>
      </div>
      {node.children.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {node.children.map((child) => (
            <DepartmentBranch key={child.id} node={child} depth={depth + 1} onRename={onRename} />
          ))}
        </ul>
      )}
    </li>
  );
}
