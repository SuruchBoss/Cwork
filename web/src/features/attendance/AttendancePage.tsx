import { useMutation, useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
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
  Person,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatMinutes, formatTime, isoDate, todayIso } from '@/lib/format';
import { anomalyFlagLabels, attendanceStatusLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { AttendanceRecord, Page } from '@/types/api';

interface FlagExplanation {
  reply: string;
}

/**
 * The assistant's read of a team's flagged attendance punches, for a manager
 * (CW-039).
 *
 * It renders nothing unless the deployment has the assistant switched on, and
 * the caller who reaches the endpoint must be able to see their team's
 * attendance — so it is only offered to a viewer who holds that permission. The
 * model is not called until the manager asks: the panel is a button, and it
 * explains exactly the date window the table is showing.
 */
function FlagExplanationPanel({ from, to }: { from: string; to: string }) {
  const status = useQuery({
    queryKey: ['assistant', 'status'],
    queryFn: () => api.get<{ enabled: boolean }>('/assistant/status'),
    staleTime: 5 * 60_000,
  });

  const explain = useMutation({
    mutationFn: () =>
      api.post<FlagExplanation>('/assistant/attendance/flag-explanation', { from, to }),
  });

  if (!status.data?.enabled) return null;

  return (
    <Card
      title="อธิบายด้วย AI"
      actions={
        <Button
          variant="secondary"
          size="sm"
          loading={explain.isPending}
          onClick={() => explain.mutate()}
        >
          {explain.data ? 'อธิบายอีกครั้ง' : 'อธิบายธงลงเวลา'}
        </Button>
      }
    >
      {explain.isError ? (
        <div className="alert alert--danger" role="alert">
          {explain.error instanceof Error ? explain.error.message : 'อธิบายไม่สำเร็จ'}
        </div>
      ) : explain.data ? (
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{explain.data.reply}</p>
      ) : (
        <p className="subtle" style={{ margin: 0 }}>
          จัดกลุ่มรายการที่ต้องตรวจสอบตามสถานที่และชนิดธง พร้อมระยะห่างและจำนวน
          เพื่อช่วยแยกว่าเป็นเพราะตั้งค่าพื้นที่แคบไป หรือควรตรวจสอบจริง — ตัวเลขทั้งหมดมาจากข้อมูลจริง
        </p>
      )}
    </Card>
  );
}

export default function AttendancePage() {
  const [from, setFrom] = useState(isoDate(subDays(new Date(), 6)));
  const [to, setTo] = useState(todayIso());
  const [status, setStatus] = useState('');
  const [anomaliesOnly, setAnomaliesOnly] = useState(false);
  const canReadTeam = useAuthStore((s) =>
    s.canAny(P.ATTENDANCE_READ_TEAM, P.ATTENDANCE_READ, P.ATTENDANCE_MANAGE),
  );

  const records = useQuery({
    queryKey: qk.attendanceRecords({ from, to, status, anomaliesOnly }),
    queryFn: () =>
      api.get<Page<AttendanceRecord>>('/attendance/records', {
        query: {
          from,
          to,
          status: status || undefined,
          anomaliesOnly: anomaliesOnly || undefined,
          limit: 100,
          sortOrder: 'desc',
        },
      }),
    placeholderData: (previous) => previous,
  });

  const rows = records.data?.data ?? [];
  const summary = rows.reduce(
    (acc, record) => {
      if (record.status === 'LATE') acc.late += 1;
      if (record.status === 'ABSENT') acc.absent += 1;
      if (record.anomalyFlags.length > 0 || record.isOutsideGeofence) acc.flagged += 1;
      acc.overtimeMinutes += record.approvedOvertimeMinutes;
      return acc;
    },
    { late: 0, absent: 0, flagged: 0, overtimeMinutes: 0 },
  );

  return (
    <div className="page">
      <PageHeader
        title="ลงเวลาทำงาน"
        description="บันทึกเวลาเข้า-ออกงานรายวัน พร้อมรายการที่ต้องตรวจสอบ"
      />

      <div className="grid grid--4">
        <Stat label="รายการในช่วง" value={rows.length} />
        <Stat label="มาสาย" value={summary.late} />
        <Stat label="ขาดงาน" value={summary.absent} />
        <Stat
          label="ต้องตรวจสอบ"
          value={summary.flagged}
          hint="นอกพื้นที่ หรือมีสัญญาณผิดปกติ"
        />
      </div>

      <Card>
        <div className="toolbar">
          <Field label="ตั้งแต่วันที่">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="ถึงวันที่">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="สถานะ">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="PRESENT">มาทำงาน</option>
              <option value="LATE">มาสาย</option>
              <option value="ABSENT">ขาดงาน</option>
              <option value="ON_LEAVE">ลา</option>
              <option value="INCOMPLETE">ลงเวลาไม่ครบ</option>
            </Select>
          </Field>
          <Field label="ตัวกรองพิเศษ">
            <label className="row" style={{ gap: 6, paddingTop: 8 }}>
              <input
                type="checkbox"
                checked={anomaliesOnly}
                onChange={(e) => setAnomaliesOnly(e.target.checked)}
              />
              <span>เฉพาะรายการที่ต้องตรวจสอบ</span>
            </label>
          </Field>
        </div>
      </Card>

      {canReadTeam && summary.flagged > 0 && <FlagExplanationPanel from={from} to={to} />}

      <Card flush>
        {records.isLoading ? (
          <TableSkeleton rows={8} columns={7} />
        ) : records.isError ? (
          <ErrorState error={records.error} onRetry={() => void records.refetch()} />
        ) : rows.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>พนักงาน</th>
                  <th>เข้า</th>
                  <th>ออก</th>
                  <th className="num">ทำงาน</th>
                  <th className="num">สาย</th>
                  <th>สถานะ</th>
                  <th>ตรวจสอบ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDate(record.workDate, 'd MMM')}</td>
                    <td>
                      <Person
                        name={`${record.employee.firstNameTh} ${record.employee.lastNameTh}`}
                        meta={record.employee.department?.name}
                      />
                    </td>
                    <td className="num">{formatTime(record.firstClockInAt)}</td>
                    <td className="num">{formatTime(record.lastClockOutAt)}</td>
                    <td className="num">{formatMinutes(record.workedMinutes)}</td>
                    <td className="num">
                      {record.lateMinutes > 0 ? (
                        <span style={{ color: 'var(--danger)' }}>{record.lateMinutes} น.</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <Badge tone={statusTone(record.status)}>
                        {attendanceStatusLabels[record.status] ?? record.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {record.anomalyFlags.map((flag) => (
                          <Badge key={flag} tone="warning">
                            {anomalyFlagLabels[flag] ?? flag}
                          </Badge>
                        ))}
                        {record.lockedAt && <Badge tone="neutral">ปิดรอบแล้ว</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="◔" title="ไม่มีข้อมูลการลงเวลาในช่วงนี้" />
        )}
      </Card>
    </div>
  );
}
