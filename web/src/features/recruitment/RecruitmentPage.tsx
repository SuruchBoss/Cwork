import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { qk } from '@/app/query-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatMoney, formatRelative } from '@/lib/format';
import { applicationStageLabels, statusTone } from '@/lib/labels';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { Application, ApplicationStage, Page } from '@/types/api';

const PIPELINE_STAGES: ApplicationStage[] = [
  'APPLIED',
  'SCREENING',
  'ASSESSMENT',
  'INTERVIEW',
  'OFFER',
  'HIRED',
];

interface Posting {
  id: string;
  title: string;
  slug: string;
  status: string;
  _count: { applications: number };
}

export default function RecruitmentPage() {
  const queryClient = useQueryClient();
  const can = useAuthStore((s) => s.can);
  const canManage = can(P.RECRUITMENT_MANAGE);
  const [postingId, setPostingId] = useState('');

  const postings = useQuery({
    queryKey: qk.postings(),
    queryFn: () => api.get<Posting[]>('/recruitment/postings'),
  });

  const applications = useQuery({
    queryKey: qk.applications({ postingId }),
    queryFn: () =>
      api.get<Page<Application>>('/recruitment/applications', {
        query: { postingId: postingId || undefined, limit: 200 },
      }),
  });

  const moveStage = useMutation({
    mutationFn: (input: { id: string; stage: ApplicationStage }) =>
      api.post(`/recruitment/applications/${input.id}/stage`, {
        stage: input.stage,
        ...(input.stage === 'REJECTED' ? { rejectReason: 'ไม่ผ่านการพิจารณา' } : {}),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['recruitment'] }),
  });

  const byStage = useMemo(() => {
    const groups = new Map<ApplicationStage, Application[]>();
    for (const stage of PIPELINE_STAGES) groups.set(stage, []);
    for (const application of applications.data?.data ?? []) {
      if (groups.has(application.stage)) groups.get(application.stage)!.push(application);
    }
    return groups;
  }, [applications.data]);

  const total = applications.data?.meta.total ?? 0;
  const hired = byStage.get('HIRED')?.length ?? 0;

  return (
    <div className="page">
      <PageHeader title="ผู้สมัครงาน" description="ติดตามผู้สมัครตลอดขั้นตอนการสรรหา" />

      <div className="grid grid--4">
        <Stat label="ใบสมัครทั้งหมด" value={total} />
        <Stat label="ประกาศงานที่เปิด" value={postings.data?.filter((p) => p.status === 'PUBLISHED').length ?? '—'} />
        <Stat label="อยู่ระหว่างสัมภาษณ์" value={byStage.get('INTERVIEW')?.length ?? 0} />
        <Stat label="รับเข้าทำงานแล้ว" value={hired} />
      </div>

      <Card>
        <div className="toolbar">
          <Field label="ประกาศงาน">
            <Select value={postingId} onChange={(e) => setPostingId(e.target.value)}>
              <option value="">ทุกตำแหน่ง</option>
              {postings.data?.map((posting) => (
                <option key={posting.id} value={posting.id}>
                  {posting.title} ({posting._count.applications})
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {applications.isLoading ? (
        <Card flush>
          <TableSkeleton rows={6} columns={4} />
        </Card>
      ) : applications.isError ? (
        <Card>
          <ErrorState error={applications.error} onRetry={() => void applications.refetch()} />
        </Card>
      ) : total === 0 ? (
        <Card>
          <EmptyState
            icon="📋"
            title="ยังไม่มีใบสมัคร"
            description="เผยแพร่ประกาศงานเพื่อเริ่มรับสมัคร"
          />
        </Card>
      ) : (
        <div className="pipeline">
          {PIPELINE_STAGES.map((stage) => {
            const items = byStage.get(stage) ?? [];
            return (
              <div key={stage} className="pipeline__column">
                <div className="pipeline__heading">
                  <span>{applicationStageLabels[stage]}</span>
                  <Badge tone={statusTone(stage)}>{items.length}</Badge>
                </div>

                {items.map((application) => {
                  const nextStage = PIPELINE_STAGES[PIPELINE_STAGES.indexOf(stage) + 1];
                  return (
                    <div key={application.id} className="pipeline__card">
                      <div style={{ fontWeight: 600 }}>
                        {application.candidate.firstName} {application.candidate.lastName}
                      </div>
                      <div className="subtle truncate">{application.candidate.currentTitle ?? '—'}</div>
                      <div className="subtle">{application.posting.title}</div>
                      {application.candidate.expectedSalary && (
                        <div className="subtle">
                          คาดหวัง {formatMoney(application.candidate.expectedSalary)}
                        </div>
                      )}
                      <div className="subtle" style={{ marginTop: 4 }}>
                        สมัคร {formatRelative(application.appliedAt)}
                      </div>

                      {canManage && nextStage && (
                        <Button
                          size="sm"
                          variant="secondary"
                          style={{ marginTop: 8, width: '100%' }}
                          loading={moveStage.isPending && moveStage.variables?.id === application.id}
                          onClick={() => moveStage.mutate({ id: application.id, stage: nextStage })}
                        >
                          → {applicationStageLabels[nextStage]}
                        </Button>
                      )}
                    </div>
                  );
                })}

                {items.length === 0 && (
                  <div className="subtle" style={{ padding: 8, textAlign: 'center' }}>
                    ว่าง
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
