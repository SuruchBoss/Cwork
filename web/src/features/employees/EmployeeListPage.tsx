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
import { employeeStatusLabels, statusTone } from '@/lib/labels';
import type { EmployeeSummary, Page } from '@/types/api';

interface Filters {
  search: string;
  status: string;
  departmentId: string;
  page: number;
}

export default function EmployeeListPage() {
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
        title="ทะเบียนพนักงาน"
        description={
          employees.data ? `${employees.data.meta.total} คนที่คุณมีสิทธิ์เข้าถึง` : undefined
        }
      />

      <Card>
        <div className="toolbar">
          <Field label="ค้นหา">
            <Input
              placeholder="ชื่อ รหัสพนักงาน หรืออีเมล"
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
            />
          </Field>
          <Field label="สถานะ">
            <Select value={filters.status} onChange={(e) => update({ status: e.target.value })}>
              <option value="ACTIVE,PROBATION">ทำงานอยู่</option>
              <option value="">ทั้งหมด</option>
              <option value="PROBATION">ทดลองงาน</option>
              <option value="RESIGNED,TERMINATED">พ้นสภาพแล้ว</option>
            </Select>
          </Field>
          <Field label="แผนก">
            <Select
              value={filters.departmentId}
              onChange={(e) => update({ departmentId: e.target.value })}
            >
              <option value="">ทุกแผนก</option>
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
                    <th>พนักงาน</th>
                    <th>รหัส</th>
                    <th>ตำแหน่ง</th>
                    <th>แผนก</th>
                    <th>อายุงาน</th>
                    <th>สถานะ</th>
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
                        <div className="subtle">เริ่ม {formatDate(employee.hireDate)}</div>
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
                  หน้า {employees.data.meta.page} จาก {employees.data.meta.totalPages}
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <Button
                    size="sm"
                    disabled={filters.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                  >
                    ก่อนหน้า
                  </Button>
                  <Button
                    size="sm"
                    disabled={!employees.data.meta.hasNext}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                  >
                    ถัดไป
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon="☰" title="ไม่พบพนักงานตามเงื่อนไข" description="ลองปรับตัวกรอง" />
        )}
      </Card>
    </div>
  );
}
