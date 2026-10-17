// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { filingSheet, type FilingPerson, type FilingSlip } from '../payroll/domain/sso-filing';
import { taxRulesFor } from '../payroll/domain/thai-tax';
import { SsoFilingRenderer, filingMonthLabel, titledName } from './sso-filing-renderer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit') as {
  openSync(path: string): { hasGlyphForCodePoint(cp: number): boolean };
};

const pageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;

async function drawn<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; texts: string[]; calls: unknown[][] }> {
  const texts: string[] = [];
  const calls: unknown[][] = [];
  const original = PDFDocument.prototype.text;
  const spy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
    this: PDFKit.PDFDocument,
    ...args: unknown[]
  ) {
    texts.push(String(args[0]));
    calls.push(args);
    return (original as (...a: unknown[]) => PDFKit.PDFDocument).apply(this, args);
  });
  try {
    return { result: await fn(), texts, calls };
  } finally {
    spy.mockRestore();
  }
}

const sheetOf = (count: number) => {
  const people: FilingPerson[] = [];
  const slips: FilingSlip[] = [];
  for (let i = 0; i < count; i += 1) {
    const code = `E${String(i).padStart(3, '0')}`;
    people.push({
      employeeId: code,
      employeeCode: code,
      firstName: i % 5 === 0 ? 'Muhammad' : 'สมชาย',
      lastName: i % 5 === 0 ? 'Abdul Rahman bin Mohd Yusof' : `นามสกุล${i}`,
      foreign: false,
      nationalId: `11017002${String(30000 + i).padStart(5, '0')}`,
      socialSecurityNo: null,
    });
    slips.push({ employeeId: code, ssoWage: 5_010, ssoEmployee: 251, ssoEmployer: 251 });
  }
  return filingSheet(2037, 11, slips, people, taxRulesFor(2037));
};

const renderer = new SsoFilingRenderer();
const document = (count: number) => ({
  organizationName: 'บริษัท ทดสอบ จำกัด',
  taxId: '0105500000001',
  sheet: sheetOf(count),
});

describe('filingMonthLabel', () => {
  it('writes the month with its Buddhist-era year', () => {
    expect(filingMonthLabel(2026, 12)).toBe('ธันวาคม 2569');
    expect(filingMonthLabel(2037, 1)).toBe('มกราคม 2580');
  });
});

describe('titledName', () => {
  it('joins a Thai title to the name and spaces a title that ends in a Latin letter or a stop', () => {
    expect(titledName('นาย', 'สมชาย ใจดี')).toBe('นายสมชาย ใจดี');
    expect(titledName('Mr.', 'Muhammad Yusof')).toBe('Mr. Muhammad Yusof');
    expect(titledName('Miss', 'Mary Tan')).toBe('Miss Mary Tan');
  });

  it('leaves the name alone when no title is recorded', () => {
    expect(titledName(undefined, 'สมชาย ใจดี')).toBe('สมชาย ใจดี');
    expect(titledName('  ', 'สมชาย ใจดี')).toBe('สมชาย ใจดี');
  });
});

describe('SsoFilingRenderer', () => {
  it('draws part 1 with the totals the form asks for, then part 2 with every person', async () => {
    const doc = document(5);
    const { result, texts } = await drawn(() => renderer.render(doc));
    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(result)).toBe(2); // part 1, and part 2 on one sheet
    expect(texts).toContain('การนำส่งเงินสมทบสำหรับค่าจ้างเดือน พฤศจิกายน 2580');
    expect(texts).toContain('1. เงินค่าจ้างทั้งสิ้น');
    expect(texts).toContain('25,050.00 บาท');
    expect(texts).toContain('1,255.00 บาท');
    expect(texts).toContain('2,510.00 บาท');
    expect(texts).toContain('5 คน');
    for (const row of doc.sheet.rows) {
      expect(texts).toContain(row.identifier);
      expect(texts).toContain(row.name);
    }
    expect(texts).toContain('แผ่นที่ 1 ในจำนวน 1 แผ่น');
  });

  it('writes the total of part 1 in Thai words under line 4', async () => {
    const { texts } = await drawn(() => renderer.render(document(5)));
    expect(texts).toContain('2,510.00 บาท');
    expect(texts).toContain('(ตัวอักษร) สองพันห้าร้อยสิบบาทถ้วน');
  });

  it('heads the name column with the title, and puts a recorded title in front of the name', async () => {
    const doc = { ...document(3), titles: { E000: 'นาย', E001: 'Mr.' } };
    const { texts } = await drawn(() => renderer.render(doc));
    expect(texts).toContain('คำนำหน้านาม-ชื่อ-ชื่อสกุล');
    expect(texts).toContain(titledName('นาย', doc.sheet.rows[0].name));
    expect(texts).toContain(titledName('Mr.', doc.sheet.rows[1].name));
    // No title recorded for the third person: the name stands as it is.
    expect(texts).toContain(doc.sheet.rows[2].name);
  });

  it('puts the rate and "แผ่นที่ N ในจำนวน M แผ่น" in the heading of part 2, on the same line', async () => {
    const { texts, calls } = await drawn(() => renderer.render(document(5)));
    const lineOf = (text: string) =>
      calls.find((args) => String(args[0]) === text && typeof args[2] === 'number')?.[2];
    const rate = lineOf('อัตราเงินสมทบร้อยละ 5');
    const sheets = lineOf('แผ่นที่ 1 ในจำนวน 1 แผ่น');
    expect(texts).toContain('แผ่นที่ 1 ในจำนวน 1 แผ่น');
    expect(rate).toBeDefined();
    expect(sheets).toBe(rate);
    expect(rate as number).toBeLessThan(150); // at the top of the page, not the footer
  });

  it('runs part 2 on to more sheets with the heading repeated, numbered of the whole', async () => {
    const doc = document(80);
    const { result, texts } = await drawn(() => renderer.render(doc));
    const pages = pageCount(result);
    expect(pages).toBeGreaterThan(2);
    const sheets = pages - 1;
    expect(texts).toContain(`แผ่นที่ ${sheets} ในจำนวน ${sheets} แผ่น`);
    for (const row of doc.sheet.rows) expect(texts).toContain(row.identifier);
    expect(texts).toContain('รวม 80 คน');
  });

  it('draws nothing the embedded Thai font cannot show', async () => {
    const regular = fontkit.openSync(join(process.cwd(), 'assets', 'fonts', 'Sarabun-Regular.ttf'));
    const bold = fontkit.openSync(join(process.cwd(), 'assets', 'fonts', 'Sarabun-Bold.ttf'));
    const { texts } = await drawn(() => renderer.render(document(6)));
    const missing = new Set<string>();
    for (const text of texts) {
      for (const char of text) {
        const cp = char.codePointAt(0)!;
        if (cp === 0x20 || cp === 0x0a) continue;
        if (!regular.hasGlyphForCodePoint(cp) || !bold.hasGlyphForCodePoint(cp)) missing.add(char);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
