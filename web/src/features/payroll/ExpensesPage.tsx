// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';

interface ExpenseClaim {
  id: string;
  claimNo: string;
  title: string;
  category: string;
  currency: string;
  totalAmount: string;
  approvedAmount: string | null;
  status: string;
  submittedAt: string | null;
  paymentMethod: string;
  employee: { id: string; employeeCode: string; firstNameTh: string; lastNameTh: string };
  _count: { items: number };
}

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const t = useT();
  const [status, setStatus] = useState('PENDING');

  const claims = useQuery({
    queryKey: qk.expenseClaims({ status }),
    queryFn: () =>
      api.get<ExpenseClaim[]>('/expenses/claims', { query: { status: status || undefined } }),
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; decision: 'APPROVE' | 'REJECT'; note?: string }) =>
      api.post(`/expenses/claims/${input.id}/decide`, {
        decision: input.decision,
        note: input.note,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  return (
    <div className="page">
      <PageHeader
        title={t('Expenses')}
        description={t('Employee expense claims and their payment status')}
      />

      <Card>
        <div className="toolbar">
          <Field label={t('Status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">{t('Pending')}</option>
              <option value="APPROVED">{t('Approved (awaiting payment)')}</option>
              <option value="PAID">{t('Paid')}</option>
              <option value="REJECTED">{t('Rejected')}</option>
              <option value="">{t('All')}</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card flush>
        {claims.isLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : claims.isError ? (
          <ErrorState error={claims.error} onRetry={() => void claims.refetch()} />
        ) : claims.data && claims.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('No.')}</th>
                  <th>{t('Employee')}</th>
                  <th>{t('Item')}</th>
                  <th className="num">{t('Amount')}</th>
                  <th>{t('Submitted')}</th>
                  <th>{t('Status')}</th>
                  {can(P.EXPENSE_MANAGE) && <th />}
                </tr>
              </thead>
              <tbody>
                {claims.data.map((claim) => (
                  <tr key={claim.id}>
                    <td className="mono">{claim.claimNo}</td>
                    <td>
                      <Person
                        name={`${claim.employee.firstNameTh} ${claim.employee.lastNameTh}`}
                        meta={claim.employee.employeeCode}
                      />
                    </td>
                    <td>
                      {claim.title}
                      <div className="subtle">
                        {claim._count.items} {t('items')} · {claim.category}
                      </div>
                    </td>
                    <td className="num">
                      {formatMoney(claim.approvedAmount ?? claim.totalAmount, claim.currency)}
                      {claim.approvedAmount &&
                        claim.approvedAmount !== claim.totalAmount && (
                          <div className="subtle">
                            {t('Claimed {amount}', {
                              amount: formatMoney(claim.totalAmount, claim.currency),
                            })}
                          </div>
                        )}
                    </td>
                    <td className="subtle">{formatDate(claim.submittedAt)}</td>
                    <td>
                      <Badge tone={statusTone(claim.status)}>{claim.status}</Badge>
                    </td>
                    {can(P.EXPENSE_MANAGE) && (
                      <td>
                        {claim.status === 'PENDING' && (
                          <div className="row" style={{ gap: 6 }}>
                            <Button
                              size="sm"
                              variant="primary"
                              loading={decide.isPending && decide.variables?.id === claim.id}
                              onClick={() => decide.mutate({ id: claim.id, decision: 'APPROVE' })}
                            >
                              {t('Approve')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                decide.mutate({
                                  id: claim.id,
                                  decision: 'REJECT',
                                  note: t('Rejected from the management screen'),
                                })
                              }
                            >
                              {t('Reject')}
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="▤" title={t('No expense claims match')} />
        )}
      </Card>
    </div>
  );
}
