// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { decodeText, detectDelimiter, parseCsv } from './csv';
import { readTable, TableError } from './table';
import { columnLetter, readXlsx, writeXlsx } from './xlsx';

/**
 * Thai text as Excel on a Thai Windows machine saves it in "CSV (Comma
 * delimited)": Windows-874, one byte a character. Thai sits at U+0E01–U+0E5B
 * and at 0xA1–0xFB in that code page, so the mapping is one subtraction.
 */
function windows874(text: string): Uint8Array {
  return Uint8Array.from(
    [...text].map((char) => {
      const code = char.codePointAt(0)!;
      if (code >= 0x0e01 && code <= 0x0e5b) return code - 0x0e01 + 0xa1;
      if (code < 0x80) return code;
      throw new Error(`not in Windows-874: ${char}`);
    }),
  );
}

/** A workbook shaped the way Excel itself writes one: shared strings, prefixed tags. */
function excelShaped(sheet: string, shared: string, workbookPr = ''): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(
      `<x:workbook xmlns:x="m" xmlns:r="r">${workbookPr}<x:sheets><x:sheet name="Data" sheetId="7" r:id="rId3"/></x:sheets></x:workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Target="styles.xml"/><Relationship Id="rId3" Type="worksheet" Target="/xl/worksheets/data.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8(shared),
    'xl/worksheets/data.xml': strToU8(sheet),
  });
}

describe('decodeText', () => {
  it("reads Thai Excel's default CSV, which is Windows-874 with no marker", () => {
    expect(decodeText(windows874('รหัส,ชื่อ\r\nE001,สมชาย'))).toBe('รหัส,ชื่อ\r\nE001,สมชาย');
  });

  it('reads "CSV UTF-8", which starts with a byte-order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('ชื่อ,สมชาย')]);
    expect(decodeText(bytes)).toBe('ชื่อ,สมชาย');
  });

  it('reads UTF-8 with no mark, as other programs write it', () => {
    expect(decodeText(new TextEncoder().encode('ชื่อ,สมชาย'))).toBe('ชื่อ,สมชาย');
  });

  it('reads "Unicode Text", which is UTF-16 with a mark', () => {
    const body = Buffer.from('ชื่อ\tสมชาย', 'utf16le');
    expect(decodeText(new Uint8Array([0xff, 0xfe, ...body]))).toBe('ชื่อ\tสมชาย');
  });
});

describe('parseCsv', () => {
  it('splits rows and fields', () => {
    expect(parseCsv('a,b,c\r\n1,2,3\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas, quotes and line breaks inside quoted fields', () => {
    expect(parseCsv('name,address\n"Somchai ""Chai""","12/3 ถนนสาทร,\nแขวงสีลม"\n')).toEqual([
      ['name', 'address'],
      ['Somchai "Chai"', '12/3 ถนนสาทร,\nแขวงสีลม'],
    ]);
  });

  it('keeps empty fields, including trailing ones', () => {
    expect(parseCsv('a,,c,\n,,,')).toEqual([
      ['a', '', 'c', ''],
      ['', '', '', ''],
    ]);
  });

  it('uses the delimiter the header uses', () => {
    expect(detectDelimiter('a;b;c\n1,5;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('"a,b";c;d')).toBe(';');
    expect(detectDelimiter('only')).toBe(',');
    expect(parseCsv('a;b\n1,5;2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });

  it('accepts old Mac line endings', () => {
    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('readXlsx', () => {
  it('reads a workbook written by another program (openpyxl)', () => {
    const table = readXlsx(
      readFileSync(join(__dirname, '../../../test/fixtures/spreadsheets/openpyxl.xlsx')),
    );

    expect(table.dateSystem).toBe(1900);
    expect(table.rows[0]).toEqual([
      'รหัสพนักงาน',
      'ชื่อ',
      'นามสกุล',
      'เลขบัตรประชาชน',
      'วันเริ่มงาน',
      'เงินเดือน',
    ]);
    // A 13-digit number survives exactly; a date arrives as Excel's day number.
    expect(table.rows[1]).toEqual(['E001', 'สมชาย', 'ใจดี', 1234567890123, 45306, 25000.5]);
    expect(table.rows[2]).toEqual(['E002', 'Somsri & <Co>', null, null, 33005, 0]);
    // The blank row is kept, so row numbers match what Excel shows.
    expect(table.rows[3]).toEqual([]);
    expect(table.rows[4]).toEqual(['E003', '  มานี  ', 'มีนา', '0012']);
  });

  it('reads the shared strings Excel writes, rich text and all', () => {
    const shared =
      '<x:sst xmlns:x="m"><x:si><x:t>รหัส</x:t></x:si><x:si><x:r><x:rPr><x:b/></x:rPr><x:t>สม</x:t></x:r><x:r><x:t xml:space="preserve">ชาย </x:t></x:r><x:rPh><x:t>ignored</x:t></x:rPh></x:si><x:si><x:t>a &amp; b_x000D_</x:t></x:si><x:si/></x:sst>';
    const sheet =
      '<x:worksheet xmlns:x="m"><x:cols><x:col min="1" max="3"/></x:cols><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="s"><x:v>2</x:v></x:c></x:row><x:row r="3"><x:c r="A3" t="s"><x:v>1</x:v></x:c><x:c r="B3" t="str"><x:f>1+1</x:f><x:v>2</x:v></x:c><x:c r="C3" t="b"><x:v>1</x:v></x:c><x:c r="D3" t="e"><x:v>#N/A</x:v></x:c><x:c r="E3" s="4"/><x:c r="F3" t="s"><x:v>3</x:v></x:c></x:row></x:sheetData><x:conditionalFormatting><x:cfRule/></x:conditionalFormatting></x:worksheet>';

    const table = readXlsx(excelShaped(sheet, shared));

    expect(table.rows).toEqual([
      ['รหัส', null, 'a & b\r'],
      [],
      ['สมชาย ', '2', 'TRUE', '#N/A', null, ''],
    ]);
  });

  it('knows a workbook that counts days from 1904', () => {
    const sheet = '<worksheet><sheetData><row><c><v>1</v></c></row></sheetData></worksheet>';
    const table = readXlsx(excelShaped(sheet, '<sst/>', '<x:workbookPr date1904="1"/>'));

    expect(table.dateSystem).toBe(1904);
    // Rows and cells with no reference are placed in order.
    expect(table.rows).toEqual([[1]]);
  });

  it('refuses a zip that is not a workbook', () => {
    expect(() => readXlsx(zipSync({ 'readme.txt': strToU8('hello') }))).toThrow(
      /missing xl\/workbook.xml/,
    );
  });
});

describe('writeXlsx', () => {
  it('writes a workbook that reads back as it was written', () => {
    const bytes = writeXlsx([
      {
        name: 'พนักงาน',
        header: true,
        widths: [12, 20],
        rows: [
          ['รหัสพนักงาน *', 'ชื่อ *'],
          ['E001', 'สมชาย <& "ใจดี">'],
          ['0012', '  spaced  '],
        ],
      },
      { name: 'คำอธิบาย', rows: [['second sheet']] },
    ]);

    expect(readXlsx(bytes).rows).toEqual([
      ['รหัสพนักงาน *', 'ชื่อ *'],
      ['E001', 'สมชาย <& "ใจดี">'],
      ['0012', '  spaced  '],
    ]);
  });
});

describe('readTable', () => {
  it('tells .xlsx from CSV by its bytes, not its name', () => {
    const xlsx = writeXlsx([{ name: 'a', rows: [['x', 'y']] }]);
    expect(readTable(xlsx).rows).toEqual([['x', 'y']]);
    expect(readTable(windows874('รหัส,ชื่อ\r\n')).rows).toEqual([['รหัส', 'ชื่อ']]);
  });

  it('trims cells, empties whitespace-only ones and drops blank rows at the end', () => {
    const table = readTable(new TextEncoder().encode('a , b\n\u00a0x\u00a0,  \n,\n\n'));
    expect(table.rows).toEqual([
      ['a', 'b'],
      ['x', null],
    ]);
  });

  it('asks for .xlsx or CSV instead of an Excel 97 workbook', () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => readTable(xls)).toThrow(TableError);
    expect(() => readTable(xls)).toThrow(/Save it as .xlsx or CSV/);
  });

  it('refuses an empty file and a binary one', () => {
    expect(() => readTable(new Uint8Array())).toThrow(/empty/);
    expect(() => readTable(new TextEncoder().encode('\n,\n'))).toThrow(/no rows/);
    expect(() => readTable(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]))).toThrow(
      /not a spreadsheet/,
    );
  });

  it('refuses a damaged .xlsx with a reason rather than a crash', () => {
    const broken = writeXlsx([{ name: 'a', rows: [['x']] }]).slice(0, 40);
    expect(() => readTable(broken)).toThrow(TableError);
  });
});

describe('columnLetter', () => {
  it('names columns the way Excel does', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });
});
