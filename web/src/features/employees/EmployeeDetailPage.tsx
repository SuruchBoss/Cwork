import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { qk } from '@/app/query-client';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatDateTime, formatNumber, yearsOfService } from '@/lib/format';
import { employeeStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { EmployeeDetail, LeaveBalance } from '@/types/api';

export default function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const canAny = useAuthStore((s) => s.canAny);

  const employee = useQuery({
    queryKey: qk.employee(id),
    queryFn: () => api.get<EmployeeDetail>(`/employees/${id}`),
    enabled: Boolean(id),
  });

  const balances = useQuery({
    queryKey: qk.leaveBalances(id),
    queryFn: () => api.get<LeaveBalance[]>(`/leave/balances/${id}`),
    enabled: Boolean(id) && canAny(P.LEAVE_READ, P.LEAVE_READ_TEAM),
  });

  const events = useQuery({
    queryKey: qk.employmentEvents(id),
    queryFn: () =>
      api.get<Array<{ id: string; type: string; effectiveDate: string; reason: string | null }>>(
        `/employees/${id}/employment-events`,
      ),
    enabled: Boolean(id) && canAny(P.EMPLOYEE_READ),
  });

  if (employee.isLoading) {
    return (
      <div className="page">
        <Card flush>
          <TableSkeleton rows={6} columns={3} />
        </Card>
      </div>
    );
  }

  if (employee.isError || !employee.data) {
    return (
      <div className="page">
        <ErrorState error={employee.error} onRetry={() => void employee.refetch()} />
      </div>
    );
  }

  const person = employee.data;
  const name = `${person.firstNameTh} ${person.lastNameTh}`;

  return (
    <div className="page">
      <PageHeader
        title={name}
        description={`${person.position?.title ?? 'ไม่ระบุตำแหน่ง'} · ${person.department?.name ?? 'ไม่ระบุแผนก'}`}
        actions={
          <Link to="/employees" className="btn btn--secondary btn--sm">
            ← กลับไปทะเบียน
          </Link>
        }
      />

      <div className="grid grid--2">
        <Card title="ข้อมูลพนักงาน">
          <div className="row" style={{ gap: 14, marginBottom: 16 }}>
            <Avatar name={name} size="lg" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{name}</div>
              <div className="mono subtle">{person.employeeCode}</div>
              <div style={{ marginTop: 6 }}>
                <Badge tone={statusTone(person.status)}>
                  {employeeStatusLabels[person.status] ?? person.status}
                </Badge>
              </div>
            </div>
          </div>

          <dl className="stack stack--sm" style={{ margin: 0 }}>
            <DetailRow label="อีเมลที่ทำงาน" value={person.workEmail} />
            <DetailRow label="โทรศัพท์" value={person.phone} />
            <DetailRow label="สถานที่ทำงาน" value={person.workLocation?.name} />
            <DetailRow
              label="หัวหน้างาน"
              value={
                person.manager
                  ? `${person.manager.firstNameTh} ${person.manager.lastNameTh}`
                  : null
              }
            />
            <DetailRow label="ประเภทการจ้าง" value={person.employmentType} />
            <DetailRow
              label="วันเริ่มงาน"
              value={`${formatDate(person.hireDate)} (${yearsOfService(person.hireDate)})`}
            />
            {person.probationEndDate && (
              <DetailRow label="ครบทดลองงาน" value={formatDate(person.probationEndDate)} />
            )}
            {person.lastWorkingDate && (
              <DetailRow label="วันทำงานสุดท้าย" value={formatDate(person.lastWorkingDate)} />
            )}
            <DetailRow
              label="เลขบัตรประชาชน"
              value={person.nationalId ?? person.nationalIdMasked ?? 'ไม่มีสิทธิ์ดู'}
            />
            {person.user && (
              <DetailRow
                label="บัญชีผู้ใช้"
                value={`${person.user.email} · เข้าใช้ล่าสุด ${formatDateTime(person.user.lastLoginAt)}`}
              />
            )}
          </dl>
        </Card>

        <div className="stack">
          {balances.data && (
            <Card title="วันลาคงเหลือ" flush>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ประเภท</th>
                      <th className="num">ได้รับ</th>
                      <th className="num">ใช้ไป</th>
                      <th className="num">รออนุมัติ</th>
                      <th className="num">คงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.data
                      .filter((b) => b.granted > 0 || b.used > 0)
                      .map((balance) => (
                        <tr key={balance.leaveTypeId}>
                          <td>
                            <span className="row" style={{ gap: 6 }}>
                              <span
                                className="dot"
                                style={{ background: balance.colorHex }}
                                aria-hidden
                              />
                              {balance.name}
                            </span>
                          </td>
                          <td className="num">{formatNumber(balance.granted, 1)}</td>
                          <td className="num">{formatNumber(balance.used, 1)}</td>
                          <td className="num">{formatNumber(balance.pending, 1)}</td>
                          <td className="num" style={{ fontWeight: 600 }}>
                            {formatNumber(balance.available, 1)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {person.directReports.length > 0 && (
            <Card title={`ผู้ใต้บังคับบัญชา (${person.directReports.length})`} flush>
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {person.directReports.map((report) => (
                      <tr key={report.id}>
                        <td>
                          <Link to={`/employees/${report.id}`}>
                            {report.firstNameTh} {report.lastNameTh}
                          </Link>
                        </td>
                        <td className="mono subtle">{report.employeeCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>

      {events.data && (
        <Card title="ประวัติการทำงาน" flush>
          {events.data.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>วันที่มีผล</th>
                    <th>เหตุการณ์</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDate(event.effectiveDate)}</td>
                      <td>
                        <Badge tone="brand">{event.type}</Badge>
                      </td>
                      <td className="subtle">{event.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="🗂" title="ยังไม่มีประวัติ" />
          )}
        </Card>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="row row--between" style={{ gap: 16, alignItems: 'baseline' }}>
      <dt className="subtle" style={{ flexShrink: 0 }}>
        {label}
      </dt>
      <dd style={{ margin: 0, textAlign: 'right' }}>{value || '—'}</dd>
    </div>
  );
}
