/**
 * A stand-in for clamd that speaks the real INSTREAM protocol.
 *
 * Installing ClamAV and its signature database into CI to prove that a socket
 * is wired up correctly is a poor trade. What is worth testing is *our* half:
 * that the payload is framed the way clamd expects, that a detection is
 * believed, and that a scanner which misbehaves never reads as a pass. This
 * server exercises all of that against the documented wire format — the format
 * itself is covered by unit tests in `clamav-protocol.spec.ts`.
 */
import { createServer, type Server, type Socket } from 'node:net';
import { eicarTestString } from 'src/modules/files/domain/clamav-protocol';

export type FakeClamdBehaviour =
  /** Detect EICAR, pass everything else. The realistic default. */
  | { kind: 'scan' }
  /** Reply with a clamd-level error, e.g. a size limit. */
  | { kind: 'error'; message: string }
  /** Accept the connection, then say nothing until the caller gives up. */
  | { kind: 'hang' }
  /** Reply with something no version of clamd would send. */
  | { kind: 'garbage' };

export interface FakeClamd {
  port: number;
  /** Payloads received, so a test can assert what was actually streamed. */
  received: Buffer[];
  behaviour: FakeClamdBehaviour;
  close: () => Promise<void>;
}

/** Pulls the content back out of an INSTREAM payload, frame by frame. */
function extractStreamedContent(payload: Buffer): Buffer {
  const commandEnd = payload.indexOf(0) + 1;
  let offset = commandEnd;
  const chunks: Buffer[] = [];

  while (offset + 4 <= payload.length) {
    const length = payload.readUInt32BE(offset);
    offset += 4;
    if (length === 0) break;
    chunks.push(payload.subarray(offset, offset + length));
    offset += length;
  }
  return Buffer.concat(chunks);
}

export async function startFakeClamd(
  behaviour: FakeClamdBehaviour = { kind: 'scan' },
): Promise<FakeClamd> {
  const received: Buffer[] = [];
  const state: { behaviour: FakeClamdBehaviour } = { behaviour };

  const server: Server = createServer((socket: Socket) => {
    const parts: Buffer[] = [];

    socket.on('data', (chunk: Buffer) => {
      parts.push(chunk);
      const payload = Buffer.concat(parts);

      if (payload.toString('ascii').startsWith('zPING\0')) {
        socket.end('PONG\0');
        return;
      }
      // Wait for the four zero bytes that end the stream.
      if (!payload.subarray(-4).equals(Buffer.from([0, 0, 0, 0]))) return;

      received.push(payload);

      switch (state.behaviour.kind) {
        case 'hang':
          return;
        case 'error':
          socket.end(`${state.behaviour.message} ERROR\0`);
          return;
        case 'garbage':
          socket.end('something entirely unexpected\0');
          return;
        case 'scan': {
          const content = extractStreamedContent(payload).toString('binary');
          socket.end(
            content.includes(eicarTestString())
              ? 'stream: Eicar-Test-Signature FOUND\0'
              : 'stream: OK\0',
          );
        }
      }
    });

    socket.on('error', () => {
      // A client that hangs up mid-scan is normal; nothing to do.
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address === 'string' || address === null) {
    throw new Error('fake clamd did not bind to a port');
  }

  return {
    port: address.port,
    received,
    get behaviour() {
      return state.behaviour;
    },
    set behaviour(next: FakeClamdBehaviour) {
      state.behaviour = next;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
