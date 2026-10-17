// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { FilingSheet } from '../payroll/domain/sso-filing';
import { formatThaiDocumentDate } from '../../core/utils/date.util';
import { bahtText } from '../../core/utils/baht-text.util';

/**
 * Draws a month's social security filing (CW-048) as the two parts of form
 * สปส.1-10: part 1, the totals the employer files, then part 2, one row for
 * each insured person. It is the form's data laid out to read, check and type
 * in from; it is not the form itself and is not a stamped document, and the
 * employer signs the Social Security Office's own form or files in e-Services.
 */

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const REGULAR = 'Sarabun';
const BOLD = 'Sarabun-Bold';

export interface FilingDocument {
  organizationName: string;
  taxId: string | null;
  sheet: FilingSheet;
  /** Each person's title (นาย, นางสาว…) by employee id, where HR has recorded one. */
  titles?: Record<string, string>;
}

/** "นายสมชาย ใจดี": a Thai title joins the name, a title ending in a Latin letter or a stop is spaced from it. */
export function titledName(title: string | undefined, name: string): string {
  const t = title?.trim();
  if (!t) return name;
  return `${t}${/[A-Za-z.]$/.test(t) ? ' ' : ''}${name}`;
}

/** "พฤศจิกายน 2580": the month and its Buddhist-era year. */
export function filingMonthLabel(year: number, month: number): string {
  return formatThaiDocumentDate(new Date(Date.UTC(year, month - 1, 1)))
    .split(' ')
    .slice(1)
    .join(' ');
}

const money = (value: string): string =>
  Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Column geometry of part 2, shared by the heading and every row. */
export function filingColumns(pageWidth: number) {
  const left = 48;
  const total = pageWidth - left * 2;
  const wage = 96;
  const contribution = 112;
  const id = 120;
  const index = 40;
  return {
    left,
    total,
    index: { x: left, width: index, align: 'center' as const, text: 'ลำดับที่' },
    id: {
      x: left + index,
      width: id,
      align: 'left' as const,
      text: 'เลขประจำตัวประชาชน (คนต่างด้าว: เลขที่บัตรประกันสังคม)',
    },
    name: {
      x: left + index + id,
      width: total - index - id - wage - contribution,
      align: 'left' as const,
      text: 'คำนำหน้านาม-ชื่อ-ชื่อสกุล',
    },
    wage: {
      x: left + total - wage - contribution,
      width: wage,
      align: 'right' as const,
      text: 'ค่าจ้างที่จ่ายจริง',
    },
    contribution: {
      x: left + total - contribution,
      width: contribution,
      align: 'right' as const,
      text: 'เงินสมทบผู้ประกันตน',
    },
  };
}

@Injectable()
export class SsoFilingRenderer {
  render(document: FilingDocument): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    doc.registerFont(REGULAR, join(FONT_DIR, 'Sarabun-Regular.ttf'));
    doc.registerFont(BOLD, join(FONT_DIR, 'Sarabun-Bold.ttf'));

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.draw(doc, document);
    doc.end();
    return done;
  }

  private draw(
    doc: PDFKit.PDFDocument,
    { organizationName, taxId, sheet, titles = {} }: FilingDocument,
  ): void {
    const width = doc.page.width - 96;
    const monthLabel = filingMonthLabel(sheet.year, sheet.month);

    // Part 1: what is filed in all.
    doc.font(BOLD).fontSize(16).text('แบบรายการแสดงการส่งเงินสมทบ (สปส.1-10) ส่วนที่ 1', 48, 48, {
      width,
      align: 'center',
    });
    doc.font(BOLD).fontSize(13).text(organizationName, { width, align: 'center' });
    if (taxId) {
      doc
        .font(REGULAR)
        .fontSize(10)
        .text(`เลขประจำตัวผู้เสียภาษี ${taxId}`, { width, align: 'center' });
    }
    doc.moveDown(0.8);
    doc.font(REGULAR).fontSize(12);
    doc.text(`การนำส่งเงินสมทบสำหรับค่าจ้างเดือน ${monthLabel}`, { width });
    doc.text(`อัตราเงินสมทบร้อยละ ${sheet.ratePercent}`, { width });
    doc.moveDown(0.8);
    const lines: Array<[string, string]> = [
      ['1. เงินค่าจ้างทั้งสิ้น', `${money(sheet.totals.wage)} บาท`],
      ['2. เงินสมทบผู้ประกันตน', `${money(sheet.totals.employee)} บาท`],
      ['3. เงินสมทบนายจ้าง', `${money(sheet.totals.employer)} บาท`],
      ['4. รวมเงินสมทบที่นำส่งทั้งสิ้น', `${money(sheet.totals.total)} บาท`],
      ['5. จำนวนผู้ประกันตนที่ส่งเงินสมทบ', `${sheet.totals.insured} คน`],
    ];
    for (const [label, value] of lines) {
      const y = doc.y;
      doc.text(label, 48, y, { width: width - 160 });
      doc.text(value, 48 + width - 160, y, { width: 160, align: 'right' });
      doc.moveDown(0.3);
      if (label.startsWith('4.')) {
        // The form writes the total in words under the figure.
        doc.font(REGULAR).fontSize(11).fillColor('#333333');
        doc.text(`(ตัวอักษร) ${bahtText(sheet.totals.total)}`, 48 + 16, doc.y, {
          width: width - 16,
        });
        doc.fillColor('black').font(REGULAR).fontSize(12);
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(1);
    doc.font(REGULAR).fontSize(9).fillColor('#555555');
    doc.text(
      'ข้อมูลตามแบบ ใช้อ่านและตรวจเทียบก่อนกรอกหรือพิมพ์ลงใน e-Services เงินสมทบแต่ละคนปัดเป็นบาท ' +
        'ตั้งแต่ 50 สตางค์ขึ้นไปปัดขึ้น ส่วนนายจ้างเท่ากับของผู้ประกันตน',
      48,
      doc.y,
      { width },
    );
    doc.fillColor('black');

    // Part 2: one row for each insured person.
    const columns = filingColumns(doc.page.width);
    const pageBottom = doc.page.height - 64;
    let sheetLineY = 0;
    const drawHeading = (): number => {
      doc.addPage();
      doc.font(BOLD).fontSize(14).text('รายละเอียดการนำส่งเงินสมทบ สปส.1-10 ส่วนที่ 2', 48, 48, {
        width,
        align: 'center',
      });
      doc
        .font(REGULAR)
        .fontSize(11)
        .text(`สำหรับค่าจ้างเดือน ${monthLabel}   ${organizationName}`, {
          width,
          align: 'center',
        });
      // The rate on the left; "แผ่นที่ N ในจำนวน M แผ่น" is written on the right
      // once the number of sheets is known.
      sheetLineY = doc.y + 4;
      doc
        .font(REGULAR)
        .fontSize(10)
        .text(`อัตราเงินสมทบร้อยละ ${sheet.ratePercent}`, 48, sheetLineY, { width: width / 2 });
      let y = sheetLineY + 20;
      doc.font(BOLD).fontSize(10);
      let tallest = 0;
      for (const key of ['index', 'id', 'name', 'wage', 'contribution'] as const) {
        const column = columns[key];
        const before = doc.y;
        doc.text(column.text, column.x, y, { width: column.width, align: column.align });
        tallest = Math.max(tallest, doc.y - y);
        doc.y = before;
      }
      y += tallest + 3;
      doc
        .moveTo(48, y)
        .lineTo(48 + width, y)
        .lineWidth(0.7)
        .strokeColor('black')
        .stroke();
      return y + 4;
    };

    let y = drawHeading();
    for (const row of sheet.rows) {
      doc.font(REGULAR).fontSize(11);
      const name = titledName(titles[row.employeeId], row.name);
      const nameHeight = doc.heightOfString(name, { width: columns.name.width });
      const height = Math.max(20, nameHeight + 6);
      if (y + height > pageBottom) y = drawHeading();
      doc.text(String(row.sequence), columns.index.x, y + 3, {
        width: columns.index.width,
        align: 'center',
      });
      doc.text(row.identifier, columns.id.x, y + 3, { width: columns.id.width });
      doc.text(name, columns.name.x, y + 3, { width: columns.name.width });
      doc.text(money(row.wage), columns.wage.x, y + 3, {
        width: columns.wage.width,
        align: 'right',
      });
      doc.text(money(row.employee), columns.contribution.x, y + 3, {
        width: columns.contribution.width,
        align: 'right',
      });
      y += height;
      doc
        .moveTo(48, y)
        .lineTo(48 + width, y)
        .lineWidth(0.3)
        .strokeColor('#cccccc')
        .stroke();
      doc.strokeColor('black');
    }
    if (y + 30 > pageBottom) y = drawHeading();
    doc
      .moveTo(48, y)
      .lineTo(48 + width, y)
      .lineWidth(0.7)
      .strokeColor('black')
      .stroke();
    doc.font(BOLD).fontSize(11);
    doc.text(`รวม ${sheet.totals.insured} คน`, columns.id.x, y + 8, { width: 200 });
    doc.text(money(sheet.totals.wage), columns.wage.x, y + 8, {
      width: columns.wage.width,
      align: 'right',
    });
    doc.text(money(sheet.totals.employee), columns.contribution.x, y + 8, {
      width: columns.contribution.width,
      align: 'right',
    });

    // Part 2 starts on the second page: number those pages "แผ่นที่ x ในจำนวน y แผ่น" in the heading, as the form does.
    const range = doc.bufferedPageRange();
    const sheets = range.count - 1;
    for (let i = 1; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc.font(REGULAR).fontSize(10);
      doc.text(`แผ่นที่ ${i} ในจำนวน ${sheets} แผ่น`, 48 + width / 2, sheetLineY, {
        width: width / 2,
        align: 'right',
        lineBreak: false,
      });
    }
  }
}
