// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { cashSheet } from './cash-sheet';
import { CashSheetRenderer, cashColumns } from './cash-sheet-renderer';
import type { PrintableRun } from './payslip-sheet';
import { slip } from './payslip-sheet.spec';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit') as {
  openSync(path: string): { hasGlyphForCodePoint(cp: number): boolean };
};

const run: PrintableRun = {
  runNo: 'RUN-2026-12-H1',
  period: {
    code: '2026-12-H1',
    periodStart: new Date('2026-12-01T00:00:00Z'),
    periodEnd: new Date('2026-12-15T00:00:00Z'),
    payDate: new Date('2026-12-15T00:00:00Z'),
  },
  organization: { name: 'ทดสอบ', legalName: 'บริษัท ทดสอบ จำกัด', taxId: '0105500000001' },
};

function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;
}

/** Every string handed to pdfkit's text() while `fn` runs. */
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

const slips = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    slip({
      id: `s-${i}`,
      netPay: `${1000 + i * 37}.${String((i * 13) % 100).padStart(2, '0')}`,
      employee: {
        employeeCode: `EMP-${String(i).padStart(4, '0')}`,
        firstNameTh: i % 7 === 0 ? 'Muhammad' : 'สมชาย',
        lastNameTh: i % 7 === 0 ? 'Abdul Rahman bin Mohd Yusof' : `นามสกุล${i}`,
        position: null,
        department: null,
      },
    }),
  );

describe('cashColumns', () => {
  it('lays the columns edge to edge inside the margins and leaves the name room', () => {
    const columns = cashColumns([1000, 500, 100, 50, 20, 10, 5, 2, 1], 841.89);
    const last = columns.remainder;
    expect(last.x + last.width).toBeCloseTo(841.89 - 36, 5);
    expect(columns.name.width).toBeGreaterThan(160);
    expect(columns.denominations).toHaveLength(9);
  });

  it('gives the name more room when fewer denominations are drawn', () => {
    const all = cashColumns([1000, 500, 100, 50, 20, 10, 5, 2, 1], 841.89);
    const few = cashColumns([1000, 500], 841.89);
    expect(few.name.width).toBeGreaterThan(all.name.width);
  });
});

describe('CashSheetRenderer', () => {
  const renderer = new CashSheetRenderer();

  it('puts every person, their cash and the withdrawal on the page', async () => {
    const sheet = cashSheet(run, slips(5));
    const { result: pdf, texts } = await drawn(() => renderer.render(sheet));
    expect(pageCount(pdf)).toBe(1);
    for (const row of sheet.rows) {
      expect(texts).toContain(row.employeeCode);
      expect(texts).toContain(row.name);
      expect(texts).toContain(row.net);
      expect(texts).toContain(row.cash);
      expect(texts).toContain(row.remainder);
    }
    expect(texts).toContain(`เงินที่ต้องถอนจากธนาคาร ${sheet.totals.withdraw} บาท`);
    expect(texts).toContain(sheet.totals.net);
  });

  it('says the layout still awaits the pilot form', async () => {
    const sheet = cashSheet(run, slips(2));
    const { texts } = await drawn(() => renderer.render(sheet));
    expect(texts).toContain(sheet.layoutNotice);
  });

  it('is landscape A4', async () => {
    const pdf = await renderer.render(cashSheet(run, slips(1)));
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
  });

  it('runs on to more pages with the heading repeated and the total last', async () => {
    const sheet = cashSheet(run, slips(70));
    const { result: pdf, texts } = await drawn(() => renderer.render(sheet));
    const pages = pageCount(pdf);
    expect(pages).toBeGreaterThan(1);
    expect(texts.filter((t) => t === 'ชื่อ-สกุล')).toHaveLength(pages);
    expect(texts).toContain(`หน้า ${pages} / ${pages}`);
    expect(texts).toContain(`เงินที่ต้องถอนจากธนาคาร ${sheet.totals.withdraw} บาท`);
    for (const row of sheet.rows) expect(texts).toContain(row.employeeCode);
  });

  it('draws only the columns for the smallest unit chosen', async () => {
    const { texts } = await drawn(() => renderer.render(cashSheet(run, slips(3), 100)));
    expect(texts).toContain('1,000');
    expect(texts).toContain('100');
    expect(texts).not.toContain('20');
    expect(texts).not.toContain('เหรียญ');
  });

  it('draws nothing the embedded Thai font cannot show', async () => {
    const font = fontkit.openSync(join(process.cwd(), 'assets', 'fonts', 'Sarabun-Regular.ttf'));
    const bold = fontkit.openSync(join(process.cwd(), 'assets', 'fonts', 'Sarabun-Bold.ttf'));
    const { texts } = await drawn(() => renderer.render(cashSheet(run, slips(8))));
    const missing = new Set<string>();
    for (const text of texts) {
      for (const char of text) {
        const cp = char.codePointAt(0)!;
        if (cp === 0x20 || cp === 0x0a) continue;
        if (!font.hasGlyphForCodePoint(cp) || !bold.hasGlyphForCodePoint(cp)) missing.add(char);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('embeds Sarabun', async () => {
    const pdf = await renderer.render(cashSheet(run, slips(1)));
    expect(pdf.toString('latin1')).toContain('Sarabun');
  });
});
