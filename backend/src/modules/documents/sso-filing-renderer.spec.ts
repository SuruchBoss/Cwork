// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { filingSheet, type FilingPerson, type FilingSlip } from '../payroll/domain/sso-filing';
import { taxRulesFor } from '../payroll/domain/thai-tax';
import { SsoFilingRenderer, filingMonthLabel } from './sso-filing-renderer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit') as {
  openSync(path: string): { hasGlyphForCodePoint(cp: number): boolean };
};

const pageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;

async function drawn<T>(fn: () => Promise<T>): Promise<{ result: T; texts: string[] }> {
  const texts: string[] = [];
  const original = PDFDocument.prototype.text;
  const spy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
    this: PDFKit.PDFDocument,
    ...args: unknown[]
  ) {
    texts.push(String(args[0]));
    return (original as (...a: unknown[]) => PDFKit.PDFDocument).apply(this, args);
  });
  try {
    return { result: await fn(), texts };
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
