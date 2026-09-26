// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocumentRequestType } from '@prisma/client';
import PDFDocument from 'pdfkit';

/**
 * Renders an HR certificate to a PDF (CW-008).
 *
 * Until now a `DocumentRequest` resolved only to *merge data* — the fields, not
 * a document — and HR produced the certificate by hand, so the approval trail
 * ended in a manual step nobody could audit. This turns that data into the
 * actual PDF.
 *
 * The one thing that must not regress is Thai text. The usual failure is tofu
 * boxes from a font with no Thai glyphs, so Sarabun (SIL OFL) is embedded and
 * every line is drawn in it; pdfkit shapes the tone and vowel marks through the
 * font's OpenType tables, so stacked marks land where they should.
 */
export interface CertificateData {
  referenceNo: string;
  type: DocumentRequestType;
  typeLabel: string;
  language: string;
  addressedTo: string | null;
  purpose: string | null;
  issuedOn: string;
  organization: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    currency: string;
  };
  employee: {
    employeeCode: string;
    nameTh: string;
    nameEn: string | null;
    position: string | null;
    positionEn: string | null;
    department: string | null;
    hireDate: string;
    yearsOfService: number;
    status: string;
  };
  compensation: { baseSalary: string; currency: string } | null;
  /** Printed on the document so a third party can confirm it is genuine. */
  verificationCode: string;
}

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const REGULAR = 'Sarabun';
const BOLD = 'Sarabun-Bold';

/**
 * The body paragraphs for a certificate, kept pure so the type-specific wording
 * and the salary rule can be tested without rendering a PDF. Salary appears only
 * when `compensation` is present — which the request only sets when it explicitly
 * asked for it, so pay never leaks into a document that did not need it.
 */
export function certificateBody(data: CertificateData): string[] {
  const employee = data.employee;
  const orgName = data.organization.legalName || data.organization.name;
  const who = `${employee.nameTh}${employee.nameEn ? ` (${employee.nameEn})` : ''} รหัสพนักงาน ${employee.employeeCode}`;
  const role = employee.position ? `ตำแหน่ง ${employee.position}` : 'พนักงาน';
  const department = employee.department ? ` สังกัด${employee.department}` : '';
  const tenure = `เริ่มปฏิบัติงานเมื่อวันที่ ${employee.hireDate} รวมอายุงาน ${employee.yearsOfService} ปี`;

  const intro = `${orgName} ขอรับรองว่า ${who} เป็นพนักงานของบริษัท ${role}${department} ${tenure}`;
  const salary = data.compensation
    ? `โดยได้รับเงินเดือนในอัตรา ${data.compensation.baseSalary} ต่อเดือน`
    : null;
  const evidence = (kind: string): string => `หนังสือฉบับนี้ออกให้เพื่อเป็นหลักฐาน${kind}`;

  switch (data.type) {
    case 'SALARY_CERTIFICATE':
    case 'BANK_LOAN_LETTER':
      return [intro, salary ?? '', evidence('รับรองรายได้ของพนักงานผู้มีชื่อข้างต้น')].filter(
        Boolean,
      );
    case 'SOCIAL_SECURITY_LETTER':
      return [intro, ...(salary ? [salary] : []), evidence('ประกอบการดำเนินการด้านประกันสังคม')];
    case 'VISA_SUPPORT_LETTER':
      return [
        intro,
        ...(salary ? [salary] : []),
        evidence('รับรองการเป็นพนักงานเพื่อประกอบการขอวีซ่า'),
      ];
    case 'EMPLOYMENT_CERTIFICATE':
      return [intro, ...(salary ? [salary] : []), evidence('รับรองการเป็นพนักงาน')];
    default:
      return [intro, ...(salary ? [salary] : [])];
  }
}

@Injectable()
export class CertificateRenderer {
  // Loaded once: the bytes are the same for every certificate.
  private readonly regular = readFileSync(join(FONT_DIR, 'Sarabun-Regular.ttf'));
  private readonly bold = readFileSync(join(FONT_DIR, 'Sarabun-Bold.ttf'));

  async render(data: CertificateData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 64,
      info: { Title: `${data.typeLabel} ${data.referenceNo}` },
    });
    doc.registerFont(REGULAR, this.regular);
    doc.registerFont(BOLD, this.bold);

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.draw(doc, data);
    doc.end();
    return done;
  }

  private draw(doc: PDFKit.PDFDocument, data: CertificateData): void {
    const orgName = data.organization.legalName || data.organization.name;

    doc.font(BOLD).fontSize(18).text(orgName, { align: 'center' });
    if (data.organization.taxId) {
      doc
        .font(REGULAR)
        .fontSize(10)
        .text(`เลขประจำตัวผู้เสียภาษี ${data.organization.taxId}`, { align: 'center' });
    }
    doc.moveDown(1.5);

    doc.font(REGULAR).fontSize(11);
    doc.text(`เลขที่ ${data.referenceNo}`, { align: 'right' });
    doc.text(`วันที่ ${data.issuedOn}`, { align: 'right' });
    doc.moveDown(1);

    doc.font(BOLD).fontSize(16).text(data.typeLabel, { align: 'center' });
    doc.moveDown(1.2);

    if (data.addressedTo) {
      doc.font(REGULAR).fontSize(12).text(`เรียน  ${data.addressedTo}`);
      doc.moveDown(0.6);
    }

    doc.font(REGULAR).fontSize(12);
    for (const paragraph of certificateBody(data)) {
      doc.text(paragraph, { align: 'justify', lineGap: 4, indent: 24 });
      doc.moveDown(0.6);
    }

    if (data.purpose) {
      doc.text(`ทั้งนี้ เพื่อ ${data.purpose}`, { lineGap: 4, indent: 24 });
      doc.moveDown(0.6);
    }

    doc.moveDown(2);
    doc.text('ขอแสดงความนับถือ', { align: 'right' });
    doc.moveDown(2.5);
    doc.text('.................................................', { align: 'right' });
    doc.text('(ผู้มีอำนาจลงนาม)', { align: 'right' });
    doc.text('ฝ่ายทรัพยากรบุคคล', { align: 'right' });

    // Verification note, pinned near the foot of the page.
    doc
      .font(REGULAR)
      .fontSize(9)
      .fillColor('#555555')
      .text(
        `ตรวจสอบความถูกต้องของเอกสารนี้ได้โดยใช้เลขที่อ้างอิง ${data.referenceNo} ` +
          `และรหัสตรวจสอบ ${data.verificationCode}`,
        64,
        doc.page.height - 84,
        { width: doc.page.width - 128, align: 'center' },
      );
    doc.fillColor('black');
  }
}
