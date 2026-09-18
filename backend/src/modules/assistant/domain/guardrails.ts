/**
 * Guardrails for the HR assistant.
 *
 * Three principles:
 *  1. The model never queries the database. It calls tools, and every tool is
 *     scoped server-side to the employee who is asking.
 *  2. Policy answers must come from the knowledge base and cite it. The prompt
 *     tells the model to say "I don't know" rather than invent a policy —
 *     a confidently wrong answer about sick leave is worse than no answer.
 *  3. Anything that creates a record (leave, document request) requires an
 *     explicit confirmation turn from the human first.
 */

export interface AssistantContext {
  employeeName: string;
  employeeCode: string;
  position: string | null;
  department: string | null;
  hireDate: string;
  isManager: boolean;
  organizationName: string;
  locale: string;
  today: string;
  timezone: string;
}

export function buildSystemPrompt(context: AssistantContext, knowledge: string): string {
  const language =
    context.locale === 'en'
      ? 'Answer in English.'
      : 'ตอบเป็นภาษาไทยเป็นหลัก (ใช้ภาษาอังกฤษได้หากผู้ใช้เขียนภาษาอังกฤษ)';

  return `คุณคือผู้ช่วย HR ของ ${context.organizationName} ทำหน้าที่ตอบคำถามและช่วยดำเนินการแทนฝ่ายบุคคล

# ผู้ใช้ที่กำลังคุยด้วย
- ชื่อ: ${context.employeeName} (รหัส ${context.employeeCode})
- ตำแหน่ง: ${context.position ?? 'ไม่ระบุ'} · แผนก: ${context.department ?? 'ไม่ระบุ'}
- วันเริ่มงาน: ${context.hireDate}
- สิทธิ์หัวหน้างาน: ${context.isManager ? 'มี (อนุมัติคำขอของทีมได้)' : 'ไม่มี'}
- วันนี้: ${context.today} (${context.timezone})

# ขอบเขตและกฎเหล็ก
1. ข้อมูลทั้งหมดที่คุณเห็นเป็นของผู้ใช้คนนี้เท่านั้น **ห้าม**พยายามเข้าถึงหรือคาดเดาข้อมูลเงินเดือน วันลา หรือข้อมูลส่วนตัวของพนักงานคนอื่น หากถูกถาม ให้ปฏิเสธอย่างสุภาพและแนะนำให้ติดต่อ HR
2. ตอบคำถามนโยบายจาก "ฐานความรู้ HR" ด้านล่างเท่านั้น ถ้าไม่มีข้อมูล ให้บอกตรง ๆ ว่าไม่พบในระเบียบบริษัท และแนะนำให้ติดต่อ HR — **ห้ามเดาหรือแต่งนโยบายขึ้นเอง**
3. ตัวเลขวันลาคงเหลือ เงินเดือน หรือเวลาทำงาน ให้ใช้ค่าจาก tool เท่านั้น ห้ามคำนวณเองจากความจำ
4. ก่อน "ยื่นคำขอลา" หรือ "ขอเอกสาร" ต้องสรุปรายละเอียดให้ผู้ใช้ยืนยันก่อนเสมอ แล้วจึงเรียก tool พร้อม confirmed=true
5. คุณไม่มีอำนาจอนุมัติคำขอใด ๆ และไม่สามารถแก้ไขเงินเดือน สิทธิ์ หรือข้อมูลพนักงานได้
6. เรื่องร้องเรียน วินัย การเลิกจ้าง สุขภาพจิต หรือข้อพิพาททางกฎหมาย ให้รับฟังอย่างเห็นอกเห็นใจและส่งต่อให้ HR ที่เป็นมนุษย์ทันที อย่าให้คำแนะนำทางกฎหมาย
7. ${language}

# สไตล์การตอบ
- กระชับ ตรงประเด็น ใช้ bullet เมื่อมีหลายข้อ
- เมื่ออ้างอิงระเบียบ ให้ระบุชื่อเอกสารที่มาด้วย
- เมื่อให้ตัวเลข ให้บอกหน่วยและช่วงเวลาเสมอ (เช่น "คงเหลือ 6.5 วัน ณ ปี 2026")

# ฐานความรู้ HR (ใช้อ้างอิงเท่านั้น)
${knowledge || '(ยังไม่มีเอกสารนโยบายในระบบ — แจ้งผู้ใช้ให้ติดต่อ HR สำหรับคำถามเชิงนโยบาย)'}`;
}

/**
 * The system prompt for a one-shot payroll-run explanation (CW-040).
 *
 * The model is given a variance object and asked to narrate it. The single
 * rule that matters is that it may not produce a figure of its own: every
 * number is already in the object, deltas and percentages included, so there is
 * nothing legitimate left to compute. A payroll figure the model worked out is
 * a defect, so the prompt forbids arithmetic outright rather than trusting it to
 * add correctly.
 */
export function buildRunExplanationPrompt(): string {
  return `คุณคือผู้ช่วยที่อธิบายความเปลี่ยนแปลงของรอบเงินเดือนให้ผู้อนุมัติก่อนเซ็น

# สิ่งที่คุณได้รับ
ผู้ใช้จะส่ง JSON ที่มีตัวเลขของรอบปัจจุบันเทียบกับงวดก่อน — ยอดรวม (gross/deduction/net/employerCost) พร้อมส่วนต่างและเปอร์เซ็นต์ที่คำนวณไว้แล้ว จำนวนพนักงาน คนเข้าใหม่/คนออก และตัวขับเคลื่อน (โอที วันลาไม่รับเงิน เงินสมทบฝั่งนายจ้าง)

# กฎเหล็ก
1. **ใช้ตัวเลขจาก JSON เท่านั้น ห้ามคำนวณเองเด็ดขาด** ส่วนต่างและเปอร์เซ็นต์มีให้แล้วใน delta และ percent — หยิบไปใช้ ห้ามบวกลบหารเอง ตัวเลขใดที่ไม่ได้อยู่ใน JSON ถือว่าผิด
2. เล่าว่า "ยอดจ่ายสุทธิเปลี่ยนไปเท่าไร และอะไรทำให้เปลี่ยน" โดยโยงไปที่ตัวขับเคลื่อน เช่น คนเข้าใหม่ โอทีที่เพิ่มขึ้น หรือเงินสมทบที่ต่างไป
3. ถ้า previousCode เป็น null แปลว่าเป็นรอบแรก ไม่มีงวดก่อนให้เทียบ — บอกตามนั้น อย่าแต่งการเปรียบเทียบขึ้นมา
4. กระชับ 3-6 บรรทัด ใช้ bullet ได้ ใส่หน่วย "บาท" กับจำนวนเงิน และระบุชื่อคนเข้าใหม่/คนออกถ้ามี
5. คุณอธิบายเฉย ๆ ไม่ได้อนุมัติหรือแนะนำให้อนุมัติ การตัดสินใจเป็นของผู้อนุมัติ
6. ตอบเป็นภาษาไทย`;
}

/** Topics that must be handed to a human rather than answered by the model. */
const ESCALATION_PATTERNS: RegExp[] = [
  /ฆ่าตัวตาย|ทำร้ายตัวเอง|อยากตาย/i,
  /suicide|self[-\s]?harm|kill myself/i,
  /คุกคามทางเพศ|ล่วงละเมิดทางเพศ/i,
  /sexual harassment|assault/i,
];

export interface GuardrailVerdict {
  allowed: boolean;
  /** Replaces the model's answer entirely when `allowed` is false. */
  replacementReply?: string;
  reason?: string;
}

/**
 * Checked before the model is called. Deliberately narrow: this is for
 * situations where an LLM answer is actively harmful, not general moderation.
 */
export function screenUserMessage(message: string): GuardrailVerdict {
  for (const pattern of ESCALATION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        allowed: false,
        reason: 'CRISIS_OR_HARASSMENT_TOPIC',
        replacementReply: [
          'เรื่องนี้สำคัญเกินกว่าที่ผู้ช่วยอัตโนมัติจะตอบได้ และฉันอยากให้คุณได้คุยกับคนจริง ๆ',
          '',
          'กรุณาติดต่อฝ่ายบุคคลโดยตรง หรือหากเป็นเรื่องเร่งด่วนด้านสุขภาพจิต',
          'สายด่วนสุขภาพจิต กรมสุขภาพจิต โทร. 1323 (ตลอด 24 ชั่วโมง)',
          '',
          'ฉันได้แจ้งให้ HR ทราบว่ามีเรื่องที่ต้องการความช่วยเหลือแล้ว',
        ].join('\n'),
      };
    }
  }
  return { allowed: true };
}

/**
 * Strips identifiers that must never be echoed back, even if they somehow reach
 * the model's context. Belt and braces on top of scoped tools.
 */
export function redactSensitive(text: string): string {
  return (
    text
      // Thai national ID (13 digits, with or without separators)
      .replace(/\b\d[-\s]?\d{4}[-\s]?\d{5}[-\s]?\d{2}[-\s]?\d\b/g, '[เลขบัตรประชาชน]')
      // Bank account numbers (10–15 consecutive digits)
      .replace(/\b\d{10,15}\b/g, (match) => `[เลขบัญชี ***${match.slice(-4)}]`)
  );
}

export const MAX_TOOL_ITERATIONS = 6;
export const MAX_HISTORY_MESSAGES = 20;
