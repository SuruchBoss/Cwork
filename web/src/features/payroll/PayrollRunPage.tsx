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
import { useT } from '@/lib/i18n/useT';
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

interface RunExplanation {
  reply: string;
}

/**
 * The assistant's explanation of a run's variance, offered to an approver
 * before they sign (CW-040).
 *
 * It renders nothing at all unless the deployment has the assistant switched
 * on — an organisation running with `ASSISTANT_ENABLED=false` sees the approval
 * screen exactly as it was. The model is not called until the approver asks:
 * the panel is a button, and the explanation is fetched on demand.
 */
function RunExplanationPanel({ runId }: { runId: string }) {
  const t = useT();
  const status = useQuery({
    queryKey: ['assistant', 'status'],
    queryFn: () => api.get<{ enabled: boolean }>('/assistant/status'),
    staleTime: 5 * 60_000,
  });

  const explain = useMutation({
    mutationFn: () =>
      api.post<RunExplanation>(`/assistant/payroll-runs/${runId}/explanation`),
  });

  if (!status.data?.enabled) return null;

  return (
    <Card
      title={t('Explain with AI')}
      actions={
        <Button
          variant="secondary"
          size="sm"
          loading={explain.isPending}
          onClick={() => explain.mutate()}
        >
          {explain.data ? t('Explain again') : t('Explain this run')}
        </Button>
      }
    >
      {explain.isError ? (
        <div className="alert alert--danger" role="alert">
          {explain.error instanceof Error ? explain.error.message : t('Could not explain')}
        </div>
      ) : explain.data ? (
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{explain.data.reply}</p>
      ) : (
        <p className="subtle" style={{ margin: 0 }}>
          {t(
            'Compares this run with the previous period and explains what moved the totals — every figure comes from the real run, not an estimate',
          )}
        </p>
      )}
    </Card>
  );
}

export default function PayrollRunPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const t = useT();

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
        title={t('Run {no}', { no: data.runNo })}
        description={t('Period {code} · pay date {date}', {
          code: data.period.code,
          date: formatDate(data.period.payDate),
        })}
        actions={
          <>
            <Link to="/payroll" className="btn btn--secondary btn--sm">
              ← {t('Back')}
            </Link>
            {canRun && ['DRAFT', 'CALCULATED', 'FAILED'].includes(data.status) && (
              <Button
                variant="primary"
                loading={act.isPending && act.variables === 'calculate'}
                onClick={() => act.mutate('calculate')}
              >
                {t('Calculate payroll')}
              </Button>
            )}
            {canApprove && data.status === 'CALCULATED' && (
              <Button
                variant="primary"
                loading={act.isPending && act.variables === 'approve'}
                onClick={() => act.mutate('approve')}
              >
                {t('Approve run')}
              </Button>
            )}
            {canApprove && data.status === 'APPROVED' && (
              <Button
                variant="primary"
                loading={act.isPending && act.variables === 'pay'}
                onClick={() => act.mutate('pay')}
              >
                {t('Record payment and publish payslips')}
              </Button>
            )}
          </>
        }
      />

      <div className="row">
        <Badge tone={statusTone(data.status)}>
          {t(payrollStatusLabels[data.status] ?? data.status)}
        </Badge>
        {data.calculatedAt && (
          <span className="subtle">
            {t('Calculated {date}', { date: formatDateTime(data.calculatedAt) })}
          </span>
        )}
        {data.paidAt && (
          <span className="subtle">
            {t('Paid {date}', { date: formatDateTime(data.paidAt) })}
          </span>
        )}
      </div>

      {act.isError && (
        <div className="alert alert--danger" role="alert">
          {act.error instanceof Error ? act.error.message : t('Could not complete the action')}
        </div>
      )}
      {data.failureReason && (
        <div className="alert alert--danger">
          {t('Calculation failed: {reason}', { reason: data.failureReason })}
        </div>
      )}
      {data.status === 'CALCULATED' && (
        <div className="alert alert--info">
          {t(
            'Whoever calculated this run cannot approve their own — another authorised person must approve it',
          )}
        </div>
      )}

      {canApprove && ['CALCULATED', 'PENDING_APPROVAL'].includes(data.status) && (
        <RunExplanationPanel runId={data.id} />
      )}

      <div className="grid grid--4">
        <Stat label={t('Employees')} value={data.employeeCount} />
        <Stat label={t('Total gross')} value={formatMoney(data.totalGross, data.currency)} />
        <Stat label={t('Total deductions')} value={formatMoney(data.totalDeduction, data.currency)} />
        <Stat
          label={t('Net pay')}
          value={formatMoney(data.totalNet, data.currency)}
          hint={t('Employer cost {amount}', {
            amount: formatMoney(data.totalEmployerCost, data.currency),
          })}
        />
      </div>

      <Card title={t('Payslips ({count})', { count: data.payslips.length })} flush>
        {data.payslips.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Employee')}</th>
                  <th>{t('Department')}</th>
                  <th className="num">{t('Total gross')}</th>
                  <th className="num">{t('Deductions')}</th>
                  <th className="num">{t('Net')}</th>
                  <th>{t('Published')}</th>
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
                        <Badge tone="success">{t('Published')}</Badge>
                      ) : (
                        <Badge tone="neutral">{t('Not published')}</Badge>
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
            title={t('No payslips in this run yet')}
            description={t('Press “Calculate payroll” to create a payslip for every employee')}
          />
        )}
      </Card>
    </div>
  );
}
