import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import type { AuditLogEntry, Page } from '@/types/api';

const ACTION_TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  READ: 'neutral',
  LOGIN: 'brand',
  LOGIN_FAILED: 'danger',
  LOGOUT: 'neutral',
  APPROVE: 'success',
  REJECT: 'danger',
  EXPORT: 'warning',
  PERMISSION_CHANGE: 'warning',
  AI_TOOL_CALL: 'brand',
};

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  const logs = useQuery({
    queryKey: qk.auditLogs({ action, entityType, page }),
    queryFn: () =>
      api.get<Page<AuditLogEntry>>('/audit-logs', {
        query: {
          action: action || undefined,
          entityType: entityType || undefined,
          page,
          limit: 50,
        },
      }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="page">
      <PageHeader
        title="บันทึกการใช้งาน"
        description="บันทึกแบบเพิ่มได้อย่างเดียว — ฐานข้อมูลปฏิเสธการแก้ไขและลบ"
      />

      <Card>
        <div className="toolbar">
          <Field label="ประเภทการกระทำ">
            <Select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">ทั้งหมด</option>
              {Object.keys(ACTION_TONES).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ชนิดข้อมูล">
            <Input
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
              placeholder="เช่น Employee, PayrollRun"
            />
          </Field>
        </div>
      </Card>

      <Card flush>
        {logs.isLoading ? (
          <TableSkeleton rows={10} columns={5} />
        ) : logs.isError ? (
          <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
        ) : logs.data && logs.data.data.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>ผู้ใช้</th>
                    <th>การกระทำ</th>
                    <th>ข้อมูล</th>
                    <th>รายละเอียด</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.data.map((entry) => (
                    <tr key={entry.id}>
                      <td className="subtle" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td>{entry.actor?.email ?? 'ระบบ'}</td>
                      <td>
                        <Badge tone={ACTION_TONES[entry.action] ?? 'neutral'}>{entry.action}</Badge>
                      </td>
                      <td className="mono">{entry.entityType}</td>
                      <td className="subtle">{entry.summary ?? '—'}</td>
                      <td className="mono subtle">{entry.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row row--between" style={{ padding: 12 }}>
              <span className="subtle">
                {logs.data.meta.total.toLocaleString('th-TH')} รายการ · หน้า {logs.data.meta.page} /{' '}
                {logs.data.meta.totalPages}
              </span>
              <div className="row" style={{ gap: 6 }}>
                <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  ก่อนหน้า
                </Button>
                <Button
                  size="sm"
                  disabled={!logs.data.meta.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState icon="⎙" title="ไม่มีบันทึกตามเงื่อนไข" />
        )}
      </Card>
    </div>
  );
}
