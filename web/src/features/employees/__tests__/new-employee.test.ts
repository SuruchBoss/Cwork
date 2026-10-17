// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildBody, emptyForm } from '../new-employee';
import type { NewEmployeeForm } from '../new-employee';

const form = (extra: Partial<NewEmployeeForm> = {}): NewEmployeeForm => ({
  ...emptyForm,
  firstNameTh: 'วิภา',
  lastNameTh: 'ใจดี',
  hireDate: '2026-10-01',
  ...extra,
});

const bodyOf = (extra: Partial<NewEmployeeForm> = {}) => {
  const built = buildBody(form(extra));
  if (!('body' in built)) throw new Error(`problems: ${JSON.stringify(built.problems)}`);
  return built.body;
};
const problemsOf = (extra: Partial<NewEmployeeForm> = {}) => {
  const built = buildBody(form(extra));
  if (!('problems' in built)) throw new Error('expected problems');
  return built.problems;
};

describe('the add-one-employee rules (CW-065)', () => {
  it('sends the name, the hire date and the type, and leaves every empty field out', () => {
    expect(bodyOf()).toEqual({
      firstNameTh: 'วิภา',
      lastNameTh: 'ใจดี',
      hireDate: '2026-10-01',
      employmentType: 'FULL_TIME',
    });
  });

  it('carries an English-only name into the Thai fields, as the import does', () => {
    const body = bodyOf({
      firstNameTh: '',
      lastNameTh: '',
      firstNameEn: 'Aung',
      lastNameEn: 'Kyaw',
    });
    expect(body).toMatchObject({
      firstNameTh: 'Aung',
      lastNameTh: 'Kyaw',
      firstNameEn: 'Aung',
      lastNameEn: 'Kyaw',
    });
  });

  it('needs a whole name, and a hire date', () => {
    expect(problemsOf({ lastNameTh: '' })).toEqual({ lastNameTh: 'NAME_NEEDED' });
    expect(problemsOf({ firstNameTh: ' ', lastNameTh: '' })).toMatchObject({
      firstNameTh: 'NAME_NEEDED',
      lastNameTh: 'NAME_NEEDED',
    });
    expect(problemsOf({ hireDate: '' })).toEqual({ hireDate: 'REQUIRED' });
  });

  it('takes a national ID with dashes or spaces and sends the digits', () => {
    expect(bodyOf({ nationalId: '1-1017-00230-67-3' })).toMatchObject({
      nationalId: '1101700230673',
    });
    expect(bodyOf({ nationalId: '1101 70023 0673' })).toMatchObject({
      nationalId: '1101700230673',
    });
    expect(problemsOf({ nationalId: '12345' })).toEqual({ nationalId: 'INVALID_NATIONAL_ID' });
  });

  it('writes a passport number as the server keeps it', () => {
    expect(bodyOf({ passportNo: 'mb 123-456' })).toMatchObject({ passportNo: 'MB123456' });
    expect(problemsOf({ passportNo: 'A1' })).toEqual({ passportNo: 'INVALID_PASSPORT' });
  });

  it('refuses a probation that ends before the hire date, and accepts the same day', () => {
    expect(problemsOf({ probationEndDate: '2026-09-30' })).toEqual({
      probationEndDate: 'PROBATION_BEFORE_HIRE',
    });
    expect(bodyOf({ probationEndDate: '2026-10-01' })).toMatchObject({
      probationEndDate: '2026-10-01',
    });
  });

  it('keeps a scanner number as typed, zeros and all, and refuses a space in it', () => {
    expect(bodyOf({ scannerId: ' 007 ' })).toMatchObject({ scannerId: '007' });
    expect(problemsOf({ scannerId: '0 07' })).toEqual({ scannerId: 'SPACE_IN_SCANNER_NUMBER' });
  });

  it('wants a bank account whole or not at all', () => {
    expect(problemsOf({ bankCode: '014' })).toEqual({ bankName: 'BANK_INCOMPLETE' });
    expect(problemsOf({ bankCode: '014', bankName: 'ไทยพาณิชย์' })).toEqual({
      bankAccountNo: 'BANK_INCOMPLETE',
    });
    expect(problemsOf({ bankName: 'ไทยพาณิชย์', bankAccountNo: '1234567890' })).toEqual({
      bankCode: 'BANK_INCOMPLETE',
    });
    expect(problemsOf({ bankCode: '014', bankName: 'ไทยพาณิชย์', bankAccountNo: '123' })).toEqual({
      bankAccountNo: 'INVALID_ACCOUNT_NO',
    });
    expect(
      problemsOf({ bankCode: 'abc', bankName: 'ไทยพาณิชย์', bankAccountNo: '1234567890' }),
    ).toEqual({ bankCode: 'INVALID_BANK_CODE' });
  });

  it('sends the account without dashes, pads a short bank code, and names the account after the person', () => {
    const body = bodyOf({ bankCode: '14', bankName: 'ไทยพาณิชย์', bankAccountNo: '123-456-7890' });
    expect(body.bankAccount).toEqual({
      bankCode: '014',
      bankName: 'ไทยพาณิชย์',
      accountNo: '1234567890',
      accountName: 'วิภา ใจดี',
    });
    expect(
      bodyOf({
        bankCode: '014',
        bankName: 'ไทยพาณิชย์',
        bankAccountNo: '1234567890',
        bankAccountName: 'บริษัท หนึ่ง',
      }).bankAccount,
    ).toMatchObject({ accountName: 'บริษัท หนึ่ง' });
  });

  it('refuses an email address that is not one', () => {
    expect(problemsOf({ workEmail: 'wipa' })).toEqual({ workEmail: 'INVALID_EMAIL' });
    expect(bodyOf({ workEmail: ' wipa@example.com ' })).toMatchObject({
      workEmail: 'wipa@example.com',
    });
  });
});
