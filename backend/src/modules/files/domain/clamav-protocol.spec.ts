// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  buildInstreamPayload,
  DEFAULT_CHUNK_BYTES,
  eicarTestString,
  END_OF_STREAM,
  frameChunk,
  INSTREAM_COMMAND,
  isPong,
  parseScanReply,
} from './clamav-protocol';

describe('frameChunk', () => {
  it('prefixes a big-endian uint32 length', () => {
    const framed = frameChunk(Buffer.from('hello'));

    expect(framed.readUInt32BE(0)).toBe(5);
    expect(framed.subarray(4).toString()).toBe('hello');
  });

  it('handles a chunk at the top of the 16-bit range', () => {
    const framed = frameChunk(Buffer.alloc(70_000, 0x41));

    expect(framed.readUInt32BE(0)).toBe(70_000);
    expect(framed.length).toBe(70_004);
  });
});

describe('buildInstreamPayload', () => {
  it('opens with the command and closes with the terminator', () => {
    const payload = buildInstreamPayload(Buffer.from('abc'));

    expect(payload.subarray(0, INSTREAM_COMMAND.length).equals(INSTREAM_COMMAND)).toBe(true);
    expect(payload.subarray(-4).equals(END_OF_STREAM)).toBe(true);
  });

  it('splits a large file into chunks of the requested size', () => {
    const content = Buffer.alloc(2500, 0x42);

    const payload = buildInstreamPayload(content, 1000);

    // command + [1000][1000][500] + terminator
    const expected = INSTREAM_COMMAND.length + (4 + 1000) * 2 + (4 + 500) + 4;
    expect(payload.length).toBe(expected);
  });

  it('never emits a zero-length chunk for an empty file', () => {
    // A zero-length chunk mid-stream reads as the terminator, so an empty file
    // must produce the command and terminator only.
    const payload = buildInstreamPayload(Buffer.alloc(0));

    expect(payload.length).toBe(INSTREAM_COMMAND.length + 4);
  });

  it('round-trips the content across chunk boundaries', () => {
    const content = Buffer.from('the quick brown fox jumps over the lazy dog');

    const payload = buildInstreamPayload(content, 7);

    // Walk the frames back out and reassemble.
    let offset = INSTREAM_COMMAND.length;
    const chunks: Buffer[] = [];
    for (;;) {
      const length = payload.readUInt32BE(offset);
      offset += 4;
      if (length === 0) break;
      chunks.push(payload.subarray(offset, offset + length));
      offset += length;
    }

    expect(Buffer.concat(chunks).toString()).toBe(content.toString());
    expect(offset).toBe(payload.length);
  });

  it('defaults to 64 KiB chunks', () => {
    expect(DEFAULT_CHUNK_BYTES).toBe(65_536);
  });

  it('refuses a nonsensical chunk size rather than looping forever', () => {
    expect(() => buildInstreamPayload(Buffer.from('x'), 0)).toThrow(/positive/);
  });
});

describe('parseScanReply', () => {
  it('reads a clean result', () => {
    expect(parseScanReply('stream: OK\0')).toEqual({ status: 'clean' });
  });

  it('reads a detection and keeps the signature name', () => {
    expect(parseScanReply('stream: Eicar-Test-Signature FOUND\0')).toEqual({
      status: 'infected',
      signature: 'Eicar-Test-Signature',
    });
  });

  it('keeps a signature name that contains spaces', () => {
    expect(parseScanReply('stream: Win.Test.EICAR_HDB-1 FOUND')).toEqual({
      status: 'infected',
      signature: 'Win.Test.EICAR_HDB-1',
    });
  });

  it('reads clamd errors as errors', () => {
    expect(parseScanReply('INSTREAM size limit exceeded. ERROR')).toEqual({
      status: 'error',
      message: 'INSTREAM size limit exceeded.',
    });
  });

  it('treats an empty reply as an error, not a pass', () => {
    expect(parseScanReply('   ').status).toBe('error');
  });

  it('treats anything unrecognised as an error, not a pass', () => {
    // A reply we cannot parse must never read as clean: that would turn a
    // future protocol change into a silent hole.
    const verdict = parseScanReply('stream: something entirely new');

    expect(verdict.status).toBe('error');
  });

  it('is not fooled by a filename containing the word OK', () => {
    expect(parseScanReply('stream: OK-Malware.Gen FOUND').status).toBe('infected');
  });
});

describe('isPong', () => {
  it('accepts the documented reply, with or without the NUL', () => {
    expect(isPong('PONG\0')).toBe(true);
    expect(isPong('PONG')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isPong('PANG')).toBe(false);
    expect(isPong('')).toBe(false);
  });
});

describe('eicarTestString', () => {
  it('assembles the standard 68-byte test string', () => {
    const eicar = eicarTestString();

    expect(eicar).toHaveLength(68);
    expect(eicar.startsWith('X5O!P%@AP')).toBe(true);
    expect(eicar.endsWith('$H+H*')).toBe(true);
  });
});
