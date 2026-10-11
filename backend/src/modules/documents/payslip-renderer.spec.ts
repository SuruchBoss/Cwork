// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { PayComponentType } from '@prisma/client';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import {
  FONT_LADDER,
  PayslipRenderer,
  WageReceiptRenderer,
  pageCells,
  payslipRows,
} from './payslip-renderer';
import { payslipSheet, wageReceiptSheet, type PrintablePayslip } from './payslip-sheet';
import { slip } from './payslip-sheet.spec';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit') as {
  openSync(path: string): { hasGlyphForCodePoint(cp: number): boolean };
};

const run = {
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

const withLines = (count: number): PrintablePayslip => {
  const items = Array.from({ length: count }, (_, i) => ({
    code: `EXTRA_${i}`,
    name: `รายการเพิ่มเติมลำดับที่ ${i + 1}`,
    type: PayComponentType.EARNING,
    amount: '10.00',
    orderIndex: i + 1,
    quantity: null,
    rate: null,
  }));
  const total = (count * 10).toFixed(2);
  return slip({ items, grossEarnings: total, totalDeductions: '0.00', netPay: total });
};

describe('payslipRows', () => {
  it('has a row for each line, each total and the employee as entered', () => {
    const sheet = payslipSheet(run, slip());
    const rows = payslipRows(sheet);
    const text = rows.map((r) => JSON.stringify(r)).join('\n');
    for (const line of [...sheet.earnings, ...sheet.deductions]) {
      expect(text).toContain(line.label);
      expect(text).toContain(line.amount);
    }
    for (const total of Object.values(sheet.totals)) expect(text).toContain(total);
    expect(text).toContain('Nguyen Van An');
    expect(text).toContain('15 ธันวาคม 2569');
  });
});

describe('notes on a slip', () => {
  it('are drawn under a heading, and only when there are some', async () => {
    const renderer = new PayslipRenderer();
    const warned = slip({
      warnings: [
        { code: 'SUBSTITUTE_HOLIDAY', params: { days: 1, dates: '2036-11-15 → 2036-11-17' } },
      ],
    });
    const { texts } = await drawn(() => renderer.render([payslipSheet(run, warned)], 2));
    expect(texts).toContain('หมายเหตุ');
    expect(texts.some((t) => t.includes('17 พฤศจิกายน 2579'))).toBe(true);

    const plain = await drawn(() => renderer.render([payslipSheet(run, slip())], 2));
    expect(plain.texts).not.toContain('หมายเหตุ');
  });
});

describe('pageCells', () => {
  const page = { width: 595.28, height: 841.89 };
  it.each([
    [1, 1],
    [2, 2],
    [4, 4],
  ] as const)('cuts a page into %i cell(s)', (perPage, count) => {
    const cells = pageCells(perPage, page);
    expect(cells).toHaveLength(count);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x + cell.width).toBeLessThanOrEqual(page.width);
      expect(cell.y + cell.height).toBeLessThanOrEqual(page.height);
    }
  });
});

describe('PayslipRenderer', () => {
  const renderer = new PayslipRenderer();
  const sheets = (count: number, make: () => PrintablePayslip = slip) =>
    Array.from({ length: count }, () => payslipSheet(run, make()));

  it.each([
    [1, 5, 5],
    [2, 5, 3],
    [4, 5, 2],
    [4, 4, 1],
    [4, 1, 1],
  ] as const)('puts %i to a sheet: %i slips take %i page(s)', async (perPage, slips, pages) => {
    const pdf = await renderer.render(sheets(slips), perPage);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(pages);
  });

  it('draws every line, amount and total of every slip', async () => {
    const all = sheets(3);
    const { texts } = await drawn(() => renderer.render(all, 4));
    for (const sheet of all) {
      for (const line of [...sheet.earnings, ...sheet.deductions]) {
        expect(texts.filter((t) => t.startsWith(line.label)).length).toBeGreaterThanOrEqual(3);
      }
      for (const total of Object.values(sheet.totals)) expect(texts).toContain(total);
    }
    // 3 slips × (7,000.00, 500.00, 1,500.00 lines) — each amount appears once per slip.
    expect(texts.filter((t) => t === '7,000.00')).toHaveLength(3);
  });

  it('shows the half-month lines: daily wage, substitute day and cash advance', async () => {
    const { texts } = await drawn(() => renderer.render(sheets(1), 2));
    expect(texts.some((t) => t.startsWith('ค่าจ้างรายวัน (14 × 500.00)'))).toBe(true);
    expect(texts.some((t) => t.startsWith('วันหยุดชดเชย'))).toBe(true);
    expect(texts.some((t) => t.startsWith('หักเงินเบิกล่วงหน้า'))).toBe(true);
  });

  it('prints a slip too long for its share of the page on a page of its own', async () => {
    // 3 ordinary slips, one with 55 lines, then 1 more: the long one is cut out of the grid.
    const list = [...sheets(3), payslipSheet(run, withLines(55)), ...sheets(1)];
    const { result: pdf, texts } = await drawn(() => renderer.render(list, 4));
    expect(pageCount(pdf)).toBe(3);
    // Nothing was dropped to make it fit.
    for (let i = 1; i <= 55; i += 1) {
      expect(texts).toContain(`รายการเพิ่มเติมลำดับที่ ${i}`);
    }
  });

  it('shrinks the type before giving up a shared cell', async () => {
    // Enough lines that 10pt overflows a quarter page but 7pt fits.
    const { result: pdf } = await drawn(() =>
      renderer.render(
        sheets(4, () => withLines(16)),
        4,
      ),
    );
    expect(pageCount(pdf)).toBe(1);
    expect(FONT_LADDER[FONT_LADDER.length - 1]).toBeGreaterThanOrEqual(7);
  });

  it('runs a slip longer than a whole page on to the next page without dropping a line', async () => {
    const { result: pdf, texts } = await drawn(() =>
      renderer.render([payslipSheet(run, withLines(120))], 1),
    );
    expect(pageCount(pdf)).toBeGreaterThan(1);
    for (let i = 1; i <= 120; i += 1) {
      expect(texts).toContain(`รายการเพิ่มเติมลำดับที่ ${i}`);
    }
  });

  it('draws nothing the embedded Thai font cannot show', async () => {
    const font = fontkit.openSync(join(process.cwd(), 'assets', 'fonts', 'Sarabun-Regular.ttf'));
    const bold = fontkit.openSync(join(process.cwd(), 'assets', 'fonts', 'Sarabun-Bold.ttf'));
    const { texts } = await drawn(() => renderer.render(sheets(2), 4));
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
    const pdf = await renderer.render(sheets(1), 1);
    expect(pdf.toString('latin1')).toContain('Sarabun');
  });
});

describe('WageReceiptRenderer', () => {
  const renderer = new WageReceiptRenderer();
  const slips = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      slip({
        id: `s-${i}`,
        netPay: '1000.00',
        employee: {
          employeeCode: `EMP-${String(i).padStart(4, '0')}`,
          firstNameTh: i % 7 === 0 ? 'Muhammad' : 'สมชาย',
          lastNameTh: i % 7 === 0 ? 'Abdul Rahman bin Mohd Yusof' : `นามสกุล${i}`,
          position: null,
          department: null,
        },
      }),
    );

  it('puts a row, the net pay and a signature cell for every employee', async () => {
    const sheet = wageReceiptSheet(run, slips(5));
    const { result: pdf, texts } = await drawn(() => renderer.render(sheet));
    expect(pageCount(pdf)).toBe(1);
    for (const row of sheet.rows) {
      expect(texts).toContain(row.employeeCode);
      expect(texts).toContain(row.name);
    }
    expect(texts).toContain('ลายมือชื่อผู้รับเงิน');
    expect(texts).toContain(sheet.total);
    expect(sheet.total).toBe('5,000.00');
  });

  it('runs on to more pages with the heading repeated and numbered', async () => {
    const sheet = wageReceiptSheet(run, slips(60));
    const { result: pdf, texts } = await drawn(() => renderer.render(sheet));
    const pages = pageCount(pdf);
    expect(pages).toBeGreaterThan(1);
    expect(texts.filter((t) => t === 'ลายมือชื่อผู้รับเงิน')).toHaveLength(pages);
    expect(texts).toContain(`หน้า ${pages} / ${pages}`);
    expect(texts).toContain(sheet.total);
    for (const row of sheet.rows) expect(texts).toContain(row.employeeCode);
  });
});
