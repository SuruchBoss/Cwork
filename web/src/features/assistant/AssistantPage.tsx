import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { qk } from '@/app/query-client';
import { Badge, Button, Card, EmptyState, PageHeader, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatRelative } from '@/lib/format';
import { usePlatformConfig } from '@/lib/platform';
import type { AssistantConversation, AssistantMessage, ChatResult } from '@/types/api';

const SUGGESTIONS = [
  'ฉันเหลือวันลาพักร้อนกี่วัน',
  'ขอลาป่วยต้องแนบใบรับรองแพทย์เมื่อไหร่',
  'อัตราค่าโอทีวันหยุดคิดยังไง',
  'ขอหนังสือรับรองการทำงานเพื่อยื่นวีซ่า',
  'เดือนนี้ฉันมาสายกี่ครั้ง',
];

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ documentId: string; title: string; chunkIndex: number }>;
  toolsUsed?: string[];
}

export default function AssistantPage() {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // The same flag the sidebar uses to decide whether to offer this screen at
  // all. Reachable anyway by a bookmark from before the assistant was switched
  // off, which is what the explanation further down is for.
  const { assistantEnabled } = usePlatformConfig();

  const conversations = useQuery({
    queryKey: qk.conversations,
    queryFn: () => api.get<AssistantConversation[]>('/assistant/conversations'),
    enabled: assistantEnabled,
  });

  const send = useMutation({
    mutationFn: (message: string) =>
      api.post<ChatResult>('/assistant/chat', { message, conversationId, channel: 'WEB' }),
    onSuccess: (result) => {
      setConversationId(result.conversationId);
      setTurns((current) => [
        ...current,
        {
          id: result.messageId || crypto.randomUUID(),
          role: 'assistant',
          content: result.reply,
          citations: result.citations,
          toolsUsed: result.toolsUsed,
        },
      ]);
      void queryClient.invalidateQueries({ queryKey: qk.conversations });
      // A chat turn can file a leave or document request, so refresh those too.
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) => {
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            error instanceof ApiError
              ? `ขออภัย เกิดข้อผิดพลาด: ${error.message}`
              : 'ขออภัย ไม่สามารถติดต่อผู้ช่วยได้ในขณะนี้',
        },
      ]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, send.isPending]);

  const submit = (message: string) => {
    const text = message.trim();
    if (!text || send.isPending) return;
    setTurns((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: text }]);
    setDraft('');
    send.mutate(text);
  };

  const openConversation = async (id: string) => {
    const conversation = await api.get<{ id: string; messages: AssistantMessage[] }>(
      `/assistant/conversations/${id}`,
    );
    setConversationId(conversation.id);
    setTurns(
      conversation.messages.map((message) => ({
        id: message.id,
        role: message.role === 'USER' ? 'user' : 'assistant',
        content: message.content,
        citations: message.citations,
      })),
    );
  };

  if (!assistantEnabled) {
    return (
      <div className="page">
        <PageHeader title="ผู้ช่วย HR" />
        <Card>
          <EmptyState
            icon="🔌"
            title="ผู้ช่วย HR ยังไม่เปิดใช้งาน"
            description="ตั้งค่า ASSISTANT_ENABLED และคีย์ของผู้ให้บริการโมเดลในไฟล์ .env ของ backend เพื่อเปิดใช้ ระบบ HRIS ส่วนอื่นทำงานได้ตามปกติโดยไม่ต้องใช้ AI"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="ผู้ช่วย HR"
        description="ถามเรื่องนโยบาย ตรวจสอบวันลา ยื่นใบลา หรือขอเอกสาร"
        actions={
          <Button
            onClick={() => {
              setConversationId(undefined);
              setTurns([]);
            }}
          >
            + เริ่มบทสนทนาใหม่
          </Button>
        }
      />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 260px' }}>
        <div className="chat">
          <div className="chat__messages" ref={scrollRef}>
            {turns.length === 0 && (
              <EmptyState
                icon="✦"
                title="ถามอะไรก็ได้เกี่ยวกับงาน HR"
                description="ผู้ช่วยตอบจากระเบียบของบริษัทที่บันทึกไว้ในระบบ และเห็นเฉพาะข้อมูลของคุณเท่านั้น"
              />
            )}

            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`chat__bubble chat__bubble--${turn.role}`}
              >
                {turn.content}
                {turn.citations && turn.citations.length > 0 && (
                  <div className="chat__citations">
                    <span>อ้างอิง:</span>
                    {turn.citations.map((citation) => (
                      <Badge key={`${citation.documentId}-${citation.chunkIndex}`} tone="neutral">
                        {citation.title}
                      </Badge>
                    ))}
                  </div>
                )}
                {turn.toolsUsed && turn.toolsUsed.length > 0 && (
                  <div className="chat__citations">
                    <span>เรียกใช้:</span>
                    {[...new Set(turn.toolsUsed)].map((tool) => (
                      <code key={tool} className="mono">
                        {tool}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {send.isPending && (
              <div className="chat__bubble chat__bubble--assistant">
                <span className="row" style={{ gap: 8 }}>
                  <span className="spinner" aria-hidden />
                  <span className="muted">กำลังคิด…</span>
                </span>
              </div>
            )}
          </div>

          {turns.length === 0 && (
            <div className="chat__suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chat__suggestion"
                  onClick={() => submit(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form
            className="chat__composer"
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter inserts a newline.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(draft);
                }
              }}
              placeholder="พิมพ์คำถาม…  (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
              rows={1}
            />
            <Button type="submit" variant="primary" loading={send.isPending} disabled={!draft.trim()}>
              ส่ง
            </Button>
          </form>
        </div>

        <Card title="บทสนทนาก่อนหน้า" flush>
          {conversations.data && conversations.data.length > 0 ? (
            <div className="stack stack--sm" style={{ padding: 8 }}>
              {conversations.data.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className="nav-link"
                  style={{ textAlign: 'left', border: 0, background: 'none', cursor: 'pointer' }}
                  onClick={() => void openConversation(conversation.id)}
                >
                  <span style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block', fontSize: 13 }}>
                      {conversation.title ?? 'บทสนทนาใหม่'}
                    </span>
                    <span className="subtle">{formatRelative(conversation.lastMessageAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="subtle" style={{ padding: 16 }}>
              ยังไม่มีบทสนทนา
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
