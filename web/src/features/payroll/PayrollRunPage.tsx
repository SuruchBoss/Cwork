import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { qk } from '@/app/query-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Person,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { payrollStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { PayrollRun, PayslipSummary } from '@/types/api';

interface RunDetail extends PayrollRun {
  period: {
    code: string;
    year: number;
    month: number;
    payDate: string;
    periodStart: string;
    periodEnd: string;
  };
  payslips: PayslipSummary[];
}

export default function PayrollRunPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const can = useAuthStore((s) => s.can);

  const run = useQuery({
    queryKey: qk.payrollRun(id),
    queryFn: () => api.get<RunDetail>(`/payroll/runs/${id}`),
    enabled: Boolean(id),
    // While a run is calculating, poll so the operator sees it finish.
    refetchInterval: (query) => (query.state.data?.status === 'CALCULATING' ? 2000 : false),
  });

  const act = useMutation({
    mutationFn: (action: 'calculate' | 'approve' | 'pay' | 'cancel') =>
      api.post(`/payroll/runs/${id}/${action}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['payroll'] }),
  });

  if (run.isLoading) {
    return (
      <div className="page">
        <Card flush>
          <TableSkeleton rows={6} columns={5} />
        </Card>
      </div>
    );
  }

  if (run.isError || !run.data) {
    return (
      <div className="page">
        <ErrorState error={run.error} onRetry={() => void run.refetch()} />
      </div>
    );
  }

  const data = run.data;
  const canRun = can(P.PAYROLL_RUN);
  const canApprove = can(P.PAYROLL_APPROVE);

  return (
    <div className="page">
      <PageHeader
        title={`รอบ ${data.runNo}`}
        description={`งวด ${data.period.code} · จ่ายวันที่ ${formatDate(data.period.payDate)}`}
        actions={
          <>
            <Link to="/payroll" className="btn btn--secondary btn--sm">
              ← กลับ
            </Link>
            {canRun && ['DRAFT', 'CALCULATED', 'FAILED'].includes(data.status) && (
              <Button
                variant="primary"
                loading={act.isPending && act.variables === 'calculate'}
                onClick={() => act.mutate('calculate')}
              >
                คำนวณเงินเดือน
              </Button>
            )}
            {canApprove && data.status === 'CALCULATED' && (
              <Button
                variant="primary"
                loading={act.isPending && act.variables === 'approve'}
                onClick={() => act.mutate('approve')}
              >
                อนุมัติรอบ
              </Button>
            )}
            {canApprove && data.status === 'APPROVED' && (
              <Button
                variant="primary"
                loading={act.isPending && act.variables === 'pay'}
                onClick={() => act.mutate('pay')}
              >
                บันทึกการจ่ายและเผยแพร่สลิป
              </Button>
            )}
          </>
        }
      />

      <div className="row">
        <Badge tone={statusTone(data.status)}>
          {payrollStatusLabels[data.status] ?? data.status}
        </Badge>
        {data.calculatedAt && (
          <span className="subtle">คำนวณเมื่อ {formatDateTime(data.calculatedAt)}</span>
        )}
        {data.paidAt && <span className="subtle">จ่ายเมื่อ {formatDateTime(data.paidAt)}</span>}
      </div>

      {act.isError && (
        <div className="alert alert--danger" role="alert">
          {act.error instanceof Error ? act.error.message : 'ดำเนินการไม่สำเร็จ'}
        </div>
      )}
      {data.failureReason && (
        <div className="alert alert--danger">การคำนวณล้มเหลว: {data.failureReason}</div>
      )}
      {data.status === 'CALCULATED' && (
        <div className="alert alert--info">
          ผู้ที่คำนวณรอบนี้ไม่สามารถอนุมัติรอบของตัวเองได้ — ต้องให้ผู้มีสิทธิ์อีกคนอนุมัติ
        </div>
      )}

      <div className="grid grid--4">
        <Stat label="พนักงาน" value={data.employeeCount} />
        <Stat label="รายได้รวม" value={formatMoney(data.totalGross, data.currency)} />
        <Stat label="รายการหักรวม" value={formatMoney(data.totalDeduction, data.currency)} />
        <Stat
          label="จ่ายสุทธิ"
          value={formatMoney(data.totalNet, data.currency)}
          hint={`ต้นทุนนายจ้าง ${formatMoney(data.totalEmployerCost, data.currency)}`}
        />
      </div>

      <Card title={`สลิปเงินเดือน (${data.payslips.length})`} flush>
        {data.payslips.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  <th>แผนก</th>
                  <th className="num">รายได้รวม</th>
                  <th className="num">รายการหัก</th>
                  <th className="num">สุทธิ</th>
                  <th>เผยแพร่</th>
                </tr>
              </thead>
              <tbody>
                {data.payslips.map((slip) => (
                  <tr key={slip.id}>
                    <td>
                      <Person
                        name={`${slip.employee?.firstNameTh ?? ''} ${slip.employee?.lastNameTh ?? ''}`}
                        meta={slip.employee?.employeeCode}
                      />
                    </td>
                    <td>{slip.employee?.department?.name ?? '—'}</td>
                    <td className="num">{formatMoney(slip.grossEarnings, slip.currency)}</td>
                    <td className="num">{formatMoney(slip.totalDeductions, slip.currency)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {formatMoney(slip.netPay, slip.currency)}
                    </td>
                    <td>
                      {slip.publishedAt ? (
                        <Badge tone="success">เผยแพร่แล้ว</Badge>
                      ) : (
                        <Badge tone="neutral">ยังไม่เผยแพร่</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="🧾"
            title="ยังไม่มีสลิปในรอบนี้"
            description="กด “คำนวณเงินเดือน” เพื่อสร้างสลิปของพนักงานทุกคน"
          />
        )}
      </Card>
    </div>
  );
}
