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
  Input,
  PageHeader,
  TableSkeleton,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { statusTone } from '@/lib/labels';
import type { KnowledgeDocumentSummary } from '@/types/api';

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', category: '', content: '' });

  const documents = useQuery({
    queryKey: qk.knowledgeDocuments(),
    queryFn: () => api.get<KnowledgeDocumentSummary[]>('/assistant/knowledge'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/assistant/knowledge', { ...form, publish: true }),
    onSuccess: () => {
      setCreating(false);
      setForm({ title: '', category: '', content: '' });
      void queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/assistant/knowledge/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  });

  return (
    <div className="page">
      <PageHeader
        title="ฐานความรู้ HR"
        description="ระเบียบที่ผู้ช่วย AI ใช้ตอบคำถาม — ผู้ช่วยจะไม่ตอบนโยบายที่ไม่มีในนี้"
        actions={
          <Button variant="primary" onClick={() => setCreating((v) => !v)}>
            + เพิ่มเอกสาร
          </Button>
        }
      />

      <div className="alert alert--info">
        ผู้ช่วยถูกกำหนดให้ตอบเฉพาะจากเอกสารที่เผยแพร่ในหน้านี้ และจะบอกว่า “ไม่พบในระเบียบบริษัท”
        เมื่อไม่มีข้อมูล แทนการเดา — เอกสารที่ครบถ้วนคือสิ่งที่ทำให้คำตอบเชื่อถือได้
      </div>

      {creating && (
        <Card title="เพิ่มเอกสารนโยบาย">
          <div className="stack">
            <div className="toolbar">
              <Field label="ชื่อเอกสาร">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="เช่น ระเบียบการลาพักร้อน"
                />
              </Field>
              <Field label="หมวดหมู่">
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="เช่น การลา"
                />
              </Field>
            </div>
            <Field
              label="เนื้อหา"
              hint="รองรับ Markdown — ระบบจะแบ่งเป็นท่อน ๆ ตามย่อหน้าเพื่อใช้ค้นหา"
            >
              <Textarea
                rows={12}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="# ระเบียบการลาพักร้อน&#10;&#10;พนักงานมีสิทธิ…"
              />
            </Field>
            <div className="row">
              <Button
                variant="primary"
                loading={create.isPending}
                disabled={!form.title.trim() || !form.content.trim()}
                onClick={() => create.mutate()}
              >
                บันทึกและเผยแพร่
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                ยกเลิก
              </Button>
            </div>
            {create.isError && (
              <div className="alert alert--danger">
                {create.error instanceof Error ? create.error.message : 'บันทึกไม่สำเร็จ'}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card flush>
        {documents.isLoading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : documents.isError ? (
          <ErrorState error={documents.error} onRetry={() => void documents.refetch()} />
        ) : documents.data && documents.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ชื่อเอกสาร</th>
                  <th>หมวดหมู่</th>
                  <th className="num">เวอร์ชัน</th>
                  <th className="num">ท่อนข้อมูล</th>
                  <th>สถานะ</th>
                  <th>แก้ไขล่าสุด</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {documents.data.map((doc) => (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 500 }}>{doc.title}</td>
                    <td>{doc.category ?? '—'}</td>
                    <td className="num">v{doc.version}</td>
                    <td className="num">{doc._count.chunks}</td>
                    <td>
                      <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
                    </td>
                    <td className="subtle">{formatDateTime(doc.updatedAt)}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={archive.isPending && archive.variables === doc.id}
                        onClick={() => archive.mutate(doc.id)}
                      >
                        เก็บเข้าคลัง
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="◫"
            title="ยังไม่มีเอกสารนโยบาย"
            description="เพิ่มระเบียบบริษัทเพื่อให้ผู้ช่วยตอบคำถามพนักงานได้"
          />
        )}
      </Card>
    </div>
  );
}
