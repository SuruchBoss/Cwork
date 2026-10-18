// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { qk } from '@/app/query-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Person,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api, saveBlob } from '@/lib/api-client';
import { formatDate, formatDateTime, formatMoney, formatPeriod } from '@/lib/format';
import { plural } from '@/lib/i18n';
import { useT } from '@/lib/i18n/useT';
import { payrollStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { PayFrequency, PayrollRun, PayrollRunStatus, PayslipSummary } from '@/types/api';
import { describeWarning } from './payslip-warnings';

interface RunDetail extends PayrollRun {
  period: {
    code: string;
    year: number;
    month: number;
    payDate: string;
    periodStart: string;
    periodEnd: string;
    payFrequency: PayFrequency;
    half: number;
  };
  payslips: PayslipSummary[];
  /** On a second half: the same month's first-half run, or null if there is none (CW-069). */
  firstHalf?: { id: string; runNo: string; status: PayrollRunStatus } | null;
}

/**
 * Why a second half cannot be calculated yet (CW-069): it is worked out from
 * the first half, which has to be paid first. Said in words, with the way to
 * the first half, because a button that merely does nothing explains nothing.
 */
function FirstHalfNotice({
  firstHalf,
}: {
  firstHalf: { id: string; runNo: string; status: PayrollRunStatus } | null;
}) {
  const t = useT();
  return (
    <div className="alert alert--warning" role="status">
      <p id="first-half-notice" style={{ margin: 0 }}>
        {firstHalf
          ? t(
              'This is the second half of the month, and it is worked out from the first half. The first half’s run {no} is {status}: it has to be paid before this half can be calculated.',
              {
                no: firstHalf.runNo,
                status: t(payrollStatusLabels[firstHalf.status] ?? firstHalf.status),
              },
            )
          : t(
              'This is the second half of the month, and it is worked out from the first half, which has no run yet. Create the first half’s run, then calculate, approve and pay it before this half.',
            )}
      </p>
      {firstHalf && (
        <p style={{ margin: '6px 0 0' }}>
          <Link to={`/payroll/runs/${firstHalf.id}`}>
            {t('Open the first half’s run {no}', { no: firstHalf.runNo })}
          </Link>
        </p>
      )}
    </div>
  );
}

/** The payslips HR should check before approving, each warning in words (CW-069). */
function PayslipWarnings({ payslips }: { payslips: PayslipSummary[] }) {
  const t = useT();
  const flagged = payslips.filter((slip) => (slip.warnings?.length ?? 0) > 0);
  if (flagged.length === 0) return null;
  return (
    <Card title={t('Check before approving ({count})', { count: flagged.length })}>
      <ul className="stack" style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
        {flagged.map((slip) => (
          <li key={slip.id}>
            <Person
              name={`${slip.employee?.firstNameTh ?? ''} ${slip.employee?.lastNameTh ?? ''}`}
              meta={slip.employee?.employeeCode}
            />
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {slip.warnings!.map((warning, i) => (
                <li key={`${warning.code}-${i}`}>{describeWarning(warning, t)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
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
    mutationFn: () => api.post<RunExplanation>(`/assistant/payroll-runs/${runId}/explanation`),
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

type SlipsPerPage = '1' | '2' | '4';

/**
 * Opens a PDF in a new tab to print from, and falls back to saving it when the
 * browser will not open one. The object URL is released after a minute, long
 * enough for the viewer to have read it.
 */
function openPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank');
  if (opened) {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    URL.revokeObjectURL(url);
    saveBlob(blob, filename);
  }
}

/**
 * Printable payslips, the wage-receipt sheet (CW-071) and the cash-preparation
 * sheet (CW-088). Only an approved or paid run can be printed; the server enforces it and refuses a slip whose
 * lines do not add up, so the reason surfaces here rather than a bad page.
 */
function PrintCard({ run }: { run: RunDetail }) {
  const t = useT();
  const [perPage, setPerPage] = useState<SlipsPerPage>('2');
  const printable = ['APPROVED', 'PAID'].includes(run.status);

  const print = useMutation({
    mutationFn: async (kind: 'payslips' | 'receipts' | 'cash') => {
      const { blob, filename } =
        kind === 'payslips'
          ? await api.download(`/payroll/runs/${run.id}/print/payslips`, { query: { perPage } })
          : kind === 'receipts'
            ? await api.download(`/payroll/runs/${run.id}/print/receipts`)
            : await api.download(`/payroll/runs/${run.id}/print/cash`);
      openPdf(blob, filename);
    },
  });

  return (
    <Card title={t('Print payslips and wage receipts')}>
      <div className="row">
        <Field
          label={t('Payslips per A4 sheet')}
          hint={t('Two or four to a sheet are cut along the dashed lines')}
        >
          <Select
            value={perPage}
            disabled={!printable}
            onChange={(event) => setPerPage(event.target.value as SlipsPerPage)}
          >
            <option value="1">{t('{count} per sheet', { count: 1 })}</option>
            <option value="2">{t('{count} per sheet', { count: 2 })}</option>
            <option value="4">{t('{count} per sheet', { count: 4 })}</option>
          </Select>
        </Field>
        <Button
          variant="secondary"
          disabled={!printable}
          loading={print.isPending && print.variables === 'payslips'}
          aria-describedby="print-note"
          onClick={() => print.mutate('payslips')}
        >
          {t('Print payslips')}
        </Button>
        <Button
          variant="secondary"
          disabled={!printable}
          loading={print.isPending && print.variables === 'receipts'}
          aria-describedby="print-note"
          onClick={() => print.mutate('receipts')}
        >
          {t('Print wage receipts')}
        </Button>
        <Button
          variant="secondary"
          disabled={!printable}
          loading={print.isPending && print.variables === 'cash'}
          aria-describedby="print-note"
          onClick={() => print.mutate('cash')}
        >
          {t('Print cash sheet')}
        </Button>
      </div>
      <p className="subtle" id="print-note">
        {printable
          ? t('Every print is recorded in the audit log')
          : t('Payslips can be printed once the run is approved')}
      </p>
      {print.isError && (
        <div className="alert alert--danger" role="alert">
          {print.error instanceof Error ? print.error.message : t('Could not complete the action')}
        </div>
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

  /** The people the last calculation left out for lack of pay, from the server's own list. */
  const [skipped, setSkipped] = useState<Array<{ employeeCode: string; reason: string }>>([]);

  const act = useMutation({
    mutationFn: (action: 'calculate' | 'approve' | 'pay' | 'cancel') =>
      api.post<{ skipped?: Array<{ employeeCode: string; reason: string }> }>(
        `/payroll/runs/${id}/${action}`,
      ),
    onSuccess: (result, action) => {
      if (action === 'calculate') setSkipped(result?.skipped ?? []);
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
    },
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
  const waitsForFirstHalf = data.firstHalf !== undefined && data.firstHalf?.status !== 'PAID';

  return (
    <div className="page">
      <PageHeader
        title={t('Run {no}', { no: data.runNo })}
        description={t('Period {code} · pay date {date}', {
          code: formatPeriod(data.period.code),
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
                disabled={waitsForFirstHalf}
                aria-describedby={waitsForFirstHalf ? 'first-half-notice' : undefined}
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
          <span className="subtle">{t('Paid {date}', { date: formatDateTime(data.paidAt) })}</span>
        )}
      </div>

      {waitsForFirstHalf && <FirstHalfNotice firstHalf={data.firstHalf ?? null} />}

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
            'Whoever calculated this run cannot approve it. Another authorised person, such as the owner, signs in, opens this run and presses “Approve run”.',
          )}
        </div>
      )}
      {skipped.length > 0 && (
        <div className="alert alert--warning" role="status">
          <p style={{ margin: 0 }}>
            {t(
              plural(
                skipped.length,
                '{count} employee is not in this run because no pay is set for them from this period: {codes}. Set it on the employee’s page under Compensation, then calculate again.',
                '{count} employees are not in this run because no pay is set for them from this period: {codes}. Set it on each employee’s page under Compensation, then calculate again.',
              ),
              { count: skipped.length, codes: skipped.map((item) => item.employeeCode).join(', ') },
            )}
          </p>
        </div>
      )}

      {canApprove && ['CALCULATED', 'PENDING_APPROVAL'].includes(data.status) && (
        <RunExplanationPanel runId={data.id} />
      )}

      <div className="grid grid--4">
        <Stat label={t('Employees')} value={data.employeeCount} />
        <Stat label={t('Total gross')} value={formatMoney(data.totalGross, data.currency)} />
        <Stat
          label={t('Total deductions')}
          value={formatMoney(data.totalDeduction, data.currency)}
        />
        <Stat
          label={t('Net pay')}
          value={formatMoney(data.totalNet, data.currency)}
          hint={t('Employer cost {amount}', {
            amount: formatMoney(data.totalEmployerCost, data.currency),
          })}
        />
      </div>

      <PayslipWarnings payslips={data.payslips} />

      {can(P.PAYROLL_READ) && data.payslips.length > 0 && <PrintCard run={data} />}

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
                  <th>{t('To check')}</th>
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
                    <td>
                      {(slip.warnings?.length ?? 0) > 0 ? (
                        <Badge tone="warning">
                          {t('{count} to check', { count: slip.warnings!.length })}
                        </Badge>
                      ) : (
                        '—'
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
            description={
              data.status === 'DRAFT'
                ? t('Press “Calculate payroll” to create a payslip for every employee')
                : data.period.payFrequency === 'SEMI_MONTHLY'
                  ? t(
                      'Nobody is paid by the day for this period. A half-month period pays only employees with a daily wage; set it on the employee’s page under Compensation, then calculate again.',
                    )
                  : t(
                      'Nobody has a monthly salary set for this period. Set it on the employee’s page under Compensation, then calculate again.',
                    )
            }
          />
        )}
      </Card>
    </div>
  );
}
