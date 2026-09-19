import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { qk } from '@/app/query-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Person,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, yearsOfService } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { employeeStatusLabels, statusTone } from '@/lib/labels';
import type { EmployeeSummary, Page } from '@/types/api';

interface Filters {
  search: string;
  status: string;
  departmentId: string;
  page: number;
}

export default function EmployeeListPage() {
  const t = useT();
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'ACTIVE,PROBATION',
    departmentId: '',
    page: 1,
  });

  const departments = useQuery({
    queryKey: qk.departments,
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/departments'),
  });

  const employees = useQuery({
    queryKey: qk.employees(filters),
    queryFn: () =>
      api.get<Page<EmployeeSummary>>('/employees', {
        query: {
          search: filters.search || undefined,
          status: filters.status || undefined,
          departmentId: filters.departmentId || undefined,
          page: filters.page,
          limit: 25,
          sortBy: 'employeeCode',
          sortOrder: 'asc',
        },
      }),
    placeholderData: (previous) => previous,
  });

  const update = (patch: Partial<Filters>) =>
    setFilters((current) => ({ ...current, page: 1, ...patch }));

  return (
    <div className="page">
      <PageHeader
        title={t('Employee directory')}
        description={
          employees.data
            ? t('{count} people you can access', { count: employees.data.meta.total })
            : undefined
        }
      />

      <Card>
        <div className="toolbar">
          <Field label={t('Search')}>
            <Input
              placeholder={t('Name, employee code or email')}
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
            />
          </Field>
          <Field label={t('Status')}>
            <Select value={filters.status} onChange={(e) => update({ status: e.target.value })}>
              <option value="ACTIVE,PROBATION">{t('Working')}</option>
              <option value="">{t('All')}</option>
              <option value="PROBATION">{t('Probation')}</option>
              <option value="RESIGNED,TERMINATED">{t('Left')}</option>
            </Select>
          </Field>
          <Field label={t('Department')}>
            <Select
              value={filters.departmentId}
              onChange={(e) => update({ departmentId: e.target.value })}
            >
              <option value="">{t('All departments')}</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card flush>
        {employees.isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : employees.isError ? (
          <ErrorState error={employees.error} onRetry={() => void employees.refetch()} />
        ) : employees.data && employees.data.data.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Employee')}</th>
                    <th>{t('Code')}</th>
                    <th>{t('Position')}</th>
                    <th>{t('Department')}</th>
                    <th>{t('Tenure')}</th>
                    <th>{t('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.data.data.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <Link to={`/employees/${employee.id}`} style={{ color: 'inherit' }}>
                          <Person
                            name={`${employee.firstNameTh} ${employee.lastNameTh}`}
                            meta={employee.workEmail ?? employee.nickname}
                          />
                        </Link>
                      </td>
                      <td className="mono">{employee.employeeCode}</td>
                      <td>{employee.position?.title ?? '—'}</td>
                      <td>{employee.department?.name ?? '—'}</td>
                      <td className="subtle">
                        {yearsOfService(employee.hireDate)}
                        <div className="subtle">
                          {t('Started {date}', { date: formatDate(employee.hireDate) })}
                        </div>
                      </td>
                      <td>
                        <Badge tone={statusTone(employee.status)}>
                          {employeeStatusLabels[employee.status] ?? employee.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {employees.data.meta.totalPages > 1 && (
              <div className="row row--between" style={{ padding: 12 }}>
                <span className="subtle">
                  {t('Page {page} of {total}', {
                    page: employees.data.meta.page,
                    total: employees.data.meta.totalPages,
                  })}
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <Button
                    size="sm"
                    disabled={filters.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                  >
                    {t('Previous')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!employees.data.meta.hasNext}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                  >
                    {t('Next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon="☰"
            title={t('No employees match')}
            description={t('Try adjusting the filters')}
          />
        )}
      </Card>
    </div>
  );
}
