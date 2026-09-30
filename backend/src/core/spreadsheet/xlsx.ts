// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

/**
 * Just enough of the .xlsx format to take a table in and hand a template out
 * (CW-059).
 *
 * An .xlsx file is a zip of XML parts. Reading one needs three of them: the
 * workbook, to find the first sheet; the shared strings, where most text lives;
 * and the sheet itself. Everything else (styles, formulas, charts) is ignored,
 * and a formula contributes the value Excel last calculated for it.
 *
 * Written by hand over `fflate` rather than taken from a spreadsheet library:
 * the libraries that read and write both carry dozens of dependencies for
 * features an importer never touches, and this is the part of the system that
 * opens files from outside.
 */

/** One cell as the file holds it: text, a number, or nothing. */
export type Cell = string | number | null;

export interface XlsxTable {
  rows: Cell[][];
  /** Which day serial number 0 is. Mac Excel used to save 1904. */
  dateSystem: 1900 | 1904;
}

export class XlsxError extends Error {}

/** No part of a table an HR person uploads comes near this, unpacked. */
const MAX_PART_BYTES = 32 * 1024 * 1024;

/** Reads the first sheet of an .xlsx file. */
export function readXlsx(bytes: Uint8Array): XlsxTable {
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes, {
      filter: (file) => {
        const wanted =
          file.name === 'xl/workbook.xml' ||
          file.name === 'xl/_rels/workbook.xml.rels' ||
          file.name === 'xl/sharedStrings.xml' ||
          file.name.startsWith('xl/worksheets/');
        if (wanted && file.originalSize > MAX_PART_BYTES) {
          throw new XlsxError(`${file.name} is too large to read`);
        }
        return wanted;
      },
    });
  } catch (error) {
    if (error instanceof XlsxError) throw error;
    throw new XlsxError('The file is not a readable .xlsx workbook');
  }

  const workbook = text(parts, 'xl/workbook.xml');
  const sheetPath = firstSheetPath(workbook, text(parts, 'xl/_rels/workbook.xml.rels'));
  const sheet = parts[sheetPath];
  if (!sheet) throw new XlsxError('The workbook has no worksheet');

  const shared = parts['xl/sharedStrings.xml']
    ? sharedStrings(strFromU8(parts['xl/sharedStrings.xml']))
    : [];
  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(workbook);

  return { rows: sheetRows(strFromU8(sheet), shared), dateSystem: date1904 ? 1904 : 1900 };
}

function text(parts: Record<string, Uint8Array>, name: string): string {
  const part = parts[name];
  if (!part) throw new XlsxError(`The workbook is missing ${name}`);
  return strFromU8(part);
}

/** The first sheet in the workbook's own order, whatever it is called. */
function firstSheetPath(workbook: string, rels: string): string {
  const sheet = /<(?:\w+:)?sheet\b[^>]*?\b\w+:id="([^"]+)"/.exec(workbook);
  if (!sheet) throw new XlsxError('The workbook has no worksheet');
  for (const [, attrs] of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
    const { Id, Target } = attributes(attrs);
    if (Id !== sheet[1] || !Target) continue;
    return Target.startsWith('/') ? Target.slice(1) : `xl/${Target.replace(/^\.\//, '')}`;
  }
  throw new XlsxError('The workbook does not say where its first sheet is');
}

function attributes(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of source.matchAll(/([\w:]+)="([^"]*)"/g)) {
    out[name.replace(/^\w+:/, (prefix) => (prefix === 'xml:' ? prefix : ''))] = value;
  }
  return out;
}

/** Text of every `<t>` in an element, skipping phonetic guides. */
function runText(xml: string): string {
  const withoutPhonetics = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  let out = '';
  for (const [, , inner] of withoutPhonetics.matchAll(
    /<(?:\w+:)?t\b[^>]*?(\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g,
  )) {
    out += unescapeXml(inner ?? '');
  }
  return out;
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const [, , inner] of xml.matchAll(/<(?:\w+:)?si\b[^>]*?(\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)) {
    out.push(runText(inner ?? ''));
  }
  return out;
}

function sheetRows(xml: string, shared: string[]): Cell[][] {
  const data = /<(?:\w+:)?sheetData\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sheetData>/.exec(xml)?.[1] ?? '';
  const rows: Cell[][] = [];
  let nextRow = 0;

  for (const [, rowAttrs, , rowInner] of data.matchAll(
    /<(?:\w+:)?row\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g,
  )) {
    const r = Number(attributes(rowAttrs).r);
    const rowIndex = Number.isInteger(r) && r > 0 ? r - 1 : nextRow;
    nextRow = rowIndex + 1;
    const cells: Cell[] = [];
    let nextCol = 0;

    for (const [, cellAttrs, , cellInner] of (rowInner ?? '').matchAll(
      /<(?:\w+:)?c\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,
    )) {
      const attrs = attributes(cellAttrs);
      const col = attrs.r ? columnIndex(attrs.r) : nextCol;
      nextCol = col + 1;
      const value = cellValue(attrs.t, cellInner ?? '', shared);
      if (value === null) continue;
      while (cells.length < col) cells.push(null);
      cells[col] = value;
    }

    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }
  return rows;
}

function cellValue(type: string | undefined, inner: string, shared: string[]): Cell {
  if (type === 'inlineStr') {
    const is = /<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(inner)?.[1];
    return is === undefined ? null : runText(is);
  }
  const raw = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
  if (raw === undefined) return null;
  const v = unescapeXml(raw);
  switch (type) {
    case 's':
      return shared[Number(v)] ?? null;
    case 'b':
      return v === '1' ? 'TRUE' : 'FALSE';
    case 'str':
    case 'e':
    case 'd':
      return v;
    default: {
      const n = Number(v);
      return v.trim() !== '' && Number.isFinite(n) ? n : v;
    }
  }
}

/** "AB12" → 27. */
function columnIndex(ref: string): number {
  const letters = /^[A-Za-z]+/.exec(ref)?.[0].toUpperCase() ?? 'A';
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** 0 → "A", 27 → "AB". */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function unescapeXml(value: string): string {
  return (
    value
      .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, entity: string) => {
        switch (entity) {
          case 'lt':
            return '<';
          case 'gt':
            return '>';
          case 'amp':
            return '&';
          case 'quot':
            return '"';
          case 'apos':
            return "'";
          default:
            return String.fromCodePoint(
              entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10),
            );
        }
      })
      // Office's own escape for characters XML cannot carry, such as _x000D_.
      .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  );
}

// -------------------------------------------------------------------- write

export interface SheetSpec {
  name: string;
  rows: string[][];
  /** Column widths in characters. */
  widths?: number[];
  /**
   * The first row is a header: bold, and frozen so it stays in view. Every
   * column the header covers is formatted as text, so a national ID or a
   * leading zero typed into it stays exactly as typed.
   */
  header?: boolean;
}

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Style indexes in STYLES below. */
const STYLE_TEXT = 1;
const STYLE_HEADER = 2;

const STYLES = `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** A workbook of plain text sheets, which Excel, LibreOffice and Google Sheets open. */
export function writeXlsx(sheets: SheetSpec[]): Uint8Array {
  const files: Zippable = {
    '[Content_Types].xml': strToU8(
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${sheets
        .map(
          (sheet, i) =>
            `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet, i === 0));
  });
  return zipSync(files, { level: 6 });
}

function sheetXml(sheet: SheetSpec, selected: boolean): string {
  const columns = Math.max(sheet.widths?.length ?? 0, ...sheet.rows.map((row) => row.length), 1);
  const pane = sheet.header
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    : '';
  const cols = Array.from({ length: columns }, (_, i) => {
    const width = sheet.widths?.[i] ?? 16;
    const style = sheet.header ? ` style="${STYLE_TEXT}"` : '';
    return `<col min="${i + 1}" max="${i + 1}" width="${width}"${style} customWidth="1"/>`;
  }).join('');
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const style = sheet.header ? ` s="${r === 0 ? STYLE_HEADER : STYLE_TEXT}"` : '';
          return `<c r="${columnLetter(c)}${r + 1}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;
}

function escapeXml(value: string): string {
  return (
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Control characters other than tab and line breaks are not allowed in XML.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}
