import { buildSystemPrompt, redactSensitive, screenUserMessage } from './guardrails';

const context = {
  employeeName: 'สมชาย ใจดี',
  employeeCode: 'EMP-2026-00001',
  position: 'วิศวกรซอฟต์แวร์',
  department: 'ฝ่ายวิศวกรรม',
  hireDate: '2024-01-15',
  isManager: false,
  organizationName: 'MarMa Co., Ltd.',
  locale: 'th',
  today: '2026-09-15',
  timezone: 'Asia/Bangkok',
};

describe('buildSystemPrompt', () => {
  it('includes the employee context so tools do not have to restate it', () => {
    const prompt = buildSystemPrompt(context, 'นโยบายลาพักร้อน: 10 วันต่อปี');

    expect(prompt).toContain('สมชาย ใจดี');
    expect(prompt).toContain('EMP-2026-00001');
    expect(prompt).toContain('นโยบายลาพักร้อน: 10 วันต่อปี');
  });

  it('tells the model to refuse rather than invent policy', () => {
    const prompt = buildSystemPrompt(context, '');
    expect(prompt).toContain('ห้ามเดาหรือแต่งนโยบายขึ้นเอง');
  });

  it('warns when the knowledge base is empty', () => {
    const prompt = buildSystemPrompt(context, '');
    expect(prompt).toContain('ยังไม่มีเอกสารนโยบายในระบบ');
  });

  it('switches language instruction for English users', () => {
    const prompt = buildSystemPrompt({ ...context, locale: 'en' }, '');
    expect(prompt).toContain('Answer in English');
  });
});

describe('screenUserMessage', () => {
  it('allows ordinary HR questions', () => {
    expect(screenUserMessage('ขอดูวันลาคงเหลือหน่อย').allowed).toBe(true);
    expect(screenUserMessage('How many annual leave days do I have?').allowed).toBe(true);
  });

  it('escalates crisis language to a human with a helpline', () => {
    const verdict = screenUserMessage('ผมรู้สึกอยากตาย ทำงานไม่ไหวแล้ว');

    expect(verdict.allowed).toBe(false);
    expect(verdict.replacementReply).toContain('1323');
    expect(verdict.reason).toBe('CRISIS_OR_HARASSMENT_TOPIC');
  });

  it('escalates harassment reports to a human', () => {
    const verdict = screenUserMessage('I want to report sexual harassment by my manager');
    expect(verdict.allowed).toBe(false);
  });
});

describe('redactSensitive', () => {
  it('masks a Thai national ID', () => {
    expect(redactSensitive('เลขบัตร 1-2345-67890-12-3 ครับ')).toContain('[เลขบัตรประชาชน]');
  });

  it('masks a bank account but keeps the last four digits', () => {
    expect(redactSensitive('โอนเข้า 1234567890')).toContain('***7890');
  });

  it('leaves ordinary text untouched', () => {
    const text = 'คุณมีวันลาคงเหลือ 6.5 วัน';
    expect(redactSensitive(text)).toBe(text);
  });
});
