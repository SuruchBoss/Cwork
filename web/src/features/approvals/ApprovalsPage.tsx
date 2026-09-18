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
  TableSkeleton,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatRelative } from '@/lib/format';
import { approvalEntityLabels } from '@/lib/labels';
import type { ApprovalTask } from '@/types/api';

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const tasks = useQuery({
    queryKey: qk.approvalTasks('PENDING'),
    queryFn: () => api.get<ApprovalTask[]>('/approvals/tasks', { query: { status: 'PENDING' } }),
  });

  const decide = useMutation({
    mutationFn: (input: { taskId: string; decision: 'APPROVE' | 'REJECT'; comment?: string }) =>
      api.post(`/approvals/tasks/${input.taskId}/decide`, {
        decision: input.decision,
        comment: input.comment,
      }),
    onSuccess: () => {
      setRejecting(null);
      setComment('');
      // A decision changes the underlying entity too, so refresh broadly.
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      void queryClient.invalidateQueries({ queryKey: ['overtime'] });
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  return (
    <div className="page">
      <PageHeader
        title="รายการรออนุมัติ"
        description="คำขอทั้งหมดที่รอการตัดสินใจจากคุณ"
      />

      <Card flush>
        {tasks.isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : tasks.data && tasks.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ผู้ยื่น</th>
                  <th>ประเภท</th>
                  <th>รายละเอียด</th>
                  <th>ยื่นเมื่อ</th>
                  <th style={{ width: 200 }}>ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {tasks.data.map((task) => {
                  const submitter = task.instance.submittedBy.employee;
                  const isRejecting = rejecting === task.id;
                  const pending = decide.isPending && decide.variables?.taskId === task.id;

                  return (
                    <tr key={task.id}>
                      <td>
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
                          {approvalEntityLabels[task.instance.entityType] ?? task.instance.entityType}
                        </Badge>
                      </td>
                      <td className="subtle">{describeSnapshot(task.instance.snapshot)}</td>
                      <td className="subtle">
                        {formatRelative(task.instance.submittedAt)}
                        {task.dueAt && (
                          <div className="subtle">ครบกำหนด {formatDate(task.dueAt)}</div>
                        )}
                      </td>
                      <td>
                        {isRejecting ? (
                          <div className="stack stack--sm">
                            <Field label="เหตุผลที่ไม่อนุมัติ">
                              <Textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="อธิบายให้ผู้ยื่นทราบ"
                                rows={2}
                              />
                            </Field>
                            <div className="row" style={{ gap: 6 }}>
                              <Button
                                size="sm"
                                variant="danger"
                                loading={pending}
                                disabled={!comment.trim()}
                                onClick={() =>
                                  decide.mutate({
                                    taskId: task.id,
                                    decision: 'REJECT',
                                    comment: comment.trim(),
                                  })
                                }
                              >
                                ยืนยันไม่อนุมัติ
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                                ยกเลิก
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="row" style={{ gap: 6 }}>
                            <Button
                              size="sm"
                              variant="primary"
                              loading={pending}
                              onClick={() => decide.mutate({ taskId: task.id, decision: 'APPROVE' })}
                            >
                              อนุมัติ
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRejecting(task.id);
                                setComment('');
                              }}
                            >
                              ไม่อนุมัติ
                            </Button>
                          </div>
                        )}
                      </td>
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

      {decide.isError && (
        <div className="alert alert--danger" role="alert">
          {decide.error instanceof Error ? decide.error.message : 'ดำเนินการไม่สำเร็จ'}
        </div>
      )}
    </div>
  );
}

/**
 * The approval snapshot is entity-specific JSON. Rather than a switch per
 * entity type, surface the handful of fields that are meaningful across all of
 * them — the detail lives one click away on the entity itself.
 */
function describeSnapshot(snapshot: Record<string, unknown>): string {
  const parts: string[] = [];

  if (typeof snapshot.leaveTypeCode === 'string') parts.push(String(snapshot.leaveTypeCode));
  if (typeof snapshot.totalDays === 'number') parts.push(`${snapshot.totalDays} วัน`);
  if (typeof snapshot.hours === 'number') parts.push(`${snapshot.hours} ชม.`);
  if (typeof snapshot.totalAmount === 'number') {
    parts.push(`${snapshot.totalAmount.toLocaleString('th-TH')} บาท`);
  }
  if (typeof snapshot.startDate === 'string') parts.push(formatDate(snapshot.startDate));
  if (typeof snapshot.workDate === 'string') parts.push(formatDate(snapshot.workDate));
  if (typeof snapshot.lastWorkingDate === 'string') {
    parts.push(`วันสุดท้าย ${formatDate(snapshot.lastWorkingDate)}`);
  }
  if (typeof snapshot.type === 'string' && !snapshot.leaveTypeCode) parts.push(String(snapshot.type));

  return parts.join(' · ') || '—';
}
