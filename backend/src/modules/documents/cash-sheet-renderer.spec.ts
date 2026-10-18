// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { DENOMINATIONS, cashSheet } from './cash-sheet';
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
    const columns = cashColumns(DENOMINATIONS, 841.89);
    const last = columns.remainder;
    expect(last.x + last.width).toBeCloseTo(841.89 - 36, 5);
    expect(columns.name.width).toBeGreaterThan(120);
    expect(columns.denominations).toHaveLength(11);
  });

  it('has a column for every note and coin, the satang coins last', () => {
    const columns = cashColumns(DENOMINATIONS, 841.89);
    expect(columns.denominations.map((c) => c.text)).toEqual([
      '1,000',
      '500',
      '100',
      '50',
      '20',
      '10',
      '5',
      '2',
      '1',
      '0.50',
      '0.25',
    ]);
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

  it('prints nothing that is a note for the project (CW-096)', async () => {
    const sheet = cashSheet(run, slips(2));
    const { texts } = await drawn(() => renderer.render(sheet));
    expect(texts.join('\n')).not.toMatch(/บริษัทนำร่อง|ยังรอเทียบ|แบบฟอร์มกระดาษ/);
  });

  it('keeps every column heading on one line (CW-096: "ลำดับ" broke into "ลำดั" and "บ")', () => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    doc.registerFont('Sarabun-Bold', join(process.cwd(), 'assets', 'fonts', 'Sarabun-Bold.ttf'));
    doc.font('Sarabun-Bold').fontSize(9.5);
    const columns = cashColumns(DENOMINATIONS, doc.page.width);
    const headings = [
      columns.index,
      columns.code,
      columns.name,
      columns.net,
      ...columns.denominations,
      columns.cash,
      columns.remainder,
    ];
    for (const cell of headings) {
      // The renderer draws a heading in `width - 4`; one line is one line height tall.
      const height = doc.heightOfString(cell.text, { width: cell.width - 4 });
      expect({ heading: cell.text, lines: Math.round(height / doc.currentLineHeight()) }).toEqual({
        heading: cell.text,
        lines: 1,
      });
    }
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

  it('draws a heading for the notes and one for the coins, and every denomination', async () => {
    const { texts } = await drawn(() => renderer.render(cashSheet(run, slips(3))));
    expect(texts).toContain('ธนบัตร');
    expect(texts).toContain('เหรียญ');
    for (const label of ['1,000', '500', '100', '50', '20', '10', '5', '2', '1', '0.50', '0.25']) {
      expect(texts).toContain(label);
    }
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
