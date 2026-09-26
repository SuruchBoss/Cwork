// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The clamd wire protocol, as far as scanning a buffer needs it.
 *
 * Implemented here rather than pulled in as a dependency, for the same reason
 * TOTP is: it is a short, stable, well-documented format, and the parts worth
 * getting right — framing and reply parsing — are pure functions that can be
 * tested without a socket or a virus.
 *
 * Reference: clamd(8), the INSTREAM and PING commands.
 */

/**
 * clamd takes commands prefixed `z` (NUL-terminated) or `n` (newline). `z` is
 * the one to use: a filename or signature containing a newline cannot confuse
 * the framing.
 */
export const INSTREAM_COMMAND = Buffer.from('zINSTREAM\0', 'ascii');
export const PING_COMMAND = Buffer.from('zPING\0', 'ascii');

/** 64 KiB. clamd's own default StreamMaxLength is far larger; this is just the
 * chunk size, chosen to keep memory flat without a syscall per kilobyte. */
export const DEFAULT_CHUNK_BYTES = 64 * 1024;

/** A zero-length chunk is what tells clamd the stream is finished. */
export const END_OF_STREAM = Buffer.from([0, 0, 0, 0]);

/** One INSTREAM chunk: a big-endian uint32 length, then that many bytes. */
export function frameChunk(chunk: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(chunk.length, 0);
  return Buffer.concat([header, chunk]);
}

/**
 * The complete byte sequence for scanning `content`: the command, the framed
 * chunks, and the terminator.
 */
export function buildInstreamPayload(
  content: Buffer,
  chunkBytes: number = DEFAULT_CHUNK_BYTES,
): Buffer {
  if (chunkBytes <= 0) throw new Error('chunkBytes must be positive');

  const parts: Buffer[] = [INSTREAM_COMMAND];
  for (let offset = 0; offset < content.length; offset += chunkBytes) {
    // A zero-length chunk mid-stream would be read as the terminator, so an
    // empty file must never produce one.
    parts.push(frameChunk(content.subarray(offset, offset + chunkBytes)));
  }
  parts.push(END_OF_STREAM);
  return Buffer.concat(parts);
}

export type ScanVerdict =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'error'; message: string };

/**
 * Parses a clamd reply.
 *
 * The three shapes that matter:
 *   `stream: OK`
 *   `stream: Eicar-Signature FOUND`
 *   `INSTREAM size limit exceeded. ERROR`
 *
 * Anything unrecognised is an error rather than a pass. Treating a reply we do
 * not understand as "clean" would turn every future protocol change into a
 * silent hole.
 */
export function parseScanReply(raw: string): ScanVerdict {
  const reply = raw.replace(/\0/g, '').trim();

  if (reply.length === 0) {
    return { status: 'error', message: 'clamd returned an empty reply' };
  }
  if (reply.endsWith('ERROR')) {
    return { status: 'error', message: reply.replace(/\s*ERROR$/, '') };
  }
  if (reply.endsWith('FOUND')) {
    // `stream: <signature> FOUND` — the signature is what is between them.
    const match = /^.*?:\s*(.+?)\s+FOUND$/.exec(reply);
    return { status: 'infected', signature: match?.[1] ?? 'unknown' };
  }
  if (/\bOK$/.test(reply)) {
    return { status: 'clean' };
  }
  return { status: 'error', message: `Unrecognised clamd reply: ${reply}` };
}

/** True when clamd answered a PING as it should. */
export function isPong(raw: string): boolean {
  return raw.replace(/\0/g, '').trim() === 'PONG';
}

/**
 * The EICAR anti-malware test string, assembled at run time.
 *
 * Kept in pieces on purpose: written out in full, this file would itself be
 * quarantined by any scanner watching the repository — which is precisely what
 * EICAR is designed to do, and exactly what you do not want happening to your
 * source tree.
 */
export function eicarTestString(): string {
  return ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-', 'ANTIVIRUS-TEST-FILE!$H+H*'].join('');
}
