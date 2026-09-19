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
import { useT } from '@/lib/i18n/useT';
import { statusTone } from '@/lib/labels';
import type { KnowledgeDocumentSummary } from '@/types/api';

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const t = useT();
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
        title={t('HR knowledge base')}
        description={t(
          'The policies the AI assistant answers from — it will not answer on anything not here',
        )}
        actions={
          <Button variant="primary" onClick={() => setCreating((v) => !v)}>
            + {t('Add document')}
          </Button>
        }
      />

      <div className="alert alert--info">
        {t(
          'The assistant answers only from the documents published here, and says it is not in company policy when it has nothing rather than guessing — complete documents are what make the answers trustworthy',
        )}
      </div>

      {creating && (
        <Card title={t('Add a policy document')}>
          <div className="stack">
            <div className="toolbar">
              <Field label={t('Document title')}>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={t('e.g. Annual leave policy')}
                />
              </Field>
              <Field label={t('Category')}>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder={t('e.g. Leave')}
                />
              </Field>
            </div>
            <Field
              label={t('Content')}
              hint={t('Markdown supported — split into chunks by paragraph for search')}
            >
              <Textarea
                rows={12}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={t('# Annual leave policy\n\nEmployees are entitled…')}
              />
            </Field>
            <div className="row">
              <Button
                variant="primary"
                loading={create.isPending}
                disabled={!form.title.trim() || !form.content.trim()}
                onClick={() => create.mutate()}
              >
                {t('Save and publish')}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                {t('Cancel')}
              </Button>
            </div>
            {create.isError && (
              <div className="alert alert--danger">
                {create.error instanceof Error ? create.error.message : t('Could not save')}
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
                  <th>{t('Document title')}</th>
                  <th>{t('Category')}</th>
                  <th className="num">{t('Version')}</th>
                  <th className="num">{t('Chunks')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Last edited')}</th>
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
                        {t('Archive')}
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
            title={t('No policy documents yet')}
            description={t('Add company policies so the assistant can answer employee questions')}
          />
        )}
      </Card>
    </div>
  );
}
