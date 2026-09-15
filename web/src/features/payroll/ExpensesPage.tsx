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
      <PageHeader title="เบิกค่าใช้จ่าย" description="คำขอเบิกของพนักงานและสถานะการจ่าย" />

      <Card>
        <div className="toolbar">
          <Field label="สถานะ">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">รออนุมัติ</option>
              <option value="APPROVED">อนุมัติแล้ว (รอจ่าย)</option>
              <option value="PAID">จ่ายแล้ว</option>
              <option value="REJECTED">ไม่อนุมัติ</option>
              <option value="">ทั้งหมด</option>
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
                  <th>เลขที่</th>
                  <th>พนักงาน</th>
                  <th>รายการ</th>
                  <th className="num">จำนวนเงิน</th>
                  <th>ยื่นเมื่อ</th>
                  <th>สถานะ</th>
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
                        {claim._count.items} รายการ · {claim.category}
                      </div>
                    </td>
                    <td className="num">
                      {formatMoney(claim.approvedAmount ?? claim.totalAmount, claim.currency)}
                      {claim.approvedAmount &&
                        claim.approvedAmount !== claim.totalAmount && (
                          <div className="subtle">
                            ขอเบิก {formatMoney(claim.totalAmount, claim.currency)}
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
                              อนุมัติ
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                decide.mutate({
                                  id: claim.id,
                                  decision: 'REJECT',
                                  note: 'ไม่อนุมัติจากหน้าจัดการ',
                                })
                              }
                            >
                              ไม่อนุมัติ
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
          <EmptyState icon="🧾" title="ไม่มีคำขอเบิกตามเงื่อนไข" />
        )}
      </Card>
    </div>
  );
}
