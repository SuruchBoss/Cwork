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
import { formatDate } from '@/lib/format';
import { documentTypeLabels, statusTone } from '@/lib/labels';
import type { DocumentRequest } from '@/types/api';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('APPROVED');

  const requests = useQuery({
    queryKey: qk.documentRequests(status),
    queryFn: () =>
      api.get<DocumentRequest[]>('/documents/requests', { query: { status: status || undefined } }),
  });

  const issue = useMutation({
    mutationFn: (id: string) => api.post(`/documents/requests/${id}/issue`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  return (
    <div className="page">
      <PageHeader
        title="คำขอเอกสาร"
        description="หนังสือรับรอง สลิป และเอกสารอื่นที่พนักงานร้องขอ"
      />

      <Card>
        <div className="toolbar">
          <Field label="สถานะ">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="APPROVED">อนุมัติแล้ว (รอออกเอกสาร)</option>
              <option value="PENDING">รออนุมัติ</option>
              <option value="ISSUED">ออกเอกสารแล้ว</option>
              <option value="REJECTED">ไม่อนุมัติ</option>
              <option value="">ทั้งหมด</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card flush>
        {requests.isLoading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : requests.isError ? (
          <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
        ) : requests.data && requests.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>พนักงาน</th>
                  <th>ประเภทเอกสาร</th>
                  <th>วัตถุประสงค์</th>
                  <th>ยื่นเมื่อ</th>
                  <th>สถานะ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.data.map((request) => (
                  <tr key={request.id}>
                    <td className="mono">
                      {request.referenceNo}
                      {request.createdViaAssistant && (
                        <div>
                          <Badge tone="brand">ยื่นผ่านผู้ช่วย AI</Badge>
                        </div>
                      )}
                    </td>
                    <td>
                      <Person
                        name={`${request.employee.firstNameTh} ${request.employee.lastNameTh}`}
                        meta={request.employee.employeeCode}
                      />
                    </td>
                    <td>
                      {documentTypeLabels[request.type] ?? request.type}
                      {request.includeSalary && (
                        <div>
                          <Badge tone="warning">ระบุเงินเดือน</Badge>
                        </div>
                      )}
                    </td>
                    <td className="subtle">{request.purpose ?? '—'}</td>
                    <td className="subtle">{formatDate(request.requestedAt)}</td>
                    <td>
                      <Badge tone={statusTone(request.status)}>{request.status}</Badge>
                    </td>
                    <td>
                      {request.status === 'APPROVED' && (
                        <Button
                          size="sm"
                          variant="primary"
                          loading={issue.isPending && issue.variables === request.id}
                          onClick={() => issue.mutate(request.id)}
                        >
                          ออกเอกสาร
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="📄" title="ไม่มีคำขอเอกสารตามเงื่อนไข" />
        )}
      </Card>
    </div>
  );
}
