// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { DocumentRequestType } from '@prisma/client';
import { CertificateRenderer, certificateBody, type CertificateData } from './certificate-renderer';

const data = (over: Partial<CertificateData> = {}): CertificateData => ({
  referenceNo: 'DOC-2026-0001',
  type: DocumentRequestType.EMPLOYMENT_CERTIFICATE,
  typeLabel: 'หนังสือรับรองการทำงาน',
  language: 'th',
  addressedTo: 'ผู้จัดการธนาคาร',
  purpose: 'ยื่นขอสินเชื่อ',
  issuedOn: '2026-09-18',
  organization: {
    name: 'บริษัท ทดสอบ จำกัด',
    legalName: 'บริษัท ทดสอบ จำกัด (มหาชน)',
    taxId: '0105500000001',
    currency: 'THB',
  },
  employee: {
    employeeCode: 'EMP-0007',
    nameTh: 'อนุชา แก้วมณี',
    nameEn: 'Anucha Kaewmanee',
    position: 'วิศวกร',
    positionEn: 'Engineer',
    department: 'วิศวกรรม',
    hireDate: '2020-01-01',
    yearsOfService: 6,
    status: 'ACTIVE',
  },
  compensation: null,
  verificationCode: 'ABC123DEF456',
  ...over,
});

describe('certificateBody', () => {
  it('states the salary only when compensation is present', () => {
    const withPay = certificateBody(
      data({
        type: DocumentRequestType.SALARY_CERTIFICATE,
        compensation: { baseSalary: '฿45,000.00', currency: 'THB' },
      }),
    );
    expect(withPay.some((line) => line.includes('45,000'))).toBe(true);

    const withoutPay = certificateBody(data({ type: DocumentRequestType.SALARY_CERTIFICATE }));
    expect(withoutPay.some((line) => line.includes('เงินเดือน'))).toBe(false);
  });

  it('names the employee and the certifying company in the opening line', () => {
    const [intro] = certificateBody(data());
    expect(intro).toContain('อนุชา แก้วมณี');
    expect(intro).toContain('บริษัท ทดสอบ จำกัด (มหาชน)');
    expect(intro).toContain('EMP-0007');
  });

  it('closes each certified type with its own purpose sentence', () => {
    const visa = certificateBody(data({ type: DocumentRequestType.VISA_SUPPORT_LETTER }));
    expect(visa.at(-1)).toContain('วีซ่า');
    const sso = certificateBody(data({ type: DocumentRequestType.SOCIAL_SECURITY_LETTER }));
    expect(sso.at(-1)).toContain('ประกันสังคม');
  });
});

describe('CertificateRenderer', () => {
  const renderer = new CertificateRenderer();

  it('renders a valid PDF for every document type with the Thai font embedded', async () => {
    for (const type of Object.values(DocumentRequestType)) {
      const pdf = await renderer.render(data({ type }));
      // A real PDF, not an empty stream…
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(2000);
      // …with Sarabun embedded, so the Thai glyphs travel with the document
      // rather than falling back to tofu boxes.
      expect(pdf.toString('latin1')).toContain('Sarabun');
    }
  });
});
