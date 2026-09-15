import { escapeHtml, renderEmail } from './email-template';

const base = {
  type: 'leave.approved',
  title: 'คำขอลาได้รับการอนุมัติ',
  body: 'ลาป่วย 15-16 ก.ย. 2569',
  webUrl: 'https://hr.example.com',
  unsubscribeUrl: 'https://hr.example.com/api/v1/notifications/unsubscribe/abc.def',
};

describe('renderEmail', () => {
  it('links to the part of the console the notification is about', () => {
    const email = renderEmail(base);

    expect(email.actionUrl).toBe('https://hr.example.com/leave');
    expect(email.html).toContain('https://hr.example.com/leave');
    expect(email.text).toContain('https://hr.example.com/leave');
  });

  it('tags the subject and keeps the original title', () => {
    expect(renderEmail({ ...base, type: 'payslip.published' }).subject).toBe(
      '[สลิปเงินเดือน] คำขอลาได้รับการอนุมัติ',
    );
  });

  it('greets by name when there is one, and politely when there is not', () => {
    expect(renderEmail({ ...base, recipientName: 'สมชาย' }).text).toContain('สวัสดีคุณสมชาย');
    expect(renderEmail(base).text).toContain('สวัสดีครับ');
  });

  it('puts an unsubscribe link in both parts', () => {
    // A bulk email without one is a bulk email that gets the domain filtered.
    const email = renderEmail(base);

    expect(email.text).toContain(base.unsubscribeUrl);
    expect(email.html).toContain(base.unsubscribeUrl);
  });

  it('escapes a title that contains markup', () => {
    // Titles are assembled from user-supplied text — a leave comment, a file
    // name — so the HTML part is an injection sink unless it is escaped.
    const email = renderEmail({
      ...base,
      title: '<img src=x onerror=alert(1)>',
      body: 'ไฟล์ "a&b" ถูกปฏิเสธ',
    });

    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(email.html).toContain('a&amp;b');
    // The text part is not markup, so it keeps the characters as written.
    expect(email.text).toContain('<img src=x onerror=alert(1)>');
  });

  it('uses CRLF in the text part, as a mail body must', () => {
    expect(renderEmail(base).text).toContain('\r\n');
  });
});

describe('escapeHtml', () => {
  it('covers every character that can end an attribute or a tag', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});
