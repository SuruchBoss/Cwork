import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney } from '@/lib/format';
import { payrollStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { PayrollPeriod, PayrollRun } from '@/types/api';

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const canRun = can(P.PAYROLL_RUN);

  const [creating, setCreating] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    periodStart: '',
    periodEnd: '',
    payDate: '',
  });

  const periods = useQuery({
    queryKey: qk.payrollPeriods(),
    queryFn: () => api.get<PayrollPeriod[]>('/payroll/periods'),
  });

  const runs = useQuery({
    queryKey: qk.payrollRuns(),
    queryFn: () => api.get<PayrollRun[]>('/payroll/runs'),
  });

  const createPeriod = useMutation({
    mutationFn: () => api.post<PayrollPeriod>('/payroll/periods', form),
    onSuccess: () => {
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
    },
  });

  const createRun = useMutation({
    mutationFn: (periodId: string) => api.post<PayrollRun>('/payroll/runs', { periodId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['payroll'] }),
  });

  const latest = runs.data?.[0];

  return (
    <div className="page">
      <PageHeader
        title="เงินเดือน"
        description="งวดเงินเดือน รอบการคำนวณ และสลิปเงินเดือน"
        actions={
          canRun && (
            <Button variant="primary" onClick={() => setCreating((v) => !v)}>
              + สร้างงวดใหม่
            </Button>
          )
        }
      />

      {latest && (
        <div className="grid grid--4">
          <Stat label="รอบล่าสุด" value={latest.runNo} hint={latest.period?.code} />
          <Stat label="พนักงาน" value={latest.employeeCount} />
          <Stat label="รายได้รวม" value={formatMoney(latest.totalGross, latest.currency)} />
          <Stat label="จ่ายสุทธิ" value={formatMoney(latest.totalNet, latest.currency)} />
        </div>
      )}

      {creating && (
        <Card title="สร้างงวดเงินเดือน">
          <div className="toolbar">
            <Field label="ปี">
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
              />
            </Field>
            <Field label="เดือน">
              <Input
                type="number"
                min={1}
                max={12}
                value={form.month}
                onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}
              />
            </Field>
            <Field label="เริ่มงวด">
              <Input
                type="date"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              />
            </Field>
            <Field label="สิ้นงวด">
              <Input
                type="date"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              />
            </Field>
            <Field label="วันจ่าย">
              <Input
                type="date"
                value={form.payDate}
                onChange={(e) => setForm({ ...form, payDate: e.target.value })}
              />
            </Field>
            <Button
              variant="primary"
              loading={createPeriod.isPending}
              disabled={!form.periodStart || !form.periodEnd || !form.payDate}
              onClick={() => createPeriod.mutate()}
            >
              สร้างงวด
            </Button>
          </div>
          {createPeriod.isError && (
            <div className="alert alert--danger" style={{ marginTop: 10 }}>
              {createPeriod.error instanceof Error ? createPeriod.error.message : 'สร้างไม่สำเร็จ'}
            </div>
          )}
        </Card>
      )}

      <Card title="งวดเงินเดือน" flush>
        {periods.isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : periods.isError ? (
          <ErrorState error={periods.error} onRetry={() => void periods.refetch()} />
        ) : periods.data && periods.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>งวด</th>
                  <th>ช่วงเวลา</th>
                  <th>วันจ่าย</th>
                  <th>สถานะ</th>
                  <th>รอบคำนวณ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {periods.data.map((period) => (
                  <tr key={period.id}>
                    <td className="mono">{period.code}</td>
                    <td>
                      {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
                    </td>
                    <td>{formatDate(period.payDate)}</td>
                    <td>
                      <Badge tone={statusTone(period.status)}>{period.status}</Badge>
                    </td>
                    <td>{period._count?.runs ?? 0}</td>
                    <td>
                      {canRun && period.status !== 'CLOSED' && (
                        <Button
                          size="sm"
                          loading={createRun.isPending && createRun.variables === period.id}
                          onClick={() => createRun.mutate(period.id)}
                        >
                          สร้างรอบคำนวณ
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="฿"
            title="ยังไม่มีงวดเงินเดือน"
            description="สร้างงวดแรกเพื่อเริ่มคำนวณเงินเดือน"
          />
        )}
      </Card>

      <Card title="รอบการคำนวณ" flush>
        {runs.data && runs.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>เลขที่รอบ</th>
                  <th>งวด</th>
                  <th className="num">พนักงาน</th>
                  <th className="num">รายได้รวม</th>
                  <th className="num">จ่ายสุทธิ</th>
                  <th>สถานะ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.data.map((run) => (
                  <tr key={run.id}>
                    <td className="mono">{run.runNo}</td>
                    <td>{run.period?.code ?? '—'}</td>
                    <td className="num">{run.employeeCount}</td>
                    <td className="num">{formatMoney(run.totalGross, run.currency)}</td>
                    <td className="num">{formatMoney(run.totalNet, run.currency)}</td>
                    <td>
                      <Badge tone={statusTone(run.status)}>
                        {payrollStatusLabels[run.status] ?? run.status}
                      </Badge>
                    </td>
                    <td>
                      <Link to={`/payroll/runs/${run.id}`} className="btn btn--secondary btn--sm">
                        เปิดดู
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="฿" title="ยังไม่มีรอบการคำนวณ" />
        )}
      </Card>
    </div>
  );
}
