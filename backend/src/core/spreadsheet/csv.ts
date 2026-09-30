// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Reading text tables the way Excel writes them (CW-059).
 *
 * Excel on a Thai Windows machine saves "CSV (Comma delimited)" in Windows-874,
 * not UTF-8, with no marker to say so. "CSV UTF-8" starts with a byte-order
 * mark, and "Unicode Text" is UTF-16 with tabs. All three reach an importer
 * from the same kind of person, so all three are read here, and the Thai in
 * them comes out as Thai.
 */

/** Bytes as text: UTF-8 or UTF-16 when marked, UTF-8 when valid, else Windows-874. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  try {
    // Fatal: Thai in Windows-874 is never valid UTF-8, so a file that decodes
    // cleanly is UTF-8 (or plain ASCII, which reads the same either way).
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-874').decode(bytes);
  }
}

const DELIMITERS = [',', ';', '\t'] as const;

/**
 * The delimiter the first line uses most, outside quotes. Excel writes commas,
 * except in locales where the comma is the decimal point (semicolons) and in
 * "Unicode Text" (tabs).
 */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  let best = ',';
  for (const [delimiter, count] of counts) {
    if (count > counts.get(best)!) best = delimiter;
  }
  return best;
}

/**
 * RFC 4180, as Excel writes it: quoted fields may hold the delimiter, line
 * breaks and doubled quotes. Rows keep their own length; the caller decides
 * what a short row means. A final line break does not make an empty row.
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += char;
      }
      i += 1;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\r' || char === '\n') {
      endRow();
      if (char === '\r' && text[i + 1] === '\n') i += 1;
    } else {
      field += char;
    }
    i += 1;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}
