import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { PermanentDeliveryError } from '../../core/outbox/delivery-error';
import {
  authPlainPayload,
  buildMessage,
  classifyReply,
  dotStuff,
  parseReply,
  type MessageInput,
  type SmtpReply,
} from './domain/smtp-protocol';

export type OutgoingMessage = Omit<MessageInput, 'messageIdDomain'>;

/**
 * An SMTP client, written against RFC 5321 rather than pulled in.
 *
 * The same trade as the clamd client: what is needed is one well-specified
 * conversation — greeting, EHLO, STARTTLS, AUTH, MAIL FROM, RCPT TO, DATA — and
 * the wire format is covered by unit tests in `domain/smtp-protocol.spec.ts`.
 * A mail library brings a transport abstraction, a template engine and a
 * dependency tree, for a system that sends one kind of message to one relay.
 *
 * Every failure is classified before it leaves here, because the outbox behaves
 * completely differently for the two kinds: a 4xx is a relay having a bad
 * afternoon and is worth eight tries, a 5xx is an address that does not exist
 * and is worth none.
 */
@Injectable()
export class SmtpClient {
  private readonly logger = new Logger(SmtpClient.name);

  constructor(@Inject(APP_CONFIG) private readonly config: RootConfig) {}

  get enabled(): boolean {
    return this.config.delivery.email.enabled;
  }

  async send(message: OutgoingMessage): Promise<void> {
    const { email } = this.config.delivery;
    const session = new SmtpSession(email, this.logger);

    try {
      await session.open();
      await session.deliver(
        buildMessage({
          ...message,
          messageIdDomain: email.fromAddress.split('@')[1] ?? 'cwork.local',
        }),
        email.fromAddress,
        message.to,
      );
    } finally {
      session.close();
    }
  }
}

type EmailConfig = RootConfig['delivery']['email'];

/**
 * One connection, one message.
 *
 * Deliberately not pooled: a nightly payroll run sends a few hundred messages
 * and a connection per message costs a handshake nobody will notice, whereas a
 * pooled connection that has gone stale costs a message that looks sent.
 */
class SmtpSession {
  private socket?: Socket | TLSSocket;
  private buffer = '';
  private waiting?: { resolve: (reply: SmtpReply) => void; reject: (error: Error) => void };

  constructor(
    private readonly config: EmailConfig,
    private readonly logger: Logger,
  ) {}

  async open(): Promise<void> {
    this.socket = await this.connect();
    this.listen();

    await this.expect(await this.read(), [220], 'greeting');
    const greeting = await this.command(`EHLO ${hostnameFor(this.config.fromAddress)}`, [250]);

    if (this.config.security === 'starttls') {
      if (!/\bSTARTTLS\b/i.test(greeting.text)) {
        // Refusing is the point. Continuing would send the password in the
        // clear, which is exactly what the setting asked us not to do.
        throw new Error('SMTP_SECURITY=starttls but the server does not offer STARTTLS');
      }
      await this.command('STARTTLS', [220]);
      await this.upgrade();
      await this.command(`EHLO ${hostnameFor(this.config.fromAddress)}`, [250]);
    }

    if (this.config.username) {
      await this.command(
        `AUTH PLAIN ${authPlainPayload(this.config.username, this.config.password ?? '')}`,
        [235],
        // A rejected password is not going to be accepted on the next attempt.
        { permanentOnFailure: true, redact: true },
      );
    }
  }

  async deliver(message: string, from: string, to: string): Promise<void> {
    await this.command(`MAIL FROM:<${from}>`, [250]);
    await this.command(`RCPT TO:<${to}>`, [250, 251]);
    await this.command('DATA', [354]);

    this.write(`${dotStuff(message)}\r\n.\r\n`);
    await this.expect(await this.read(), [250], 'message body');

    // Politeness rather than necessity — but a relay that logs unclosed
    // sessions as errors is a relay whose owner will eventually ask about it.
    try {
      await this.command('QUIT', [221]);
    } catch {
      /* the message is already accepted; how the goodbye went does not matter */
    }
  }

  close(): void {
    this.socket?.destroy();
    this.socket = undefined;
  }

  // ---------------------------------------------------------------- internals

  private connect(): Promise<Socket | TLSSocket> {
    const { host, port, security, timeoutMs } = this.config;

    return new Promise((resolve, reject) => {
      const socket =
        security === 'tls'
          ? tlsConnect({ host, port, servername: host })
          : netConnect({ host, port });

      const fail = (error: Error): void => {
        socket.destroy();
        reject(error);
      };

      socket.setTimeout(timeoutMs, () => fail(new Error(`SMTP connection to ${host} timed out`)));
      socket.once('error', fail);
      socket.once(security === 'tls' ? 'secureConnect' : 'connect', () => resolve(socket));
    });
  }

  /** Swaps the plain socket for a TLS one after the server agrees to STARTTLS. */
  private async upgrade(): Promise<void> {
    const plain = this.socket;
    if (!plain) throw new Error('SMTP session is not open');

    plain.removeAllListeners('data');
    this.buffer = '';

    this.socket = await new Promise<TLSSocket>((resolve, reject) => {
      const secure = tlsConnect({ socket: plain, servername: this.config.host }, () =>
        resolve(secure),
      );
      secure.once('error', reject);
    });
    this.socket.setTimeout(this.config.timeoutMs);
    this.listen();
  }

  private listen(): void {
    const socket = this.socket;
    if (!socket) return;

    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      const reply = parseReply(this.buffer);
      if (reply && this.waiting) {
        this.buffer = '';
        const { resolve } = this.waiting;
        this.waiting = undefined;
        resolve(reply);
      }
    });
    socket.on('timeout', () => this.fail(new Error('SMTP server stopped responding')));
    socket.on('error', (error: Error) => this.fail(error));
    socket.on('close', () => this.fail(new Error('SMTP connection closed unexpectedly')));
  }

  private fail(error: Error): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting?.reject(error);
  }

  private write(data: string): void {
    if (!this.socket) throw new Error('SMTP session is not open');
    this.socket.write(data);
  }

  private read(): Promise<SmtpReply> {
    return new Promise((resolve, reject) => {
      const ready = parseReply(this.buffer);
      if (ready) {
        this.buffer = '';
        resolve(ready);
        return;
      }
      this.waiting = { resolve, reject };
    });
  }

  private async command(
    line: string,
    accept: number[],
    options: { permanentOnFailure?: boolean; redact?: boolean } = {},
  ): Promise<SmtpReply> {
    const shown = options.redact ? `${line.split(' ').slice(0, 2).join(' ')} …` : line;
    this.logger.debug(`> ${shown}`);
    this.write(`${line}\r\n`);
    return this.expect(await this.read(), accept, shown, options.permanentOnFailure);
  }

  private expect(
    reply: SmtpReply,
    accept: number[],
    what: string,
    permanentOnFailure = false,
  ): SmtpReply {
    this.logger.debug(`< ${reply.code} ${reply.text.split('\n')[0]}`);
    if (accept.includes(reply.code)) return reply;

    const message = `SMTP ${what} refused: ${reply.code} ${reply.text.split('\n')[0]}`;
    if (permanentOnFailure || classifyReply(reply.code) === 'permanent') {
      throw new PermanentDeliveryError(message);
    }
    throw new Error(message);
  }
}

/** EHLO wants a domain, and the sender's is the only one we can honestly claim. */
function hostnameFor(fromAddress: string): string {
  return fromAddress.split('@')[1] ?? 'localhost';
}
