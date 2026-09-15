import { destinationFor, subjectFor } from './delivery-rules';

export interface TemplateInput {
  type: string;
  title: string;
  body: string;
  recipientName?: string;
  /** Root of the console, no trailing slash. */
  webUrl: string;
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  actionUrl: string;
}

/** Everything a browser will render, so nothing depends on loading a stylesheet. */
const STYLE = [
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans Thai",sans-serif',
  'line-height:1.6',
  'color:#1f2933',
].join(';');

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * One layout for every notification, rather than a template per type.
 *
 * The title and body are already written, in Thai, by the code that knows what
 * happened — a leave approval says which dates and which type. Rewriting them
 * here would mean eleven templates to keep in step with eleven call sites, and
 * the first one to drift would be the one nobody notices. What the email adds
 * is what the in-app notification cannot: a subject line that sorts, and a link
 * back to the thing itself.
 */
export function renderEmail(input: TemplateInput): RenderedEmail {
  const actionUrl = `${input.webUrl}${destinationFor(input.type)}`;
  const greeting = input.recipientName ? `สวัสดีคุณ${input.recipientName}` : 'สวัสดีครับ';

  const text = [
    greeting,
    '',
    input.title,
    input.body,
    '',
    `เปิดดูในระบบ: ${actionUrl}`,
    '',
    '—',
    'อีเมลฉบับนี้ส่งจากระบบ Cwork โดยอัตโนมัติ กรุณาอย่าตอบกลับ',
    `ไม่ต้องการรับอีเมลแจ้งเตือน: ${input.unsubscribeUrl}`,
  ].join('\r\n');

  const html = [
    `<div style="${STYLE}">`,
    `<p>${escapeHtml(greeting)}</p>`,
    `<h2 style="font-size:18px;margin:16px 0 8px">${escapeHtml(input.title)}</h2>`,
    `<p style="margin:0 0 20px">${escapeHtml(input.body)}</p>`,
    `<p><a href="${escapeHtml(actionUrl)}" style="background:#1f6feb;color:#fff;`,
    'padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">',
    'เปิดดูในระบบ</a></p>',
    '<hr style="border:none;border-top:1px solid #e4e7eb;margin:24px 0">',
    '<p style="font-size:12px;color:#616e7c">',
    'อีเมลฉบับนี้ส่งจากระบบ Cwork โดยอัตโนมัติ กรุณาอย่าตอบกลับ<br>',
    `<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#616e7c">`,
    'ไม่ต้องการรับอีเมลแจ้งเตือน</a>',
    '</p>',
    '</div>',
  ].join('');

  return { subject: subjectFor(input.type, input.title), text, html, actionUrl };
}
