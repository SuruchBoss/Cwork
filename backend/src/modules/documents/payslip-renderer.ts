// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { PayslipSheet, WageReceiptSheet } from './payslip-sheet';

/**
 * Draws printed payslips and the wage-receipt sheet (CW-071) on A4.
 *
 * Every figure and label comes from the sheet models in `payslip-sheet.ts`;
 * nothing is recalculated or dropped here. A line that is too long for its
 * column wraps instead of being cut, and a slip that will not fit its share of
 * the page at the smallest type is printed on a page of its own, so what is on
 * paper is always what is on the record.
 */

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const REGULAR = 'Sarabun';
const BOLD = 'Sarabun-Bold';

export type SlipsPerPage = 1 | 2 | 4;

/** Type sizes tried in turn until a slip fits its cell; 7pt is the legible floor. */
export const FONT_LADDER = [10, 9, 8, 7.5, 7] as const;

const PAGE_MARGIN = 28;
const CELL_PADDING = 10;

export type SlipRow =
  | { kind: 'title'; text: string }
  | { kind: 'text'; text: string; bold?: boolean }
  | { kind: 'heading'; text: string }
  | { kind: 'line'; label: string; amount: string }
  | { kind: 'rule' }
  | { kind: 'total'; label: string; amount: string; strong: boolean };

/** The rows of one slip in print order. Pure, so what a slip says can be tested without a PDF. */
export function payslipRows(sheet: PayslipSheet): SlipRow[] {
  const rows: SlipRow[] = [
    { kind: 'title', text: 'สลิปเงินเดือน' },
    { kind: 'text', text: sheet.organizationName, bold: true },
  ];
  if (sheet.taxId) rows.push({ kind: 'text', text: `เลขประจำตัวผู้เสียภาษี ${sheet.taxId}` });
  rows.push({
    kind: 'text',
    text: `งวด ${sheet.periodLabel} · วันจ่าย ${sheet.payDateLabel} · เลขที่รอบ ${sheet.runNo}`,
  });
  rows.push({ kind: 'text', text: `${sheet.employee.code}  ${sheet.employee.name}`, bold: true });
  if (sheet.employee.role) rows.push({ kind: 'text', text: sheet.employee.role });
  if (sheet.facts.length > 0) {
    rows.push({
      kind: 'text',
      text: sheet.facts.map((fact) => `${fact.label} ${fact.value}`).join(' · '),
    });
  }
  rows.push({ kind: 'rule' });

  if (sheet.earnings.length > 0) {
    rows.push({ kind: 'heading', text: 'รายได้' });
    for (const line of sheet.earnings) {
      rows.push({ kind: 'line', label: lineLabel(line), amount: line.amount });
    }
  }
  if (sheet.deductions.length > 0) {
    rows.push({ kind: 'heading', text: 'รายการหัก' });
    for (const line of sheet.deductions) {
      rows.push({ kind: 'line', label: lineLabel(line), amount: line.amount });
    }
  }
  if (sheet.notes.length > 0) {
    rows.push({ kind: 'heading', text: 'หมายเหตุ' });
    for (const note of sheet.notes) rows.push({ kind: 'text', text: note });
  }
  rows.push({ kind: 'rule' });
  rows.push({ kind: 'total', label: 'รวมรายได้', amount: sheet.totals.gross, strong: false });
  rows.push({
    kind: 'total',
    label: 'รวมรายการหัก',
    amount: sheet.totals.deductions,
    strong: false,
  });
  rows.push({ kind: 'total', label: 'รับสุทธิ', amount: sheet.totals.net, strong: true });
  return rows;
}

function lineLabel(line: { label: string; detail: string | null }): string {
  return line.detail ? `${line.label} (${line.detail})` : line.label;
}

interface Cell {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the cells of a page sit, in reading order, for 1, 2 or 4 slips. */
export function pageCells(perPage: SlipsPerPage, page: { width: number; height: number }): Cell[] {
  const innerW = page.width - PAGE_MARGIN * 2;
  const innerH = page.height - PAGE_MARGIN * 2;
  if (perPage === 1) return [{ x: PAGE_MARGIN, y: PAGE_MARGIN, width: innerW, height: innerH }];
  if (perPage === 2) {
    const h = innerH / 2;
    return [0, 1].map((r) => ({
      x: PAGE_MARGIN,
      y: PAGE_MARGIN + r * h,
      width: innerW,
      height: h,
    }));
  }
  const w = innerW / 2;
  const h = innerH / 2;
  return [0, 1].flatMap((r) =>
    [0, 1].map((c) => ({ x: PAGE_MARGIN + c * w, y: PAGE_MARGIN + r * h, width: w, height: h })),
  );
}

@Injectable()
export class PayslipRenderer {
  /** Renders the slips, `perPage` to a sheet, in the order given. */
  render(sheets: PayslipSheet[], perPage: SlipsPerPage): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, autoFirstPage: false });
    doc.registerFont(REGULAR, join(FONT_DIR, 'Sarabun-Regular.ttf'));
    doc.registerFont(BOLD, join(FONT_DIR, 'Sarabun-Bold.ttf'));

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.layout(doc, sheets, perPage);
    doc.end();
    return done;
  }

  private layout(doc: PDFKit.PDFDocument, sheets: PayslipSheet[], perPage: SlipsPerPage): void {
    const size = { width: 595.28, height: 841.89 };
    const cells = pageCells(perPage, size);
    const whole = pageCells(1, size)[0]!;

    let slot = 0; // next free cell on the open shared page; 0 means no page is open
    for (const sheet of sheets) {
      const rows = payslipRows(sheet);
      const fitted = perPage === 1 ? null : this.fit(doc, rows, cells[0]!);
      if (perPage !== 1 && fitted === null) {
        // Too long for its share of the page: close the shared page, give it its own.
        slot = 0;
        doc.addPage({ size: 'A4', margin: PAGE_MARGIN });
        const ownSize = this.fit(doc, rows, whole) ?? FONT_LADDER[FONT_LADDER.length - 1]!;
        this.drawCell(doc, rows, whole, ownSize, true);
        continue;
      }
      if (slot === 0) {
        doc.addPage({ size: 'A4', margin: PAGE_MARGIN });
        this.drawCutLines(doc, perPage, size);
      }
      const cell = cells[slot]!;
      const fontSize = fitted ?? this.fit(doc, rows, cell) ?? FONT_LADDER[FONT_LADDER.length - 1]!;
      this.drawCell(doc, rows, cell, fontSize, perPage === 1);
      slot = (slot + 1) % cells.length;
    }
  }

  /** The largest type on the ladder at which the rows fit the cell, or null. */
  private fit(doc: PDFKit.PDFDocument, rows: SlipRow[], cell: Cell): number | null {
    const available = cell.height - CELL_PADDING * 2;
    for (const size of FONT_LADDER) {
      if (this.measure(doc, rows, cell.width - CELL_PADDING * 2, size) <= available) return size;
    }
    return null;
  }

  private rowHeight(doc: PDFKit.PDFDocument, row: SlipRow, width: number, size: number): number {
    const gap = size * 0.25;
    switch (row.kind) {
      case 'rule':
        return gap * 2 + 1;
      case 'title':
        doc.font(BOLD).fontSize(size + 3);
        return doc.heightOfString(row.text, { width }) + gap;
      case 'text':
        doc.font(row.bold ? BOLD : REGULAR).fontSize(size);
        return doc.heightOfString(row.text, { width }) + gap;
      case 'heading':
        doc.font(BOLD).fontSize(size);
        return doc.heightOfString(row.text, { width }) + gap;
      case 'line': {
        const labelWidth = this.labelWidth(width, size);
        doc.font(REGULAR).fontSize(size);
        return doc.heightOfString(row.label, { width: labelWidth }) + gap;
      }
      case 'total':
        doc.font(row.strong ? BOLD : REGULAR).fontSize(row.strong ? size + 1 : size);
        return doc.heightOfString(row.label, { width: width - this.amountWidth(size) }) + gap;
    }
  }

  private measure(doc: PDFKit.PDFDocument, rows: SlipRow[], width: number, size: number): number {
    return rows.reduce((sum, row) => sum + this.rowHeight(doc, row, width, size), 0);
  }

  private amountWidth(size: number): number {
    return size * 8.5;
  }

  private labelWidth(width: number, size: number): number {
    return width - this.amountWidth(size) - size;
  }

  private drawCell(
    doc: PDFKit.PDFDocument,
    rows: SlipRow[],
    cell: Cell,
    size: number,
    mayContinue: boolean,
  ): void {
    const x = cell.x + CELL_PADDING;
    const width = cell.width - CELL_PADDING * 2;
    const bottom = cell.y + cell.height - CELL_PADDING;
    let y = cell.y + CELL_PADDING;

    for (const row of rows) {
      const height = this.rowHeight(doc, row, width, size);
      // Only a slip on its own page may run on to another; one in a shared cell
      // has already been checked to fit.
      if (mayContinue && y + height > bottom) {
        doc.addPage({ size: 'A4', margin: PAGE_MARGIN });
        y = PAGE_MARGIN + CELL_PADDING;
      }
      const gap = size * 0.25;
      switch (row.kind) {
        case 'rule':
          doc
            .moveTo(x, y + gap)
            .lineTo(x + width, y + gap)
            .lineWidth(0.5)
            .strokeColor('#888888')
            .stroke();
          doc.strokeColor('black');
          break;
        case 'title':
          doc.font(BOLD).fontSize(size + 3);
          doc.text(row.text, x, y, { width, lineBreak: true });
          break;
        case 'text':
          doc.font(row.bold ? BOLD : REGULAR).fontSize(size);
          doc.text(row.text, x, y, { width });
          break;
        case 'heading':
          doc.font(BOLD).fontSize(size);
          doc.text(row.text, x, y, { width });
          break;
        case 'line': {
          doc.font(REGULAR).fontSize(size);
          doc.text(row.label, x, y, { width: this.labelWidth(width, size) });
          doc.text(row.amount, x + width - this.amountWidth(size), y, {
            width: this.amountWidth(size),
            align: 'right',
          });
          break;
        }
        case 'total': {
          doc.font(row.strong ? BOLD : REGULAR).fontSize(row.strong ? size + 1 : size);
          doc.text(row.label, x, y, { width: width - this.amountWidth(size) });
          doc.text(row.amount, x + width - this.amountWidth(size), y, {
            width: this.amountWidth(size),
            align: 'right',
          });
          break;
        }
      }
      y += height;
    }
  }

  /** Dashed guides to cut along, between the cells of a shared page. */
  private drawCutLines(
    doc: PDFKit.PDFDocument,
    perPage: SlipsPerPage,
    size: { width: number; height: number },
  ): void {
    if (perPage === 1) return;
    doc.lineWidth(0.5).strokeColor('#999999').dash(3, { space: 3 });
    const midY = size.height / 2;
    doc
      .moveTo(PAGE_MARGIN / 2, midY)
      .lineTo(size.width - PAGE_MARGIN / 2, midY)
      .stroke();
    if (perPage === 4) {
      const midX = size.width / 2;
      doc
        .moveTo(midX, PAGE_MARGIN / 2)
        .lineTo(midX, size.height - PAGE_MARGIN / 2)
        .stroke();
    }
    doc.undash().strokeColor('black');
  }
}

export type ReceiptCell = {
  text: string;
  x: number;
  width: number;
  align: 'left' | 'right' | 'center';
};

/** Column geometry of the receipt table, shared by the header and every row. */
export function receiptColumns(pageWidth: number): {
  index: ReceiptCell;
  code: ReceiptCell;
  name: ReceiptCell;
  net: ReceiptCell;
  signature: ReceiptCell;
} {
  const left = 48;
  const total = pageWidth - left * 2;
  const make = (text: string, start: number, width: number, align: ReceiptCell['align']) => ({
    text,
    x: left + start,
    width,
    align,
  });
  return {
    index: make('ลำดับ', 0, 34, 'center'),
    code: make('รหัส', 34, 64, 'left'),
    name: make('ชื่อ-สกุล', 98, total - 98 - 90 - 140, 'left'),
    net: make('จำนวนเงินสุทธิ', total - 90 - 140, 90, 'right'),
    signature: make('ลายมือชื่อผู้รับเงิน', total - 140, 140, 'center'),
  };
}

@Injectable()
export class WageReceiptRenderer {
  render(sheet: WageReceiptSheet): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    doc.registerFont(REGULAR, join(FONT_DIR, 'Sarabun-Regular.ttf'));
    doc.registerFont(BOLD, join(FONT_DIR, 'Sarabun-Bold.ttf'));

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.draw(doc, sheet);
    doc.end();
    return done;
  }

  private draw(doc: PDFKit.PDFDocument, sheet: WageReceiptSheet): void {
    const columns = receiptColumns(doc.page.width);
    const pageBottom = doc.page.height - 64;
    const tableWidth = doc.page.width - 96;

    const drawHeader = (): number => {
      let y = doc.page.margins.top;
      doc.font(BOLD).fontSize(16).text('ใบรับเงินเดือน/ค่าจ้าง', 48, y, {
        width: tableWidth,
        align: 'center',
      });
      y = doc.y + 2;
      doc.font(BOLD).fontSize(12).text(sheet.organizationName, 48, y, {
        width: tableWidth,
        align: 'center',
      });
      y = doc.y;
      if (sheet.taxId) {
        doc.font(REGULAR).fontSize(10).text(`เลขประจำตัวผู้เสียภาษี ${sheet.taxId}`, 48, y, {
          width: tableWidth,
          align: 'center',
        });
        y = doc.y;
      }
      doc
        .font(REGULAR)
        .fontSize(11)
        .text(
          `งวด ${sheet.periodLabel} · วันจ่าย ${sheet.payDateLabel} · เลขที่รอบ ${sheet.runNo}`,
          48,
          y + 2,
          { width: tableWidth, align: 'center' },
        );
      y = doc.y + 6;
      doc
        .font(REGULAR)
        .fontSize(10)
        .text('ข้าพเจ้าได้รับเงินตามจำนวนที่ระบุไว้ข้างต้นไปครบถ้วนถูกต้องแล้ว', 48, y, {
          width: tableWidth,
          align: 'left',
        });
      y = doc.y + 6;

      doc.font(BOLD).fontSize(10);
      for (const cell of Object.values(columns)) {
        doc.text(cell.text, cell.x, y, { width: cell.width, align: cell.align });
      }
      y = doc.y + 3;
      doc
        .moveTo(48, y)
        .lineTo(48 + tableWidth, y)
        .lineWidth(0.7)
        .strokeColor('black')
        .stroke();
      return y + 3;
    };

    let y = drawHeader();
    sheet.rows.forEach((row, i) => {
      doc.font(REGULAR).fontSize(11);
      const nameHeight = doc.heightOfString(row.name, { width: columns.name.width });
      const height = Math.max(28, nameHeight + 10);
      if (y + height > pageBottom) {
        doc.addPage();
        y = drawHeader();
      }
      const text = y + (height - 14) / 2;
      doc.font(REGULAR).fontSize(11);
      doc.text(String(i + 1), columns.index.x, text, {
        width: columns.index.width,
        align: 'center',
      });
      doc.text(row.employeeCode, columns.code.x, text, { width: columns.code.width });
      doc.text(row.name, columns.name.x, y + (height - nameHeight) / 2, {
        width: columns.name.width,
      });
      doc.text(row.net, columns.net.x, text, { width: columns.net.width, align: 'right' });
      // A line to sign on, so the cell is not a blank box.
      doc
        .moveTo(columns.signature.x + 6, y + height - 6)
        .lineTo(columns.signature.x + columns.signature.width - 6, y + height - 6)
        .lineWidth(0.4)
        .strokeColor('#999999')
        .stroke();
      doc.strokeColor('black');
      y += height;
      doc
        .moveTo(48, y)
        .lineTo(48 + tableWidth, y)
        .lineWidth(0.3)
        .strokeColor('#cccccc')
        .stroke();
      doc.strokeColor('black');
    });

    if (y + 30 > pageBottom) {
      doc.addPage();
      y = drawHeader();
    }
    doc.font(BOLD).fontSize(11);
    doc.text(`รวม ${sheet.rows.length} คน`, columns.code.x, y + 8, { width: 200 });
    doc.text(sheet.total, columns.net.x, y + 8, { width: columns.net.width, align: 'right' });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      // The footer sits inside the bottom margin; without this pdfkit starts a new page for it.
      doc.page.margins.bottom = 0;
      doc.font(REGULAR).fontSize(9).fillColor('#555555');
      doc.text(`หน้า ${i + 1} / ${range.count}`, 48, doc.page.height - 44, {
        width: tableWidth,
        align: 'center',
        lineBreak: false,
      });
      doc.fillColor('black');
    }
  }
}
