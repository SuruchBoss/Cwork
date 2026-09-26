// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  authPlainPayload,
  base64Body,
  buildMessage,
  classifyReply,
  dotStuff,
  encodeHeaderWord,
  parseReply,
} from './smtp-protocol';

describe('SMTP replies', () => {
  it('waits for the last line of a multi-line reply', () => {
    // EHLO answers with one line per extension. Treating the first as the whole
    // reply means sending MAIL FROM into the middle of the greeting.
    const partial = '250-smtp.example.com\r\n250-PIPELINING\r\n250-STARTTLS\r\n';

    expect(parseReply(partial)).toBeNull();
    expect(parseReply(`${partial}250 AUTH PLAIN LOGIN`)).toEqual({
      code: 250,
      text: 'smtp.example.com\nPIPELINING\nSTARTTLS\nAUTH PLAIN LOGIN',
    });
  });

  it('reads a single-line reply', () => {
    expect(parseReply('220 smtp.example.com ESMTP\r\n')).toEqual({
      code: 220,
      text: 'smtp.example.com ESMTP',
    });
  });

  it('returns nothing for a reply that has not arrived yet', () => {
    expect(parseReply('')).toBeNull();
    expect(parseReply('22')).toBeNull();
  });

  it('tells a mailbox that is full apart from one that does not exist', () => {
    // The difference between retrying for four hours and giving up now.
    expect(classifyReply(250)).toBe('ok');
    expect(classifyReply(354)).toBe('ok');
    expect(classifyReply(421)).toBe('transient');
    expect(classifyReply(452)).toBe('transient');
    expect(classifyReply(550)).toBe('permanent');
    expect(classifyReply(553)).toBe('permanent');
  });
});

describe('message encoding', () => {
  it('leaves an ASCII header alone', () => {
    expect(encodeHeaderWord('Payslip ready')).toBe('Payslip ready');
  });

  it('encodes a Thai subject as an RFC 2047 word', () => {
    // Every subject this system sends is Thai, so an un-encoded header is not
    // an edge case — it is every message.
    const encoded = encodeHeaderWord('คำขอลาได้รับการอนุมัติ');

    expect(encoded).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    const payload = encoded.slice('=?UTF-8?B?'.length, -'?='.length);
    expect(Buffer.from(payload, 'base64').toString('utf8')).toBe('คำขอลาได้รับการอนุมัติ');
  });

  it('wraps base64 at 76 characters, as RFC 2045 asks', () => {
    const lines = base64Body('ก'.repeat(500)).split('\r\n');

    expect(lines.every((line) => line.length <= 76)).toBe(true);
    expect(Buffer.from(lines.join(''), 'base64').toString('utf8')).toBe('ก'.repeat(500));
  });

  it('doubles a leading dot so the body is not cut short', () => {
    // A single dot on its own line ends DATA. Without this the message stops
    // there — silently, and only for the bodies unlucky enough to contain one.
    expect(dotStuff('hello\r\n.\r\nworld')).toBe('hello\r\n..\r\nworld');
    expect(dotStuff('.hidden\r\nplain')).toBe('..hidden\r\nplain');
    expect(dotStuff('no dots here')).toBe('no dots here');
  });

  it('builds AUTH PLAIN as NUL-separated credentials', () => {
    const payload = authPlainPayload('robot@cwork.example', 'hunter2');

    expect(Buffer.from(payload, 'base64').toString('utf8')).toBe('\0robot@cwork.example\0hunter2');
  });
});

describe('buildMessage', () => {
  const message = buildMessage({
    from: { name: 'Cwork', address: 'no-reply@cwork.example' },
    to: 'somchai@cwork.example',
    subject: 'คำขอลาได้รับการอนุมัติ',
    text: 'ลาป่วย 2 วัน',
    html: '<p>ลาป่วย 2 วัน</p>',
    messageIdDomain: 'cwork.example',
    date: new Date('2026-09-15T03:00:00Z'),
    headers: { 'List-Unsubscribe': '<https://cwork.example/u/abc>' },
  });

  it('uses CRLF line endings throughout', () => {
    // A bare LF is what makes a message that works in testing and is rejected
    // by a real MTA.
    expect(message.includes('\n')).toBe(true);
    expect(message.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('separates headers from the body with a blank line', () => {
    const [head] = message.split('\r\n\r\n');

    expect(head).toContain('From: Cwork <no-reply@cwork.example>');
    expect(head).toContain('Subject: =?UTF-8?B?');
    expect(head).toContain('To: somchai@cwork.example');
    expect(head).toContain('Date: Tue, 15 Sep 2026 03:00:00 +0000');
    expect(head).toContain('List-Unsubscribe: <https://cwork.example/u/abc>');
  });

  it('sends both a text and an HTML part, and closes the boundary', () => {
    const boundary = /boundary="(cwork-[^"]+)"/.exec(message)?.[1];

    expect(boundary).toBeDefined();
    expect(message).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(message).toContain('Content-Type: text/html; charset=UTF-8');
    expect(message.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });

  it('carries the Thai body through base64 intact', () => {
    const parts = message.split(/--cwork-[0-9a-f-]+\r\n/);
    const decoded = parts
      .slice(1)
      .map((part) => Buffer.from(part.split('\r\n\r\n')[1] ?? '', 'base64').toString('utf8'));

    expect(decoded[0]).toContain('ลาป่วย 2 วัน');
    expect(decoded[1]).toContain('<p>ลาป่วย 2 วัน</p>');
  });

  it('gives every message a unique id', () => {
    const second = buildMessage({
      from: { address: 'no-reply@cwork.example' },
      to: 'somchai@cwork.example',
      subject: 'x',
      text: 'x',
      html: 'x',
      messageIdDomain: 'cwork.example',
    });

    const idOf = (m: string) => /Message-ID: (<[^>]+>)/.exec(m)?.[1];
    expect(idOf(message)).toBeDefined();
    expect(idOf(message)).not.toBe(idOf(second));
  });
});
