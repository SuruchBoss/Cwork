// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * A stand-in for a mail relay that speaks the real SMTP conversation.
 *
 * Running a real MTA in CI to prove a socket is wired up correctly is a poor
 * trade. What is worth testing is our half: that the commands go out in the
 * order RFC 5321 asks for, that the message body is dot-stuffed and terminated,
 * and — the part that matters most — that a 5xx is not retried like a 4xx.
 */
import { createServer, type Server, type Socket } from 'node:net';

export type FakeSmtpBehaviour =
  /** Accept everything. The realistic default. */
  | { kind: 'accept' }
  /** Refuse the recipient with this code: 5xx is a bounce, 4xx is "not now". */
  | { kind: 'refuse-recipient'; code: number; text: string }
  /** Answer EHLO without advertising STARTTLS. */
  | { kind: 'no-starttls' }
  /** Accept the connection, then say nothing. */
  | { kind: 'silent' };

export interface ReceivedMessage {
  from: string;
  to: string;
  data: string;
}

export interface FakeSmtp {
  port: number;
  messages: ReceivedMessage[];
  behaviour: FakeSmtpBehaviour;
  close: () => Promise<void>;
}

export async function startFakeSmtp(
  behaviour: FakeSmtpBehaviour = { kind: 'accept' },
): Promise<FakeSmtp> {
  const messages: ReceivedMessage[] = [];
  const state: { behaviour: FakeSmtpBehaviour } = { behaviour };

  const server: Server = createServer((socket: Socket) => {
    let buffer = '';
    let inData = false;
    let data = '';
    let from = '';
    let to = '';

    const say = (line: string): void => void socket.write(`${line}\r\n`);

    if (state.behaviour.kind === 'silent') return;
    say('220 fake.cwork.test ESMTP ready');

    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;

      for (;;) {
        const end = buffer.indexOf('\r\n');
        if (end === -1) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push({ from, to, data });
            data = '';
            say('250 2.0.0 Ok: queued');
            continue;
          }
          // Undo the dot-stuffing, so a test sees the body as it was written.
          data += `${line.startsWith('..') ? line.slice(1) : line}\r\n`;
          continue;
        }

        handleCommand(line);
      }
    });

    function handleCommand(line: string): void {
      const command = line.split(' ')[0].toUpperCase();

      switch (command) {
        case 'EHLO':
          say('250-fake.cwork.test');
          say('250-PIPELINING');
          if (state.behaviour.kind !== 'no-starttls') say('250-STARTTLS');
          say('250 AUTH PLAIN LOGIN');
          return;
        case 'HELO':
          say('250 fake.cwork.test');
          return;
        case 'AUTH':
          say('235 2.7.0 Authentication successful');
          return;
        case 'MAIL':
          from = extractAddress(line);
          say('250 2.1.0 Ok');
          return;
        case 'RCPT':
          to = extractAddress(line);
          if (state.behaviour.kind === 'refuse-recipient') {
            say(`${state.behaviour.code} ${state.behaviour.text}`);
            return;
          }
          say('250 2.1.5 Ok');
          return;
        case 'DATA':
          inData = true;
          say('354 End data with <CR><LF>.<CR><LF>');
          return;
        case 'QUIT':
          say('221 2.0.0 Bye');
          socket.end();
          return;
        default:
          say('502 5.5.2 Command not implemented');
      }
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fake smtp has no port');

  return {
    port: address.port,
    messages,
    get behaviour() {
      return state.behaviour;
    },
    set behaviour(next: FakeSmtpBehaviour) {
      state.behaviour = next;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function extractAddress(line: string): string {
  return /<([^>]*)>/.exec(line)?.[1] ?? '';
}

/** Pulls a base64 MIME part back out of a captured message. */
export function decodePart(message: string, contentType: string): string {
  const parts = message.split(/--cwork-[0-9a-f-]+/);
  const part = parts.find((candidate) => candidate.includes(`Content-Type: ${contentType}`));
  if (!part) return '';

  const body = part.split('\r\n\r\n').slice(1).join('\r\n\r\n');
  return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8');
}

/** Reads one header out of a captured message, decoding RFC 2047 if needed. */
export function header(message: string, name: string): string {
  const match = new RegExp(`^${name}: (.*)$`, 'm').exec(message.split('\r\n\r\n')[0]);
  const raw = match?.[1]?.trim() ?? '';
  const encoded = /^=\?UTF-8\?B\?(.*)\?=$/.exec(raw);
  return encoded ? Buffer.from(encoded[1], 'base64').toString('utf8') : raw;
}
