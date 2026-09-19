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
import { useT } from '@/lib/i18n/useT';
import { documentTypeLabels, statusTone } from '@/lib/labels';
import type { DocumentRequest } from '@/types/api';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const t = useT();
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
        title={t('Document requests')}
        description={t('Certificates, payslips and other documents employees request')}
      />

      <Card>
        <div className="toolbar">
          <Field label={t('Status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="APPROVED">{t('Approved (awaiting issue)')}</option>
              <option value="PENDING">{t('Pending')}</option>
              <option value="ISSUED">{t('Issued')}</option>
              <option value="REJECTED">{t('Rejected')}</option>
              <option value="">{t('All')}</option>
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
                  <th>{t('No.')}</th>
                  <th>{t('Employee')}</th>
                  <th>{t('Document type')}</th>
                  <th>{t('Purpose')}</th>
                  <th>{t('Submitted')}</th>
                  <th>{t('Status')}</th>
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
                          <Badge tone="brand">{t('Filed via AI assistant')}</Badge>
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
                      {t(documentTypeLabels[request.type] ?? request.type)}
                      {request.includeSalary && (
                        <div>
                          <Badge tone="warning">{t('Salary included')}</Badge>
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
                          {t('Issue')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="▣" title={t('No document requests match')} />
        )}
      </Card>
    </div>
  );
}
