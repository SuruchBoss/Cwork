// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { isNote, type CashSheet, type Denomination } from './cash-sheet';

/**
 * Draws the cash-preparation sheet (CW-088) on A4 landscape: one row per person,
 * one column per note and coin, then the cash for the envelope and what is left
 * over. Every figure comes from `cashSheet()`; nothing is counted here.
 */

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const REGULAR = 'Sarabun';
const BOLD = 'Sarabun-Bold';

const MARGIN = 36;
const DENOMINATION_WIDTH = 36;

export type CashCell = {
  text: string;
  x: number;
  width: number;
  align: 'left' | 'right' | 'center';
};

export interface CashColumns {
  index: CashCell;
  code: CashCell;
  name: CashCell;
  net: CashCell;
  denominations: Array<CashCell & { denomination: Denomination }>;
  cash: CashCell;
  remainder: CashCell;
}

/** Column geometry shared by the header, every row and the totals row. */
export function cashColumns(denominations: Denomination[], pageWidth: number): CashColumns {
  const total = pageWidth - MARGIN * 2;
  const index = 26;
  const code = 56;
  const net = 66;
  const cash = 70;
  const remainder = 56;
  const name =
    total - index - code - net - cash - remainder - denominations.length * DENOMINATION_WIDTH;

  let x = MARGIN;
  const next = (text: string, width: number, align: CashCell['align']): CashCell => {
    const cell = { text, x, width, align };
    x += width;
    return cell;
  };
  return {
    index: next('ลำดับ', index, 'center'),
    code: next('รหัส', code, 'left'),
    name: next('ชื่อ-สกุล', name, 'left'),
    net: next('เงินสุทธิ', net, 'right'),
    denominations: denominations.map((denomination) => ({
      ...next(denominationLabel(denomination), DENOMINATION_WIDTH, 'right'),
      denomination,
    })),
    cash: next('เงินสดใส่ซอง', cash, 'right'),
    remainder: next('เศษไม่จ่าย', remainder, 'right'),
  };
}

/** "1,000" for a note, the same figure for a coin; the header says which. */
export function denominationLabel(denomination: Denomination): string {
  return denomination.toLocaleString('en-US');
}

function groupLabel(denomination: Denomination): string {
  return isNote(denomination) ? 'ธนบัตร' : 'เหรียญ';
}

@Injectable()
export class CashSheetRenderer {
  render(sheet: CashSheet): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: MARGIN,
      bufferPages: true,
    });
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

  private draw(doc: PDFKit.PDFDocument, sheet: CashSheet): void {
    const columns = cashColumns(sheet.columns, doc.page.width);
    const tableWidth = doc.page.width - MARGIN * 2;
    const pageBottom = doc.page.height - 48;
    const countCells = (counts: CashSheet['totals']['counts']) =>
      columns.denominations.map((cell) => ({
        cell,
        text: counts[cell.denomination] > 0 ? String(counts[cell.denomination]) : '-',
      }));

    const rule = (y: number, width: number, color: string) => {
      doc
        .moveTo(MARGIN, y)
        .lineTo(MARGIN + tableWidth, y)
        .lineWidth(width)
        .strokeColor(color)
        .stroke();
      doc.strokeColor('black');
    };

    const drawHeader = (): number => {
      let y = doc.page.margins.top;
      doc.font(BOLD).fontSize(15).text('ใบเตรียมเงินสดจ่ายเงินเดือน/ค่าจ้าง', MARGIN, y, {
        width: tableWidth,
        align: 'center',
      });
      y = doc.y + 1;
      doc.font(BOLD).fontSize(11).text(sheet.organizationName, MARGIN, y, {
        width: tableWidth,
        align: 'center',
      });
      y = doc.y;
      doc
        .font(REGULAR)
        .fontSize(10)
        .text(
          `งวด ${sheet.periodLabel} · วันจ่าย ${sheet.payDateLabel} · เลขที่รอบ ${sheet.runNo}` +
            ` · แบ่งเงินเป็นธนบัตร/เหรียญตั้งแต่ ${denominationLabel(sheet.smallestUnit)} บาทขึ้นไป`,
          MARGIN,
          y + 1,
          { width: tableWidth, align: 'center' },
        );
      y = doc.y;
      doc.font(REGULAR).fontSize(8.5).fillColor('#9a3412');
      doc.text(sheet.layoutNotice, MARGIN, y + 1, { width: tableWidth, align: 'center' });
      doc.fillColor('black');
      y = doc.y + 4;

      // The group heading over the note columns and over the coin columns.
      const groups: Array<{ label: string; from: number; to: number }> = [];
      columns.denominations.forEach((cell, i) => {
        const label = groupLabel(cell.denomination);
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.to = i;
        else groups.push({ label, from: i, to: i });
      });
      doc.font(BOLD).fontSize(9);
      for (const group of groups) {
        const first = columns.denominations[group.from]!;
        const last = columns.denominations[group.to]!;
        doc.text(group.label, first.x, y, {
          width: last.x + last.width - first.x,
          align: 'center',
        });
      }
      y = groups.length > 0 ? doc.y : y;

      doc.font(BOLD).fontSize(9.5);
      const cells = [
        columns.index,
        columns.code,
        columns.name,
        columns.net,
        ...columns.denominations,
        columns.cash,
        columns.remainder,
      ];
      let bottom = y;
      for (const cell of cells) {
        doc.text(cell.text, cell.x, y + 1, { width: cell.width - 4, align: cell.align });
        bottom = Math.max(bottom, doc.y);
      }
      y = bottom + 3;
      rule(y, 0.7, 'black');
      return y + 3;
    };

    let y = drawHeader();
    sheet.rows.forEach((row, i) => {
      doc.font(REGULAR).fontSize(10);
      const nameHeight = doc.heightOfString(row.name, { width: columns.name.width - 6 });
      const height = Math.max(22, nameHeight + 8);
      if (y + height > pageBottom) {
        doc.addPage();
        y = drawHeader();
      }
      const text = y + (height - 12) / 2;
      doc.font(REGULAR).fontSize(10);
      doc.text(String(i + 1), columns.index.x, text, {
        width: columns.index.width,
        align: 'center',
      });
      doc.text(row.employeeCode, columns.code.x, text, { width: columns.code.width - 4 });
      doc.text(row.name, columns.name.x, y + (height - nameHeight) / 2, {
        width: columns.name.width - 6,
      });
      doc.text(row.net, columns.net.x, text, { width: columns.net.width - 4, align: 'right' });
      for (const { cell, text: count } of countCells(row.counts)) {
        doc.text(count, cell.x, text, { width: cell.width - 4, align: 'right' });
      }
      doc.font(BOLD).text(row.cash, columns.cash.x, text, {
        width: columns.cash.width - 4,
        align: 'right',
      });
      doc.font(REGULAR).text(row.remainder, columns.remainder.x, text, {
        width: columns.remainder.width - 4,
        align: 'right',
      });
      y += height;
      rule(y, 0.3, '#cccccc');
    });

    // The totals row stays together with its heading line and is never alone on a page.
    if (y + 56 > pageBottom) {
      doc.addPage();
      y = drawHeader();
    }
    rule(y + 1, 0.9, 'black');
    const text = y + 6;
    doc.font(BOLD).fontSize(10);
    doc.text(`รวม ${sheet.rows.length} คน`, columns.code.x, text, { width: 160 });
    doc.text(sheet.totals.net, columns.net.x, text, {
      width: columns.net.width - 4,
      align: 'right',
    });
    for (const { cell, text: count } of countCells(sheet.totals.counts)) {
      doc.text(count, cell.x, text, { width: cell.width - 4, align: 'right' });
    }
    doc.text(sheet.totals.withdraw, columns.cash.x, text, {
      width: columns.cash.width - 4,
      align: 'right',
    });
    doc.text(sheet.totals.remainder, columns.remainder.x, text, {
      width: columns.remainder.width - 4,
      align: 'right',
    });

    doc.font(BOLD).fontSize(12);
    doc.text(`เงินที่ต้องถอนจากธนาคาร ${sheet.totals.withdraw} บาท`, MARGIN, text + 22, {
      width: tableWidth,
      align: 'left',
    });
    doc.font(REGULAR).fontSize(9).fillColor('#555555');
    doc.text(
      'เศษไม่จ่ายคือส่วนของเงินสุทธิที่น้อยกว่าหน่วยเล็กสุดที่เลือก ไม่ปัดรวมเข้ากับเงินสด ใบสลิปและใบรับเงินแสดงเงินสุทธิตามจริง',
      MARGIN,
      doc.y + 2,
      { width: tableWidth, align: 'left' },
    );
    doc.fillColor('black');

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      // The footer sits inside the bottom margin; without this pdfkit starts a new page for it.
      doc.page.margins.bottom = 0;
      doc.font(REGULAR).fontSize(9).fillColor('#555555');
      doc.text(`หน้า ${i + 1} / ${range.count}`, MARGIN, doc.page.height - 30, {
        width: tableWidth,
        align: 'center',
        lineBreak: false,
      });
      doc.fillColor('black');
    }
  }
}
