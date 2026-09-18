import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { qk } from '@/app/query-client';
import { Badge, Card, EmptyState, PageHeader, Person, Stat } from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, formatRelative } from '@/lib/format';
import { approvalEntityLabels, leaveStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { ApprovalTask, LeaveRequest, Page, PayrollRun } from '@/types/api';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const canAny = useAuthStore((s) => s.canAny);

  const canSeePeople = canAny(P.EMPLOYEE_READ, P.EMPLOYEE_READ_TEAM);
  const canSeeLeave = canAny(P.LEAVE_READ, P.LEAVE_READ_TEAM);
  const canSeePayroll = canAny(P.PAYROLL_READ);

  const approvals = useQuery({
    queryKey: qk.approvalTasks('PENDING'),
    queryFn: () => api.get<ApprovalTask[]>('/approvals/tasks', { query: { status: 'PENDING' } }),
  });

  const headcount = useQuery({
    queryKey: qk.employees({ scope: 'dashboard' }),
    queryFn: () =>
      api.get<Page<unknown>>('/employees', { query: { limit: 1, status: ['ACTIVE', 'PROBATION'] } }),
    enabled: canSeePeople,
  });

  const pendingLeave = useQuery({
    queryKey: qk.leaveRequests({ scope: 'dashboard' }),
    queryFn: () =>
      api.get<Page<LeaveRequest>>('/leave/requests', { query: { status: 'PENDING', limit: 5 } }),
    enabled: canSeeLeave,
  });

  const latestRun = useQuery({
    queryKey: qk.payrollRuns('dashboard'),
    queryFn: () => api.get<PayrollRun[]>('/payroll/runs'),
    enabled: canSeePayroll,
  });

  const run = latestRun.data?.[0];

  return (
    <div className="page">
      <PageHeader
        title={`สวัสดี ${user?.displayName ?? ''}`}
        description="ภาพรวมงาน HR ที่ต้องดำเนินการวันนี้"
      />

      <div className="grid grid--4">
        <Stat
          label="รออนุมัติของคุณ"
          value={approvals.data?.length ?? '—'}
          hint={approvals.data?.length ? 'กดเพื่อดำเนินการ' : 'ไม่มีรายการค้าง'}
        />
        {canSeePeople && (
          <Stat
            label="พนักงานที่ทำงานอยู่"
            value={headcount.data?.meta.total ?? '—'}
            hint="รวมพนักงานทดลองงาน"
          />
        )}
        {canSeeLeave && (
          <Stat
            label="คำขอลารออนุมัติ"
            value={pendingLeave.data?.meta.total ?? '—'}
            hint="ทั้งองค์กรที่คุณมองเห็น"
          />
        )}
        {canSeePayroll && (
          <Stat
            label="รอบเงินเดือนล่าสุด"
            value={run ? run.period?.code ?? run.runNo : '—'}
            hint={run ? formatMoney(run.totalNet, run.currency) : 'ยังไม่มีรอบ'}
          />
        )}
      </div>

      <div className="grid grid--2">
        <Card
          title="รายการรออนุมัติ"
          actions={
            <Link to="/approvals" className="btn btn--ghost btn--sm">
              ดูทั้งหมด
            </Link>
          }
          flush
        >
          {approvals.isLoading ? (
            <div style={{ padding: 16 }} className="muted">
              กำลังโหลด…
            </div>
          ) : approvals.data && approvals.data.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {approvals.data.slice(0, 6).map((task) => {
                    const submitter = task.instance.submittedBy.employee;
                    return (
                      <tr key={task.id}>
                        <td style={{ width: '45%' }}>
                          <Person
                            name={
                              submitter
                                ? `${submitter.firstNameTh} ${submitter.lastNameTh}`
                                : task.instance.submittedBy.email
                            }
                            meta={submitter?.employeeCode}
                          />
                        </td>
                        <td>
                          <Badge tone="warning">
                            {approvalEntityLabels[task.instance.entityType] ??
                              task.instance.entityType}
                          </Badge>
                        </td>
                        <td className="subtle">{formatRelative(task.instance.submittedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="✓" title="ไม่มีรายการรออนุมัติ" description="คุณเคลียร์งานหมดแล้ว" />
          )}
        </Card>

        {canSeeLeave && (
          <Card
            title="คำขอลาล่าสุด"
            actions={
              <Link to="/leave" className="btn btn--ghost btn--sm">
                ดูทั้งหมด
              </Link>
            }
            flush
          >
            {pendingLeave.data && pendingLeave.data.data.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {pendingLeave.data.data.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <Person
                            name={`${request.employee.firstNameTh} ${request.employee.lastNameTh}`}
                            meta={request.employee.department?.name}
                          />
                        </td>
                        <td>
                          <span className="row" style={{ gap: 6 }}>
                            <span
                              className="dot"
                              style={{ background: request.leaveType.colorHex }}
                              aria-hidden
                            />
                            {request.leaveType.name}
                          </span>
                        </td>
                        <td className="subtle">
                          {formatDate(request.startDate)} · {Number(request.totalDays)} วัน
                        </td>
                        <td>
                          <Badge tone={statusTone(request.status)}>
                            {leaveStatusLabels[request.status] ?? request.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="⏸" title="ไม่มีคำขอลารออนุมัติ" />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
