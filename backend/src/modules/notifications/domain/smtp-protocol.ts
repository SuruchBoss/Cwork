import { randomUUID } from 'node:crypto';

/**
 * The parts of SMTP and RFC 5322 this needs, as pure functions.
 *
 * Written out rather than pulled in, for the same reason the clamd client was:
 * what is actually needed here is a few hundred lines of a well-specified
 * protocol, and the tests can be the RFC's own examples. The socket
 * conversation lives in `SmtpClient`; everything here is text in, text out.
 */

/** A reply line: `250-EXTENSION` continues, `250 TEXT` ends the reply. */
export interface SmtpReply {
  code: number;
  text: string;
}

/**
 * Parses a complete reply, which may span several lines (RFC 5321 §4.2.1).
 *
 * Returns `null` while the reply is still incomplete, so a caller can keep
 * feeding it socket data without counting lines itself.
 */
export function parseReply(buffer: string): SmtpReply | null {
  const lines = buffer.split('\r\n').filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const last = lines[lines.length - 1];
  // A final line is `NNN<space>`; `NNN-` means more is coming.
  if (!/^\d{3} /.test(last)) return null;

  return {
    code: Number(last.slice(0, 3)),
    text: lines.map((line) => line.slice(4)).join('\n'),
  };
}

export type ReplyKind = 'ok' | 'transient' | 'permanent';

/**
 * What a reply code means for a retry.
 *
 * The distinction is the whole reason a bounce is not tried eight times: 4xx is
 * "not now" — a full mailbox, a greylist, a server being restarted — and 5xx is
 * "not ever", because the address does not exist and will not start existing.
 */
export function classifyReply(code: number): ReplyKind {
  if (code >= 200 && code < 400) return 'ok';
  if (code >= 400 && code < 500) return 'transient';
  return 'permanent';
}

/**
 * RFC 2047 encoded word, for a header that is not plain ASCII.
 *
 * Every subject this sends is Thai, so without it the subject line arrives as
 * mojibake in any client that takes the RFC at its word.
 */
export function encodeHeaderWord(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** Base64 in 76-character lines, as RFC 2045 requires of a message body. */
export function base64Body(value: string): string {
  const encoded = Buffer.from(value, 'utf8').toString('base64');
  return (encoded.match(/.{1,76}/g) ?? []).join('\r\n');
}

/**
 * Escapes a line that begins with a dot.
 *
 * `.` alone on a line ends the DATA command, so a body line starting with one
 * has to be doubled or the message is cut short there — silently, and only for
 * the messages unlucky enough to contain it.
 */
export function dotStuff(body: string): string {
  return body
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

/** `AUTH PLAIN` credentials: NUL, username, NUL, password — base64. */
export function authPlainPayload(username: string, password: string): string {
  return Buffer.from(`\0${username}\0${password}`, 'utf8').toString('base64');
}

export interface MessageInput {
  from: { name?: string; address: string };
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Host used in the Message-ID; anything stable and ours will do. */
  messageIdDomain: string;
  date?: Date;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
}

/**
 * A complete `multipart/alternative` message, CRLF throughout.
 *
 * Both parts are sent because both are wanted: the HTML for a person reading
 * mail in a browser, the text for everything else and for the spam filters
 * that treat an HTML-only message as a smell.
 */
export function buildMessage(input: MessageInput): string {
  const boundary = `cwork-${randomUUID()}`;
  const date = (input.date ?? new Date()).toUTCString().replace('GMT', '+0000');
  const from = input.from.name
    ? `${encodeHeaderWord(input.from.name)} <${input.from.address}>`
    : input.from.address;

  const headers: Record<string, string> = {
    From: from,
    To: input.to,
    Subject: encodeHeaderWord(input.subject),
    Date: date,
    'Message-ID': `<${randomUUID()}@${input.messageIdDomain}>`,
    'MIME-Version': '1.0',
    'Content-Type': `multipart/alternative; boundary="${boundary}"`,
    ...input.headers,
  };

  const head = Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\r\n');

  const part = (contentType: string, body: string): string =>
    [
      `--${boundary}`,
      `Content-Type: ${contentType}; charset=UTF-8`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Body(body),
      '',
    ].join('\r\n');

  return [
    head,
    '',
    part('text/plain', input.text),
    part('text/html', input.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
