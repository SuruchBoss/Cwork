// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The add-one-employee form (CW-065) as plain data and rules, so what it sends
 * can be tested without a screen. The rules are the spreadsheet import's: a name
 * in Thai or in English, a hire date, a 13-digit national ID with the dashes
 * and spaces allowed, a probation that does not end before the hire date, a
 * bank account whole or not at all.
 */

export interface NewEmployeeForm {
  employeeCode: string;
  titleTh: string;
  firstNameTh: string;
  lastNameTh: string;
  firstNameEn: string;
  lastNameEn: string;
  nickname: string;
  dateOfBirth: string;
  gender: string;
  maritalStatus: string;
  nationalId: string;
  taxId: string;
  socialSecurityNo: string;
  passportNo: string;
  passportExpiresOn: string;
  workPermitNo: string;
  workPermitExpiresOn: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  addressLine: string;
  province: string;
  postalCode: string;
  departmentId: string;
  positionId: string;
  workLocationId: string;
  managerId: string;
  employmentType: string;
  hireDate: string;
  probationEndDate: string;
  scannerId: string;
  bankCode: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
}

export const emptyForm: NewEmployeeForm = {
  employeeCode: '',
  titleTh: '',
  firstNameTh: '',
  lastNameTh: '',
  firstNameEn: '',
  lastNameEn: '',
  nickname: '',
  dateOfBirth: '',
  gender: '',
  maritalStatus: '',
  nationalId: '',
  taxId: '',
  socialSecurityNo: '',
  passportNo: '',
  passportExpiresOn: '',
  workPermitNo: '',
  workPermitExpiresOn: '',
  workEmail: '',
  personalEmail: '',
  phone: '',
  addressLine: '',
  province: '',
  postalCode: '',
  departmentId: '',
  positionId: '',
  workLocationId: '',
  managerId: '',
  employmentType: 'FULL_TIME',
  hireDate: '',
  probationEndDate: '',
  scannerId: '',
  bankCode: '',
  bankName: '',
  bankAccountNo: '',
  bankAccountName: '',
};

/** What is wrong with a field, as a reason the page puts into words. */
export type FieldProblem =
  | 'NAME_NEEDED'
  | 'REQUIRED'
  | 'INVALID_NATIONAL_ID'
  | 'INVALID_PASSPORT'
  | 'INVALID_EMAIL'
  | 'PROBATION_BEFORE_HIRE'
  | 'BANK_INCOMPLETE'
  | 'INVALID_BANK_CODE'
  | 'INVALID_ACCOUNT_NO'
  | 'SPACE_IN_SCANNER_NUMBER';

export type Problems = Partial<Record<keyof NewEmployeeForm, FieldProblem>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The request body for the form, with every empty field left out, or the
 * problems that stop it. Nothing is guessed: an English-only name is the one
 * thing carried, into the Thai fields the console shows, as the import does.
 */
export function buildBody(
  form: NewEmployeeForm,
): { body: Record<string, unknown> } | { problems: Problems } {
  const problems: Problems = {};
  const text = (value: string) => value.trim();

  let firstNameTh = text(form.firstNameTh);
  let lastNameTh = text(form.lastNameTh);
  const firstNameEn = text(form.firstNameEn);
  const lastNameEn = text(form.lastNameEn);
  if (!firstNameTh && !lastNameTh && firstNameEn && lastNameEn) {
    firstNameTh = firstNameEn;
    lastNameTh = lastNameEn;
  } else {
    if (!firstNameTh) problems.firstNameTh = 'NAME_NEEDED';
    if (!lastNameTh) problems.lastNameTh = 'NAME_NEEDED';
  }

  const hireDate = text(form.hireDate);
  if (!hireDate) problems.hireDate = 'REQUIRED';
  const probationEndDate = text(form.probationEndDate);
  if (hireDate && probationEndDate && probationEndDate < hireDate) {
    problems.probationEndDate = 'PROBATION_BEFORE_HIRE';
  }

  const nationalId = text(form.nationalId).replace(/[\s-]/g, '');
  if (nationalId && !/^\d{13}$/.test(nationalId)) problems.nationalId = 'INVALID_NATIONAL_ID';

  const passportNo = text(form.passportNo).replace(/[\s-]/g, '').toUpperCase();
  if (passportNo && !/^[A-Z0-9]{5,20}$/.test(passportNo)) problems.passportNo = 'INVALID_PASSPORT';

  for (const key of ['workEmail', 'personalEmail'] as const) {
    const value = text(form[key]);
    if (value && !EMAIL.test(value)) problems[key] = 'INVALID_EMAIL';
  }

  const scannerId = text(form.scannerId);
  if (/\s/.test(scannerId)) problems.scannerId = 'SPACE_IN_SCANNER_NUMBER';

  // A bank account is all of code, name and number, or none of them.
  let bankCode = text(form.bankCode);
  const bankName = text(form.bankName);
  const accountNo = text(form.bankAccountNo).replace(/[\s-]/g, '');
  let bankAccount: Record<string, string> | undefined;
  if (bankCode || bankName || accountNo) {
    if (/^\d{1,3}$/.test(bankCode)) bankCode = bankCode.padStart(3, '0');
    if (!bankCode || !bankName || !accountNo) {
      problems[bankCode ? (bankName ? 'bankAccountNo' : 'bankName') : 'bankCode'] =
        'BANK_INCOMPLETE';
    } else if (!/^\d{3}$/.test(bankCode)) {
      problems.bankCode = 'INVALID_BANK_CODE';
    } else if (!/^\d{6,20}$/.test(accountNo)) {
      problems.bankAccountNo = 'INVALID_ACCOUNT_NO';
    } else {
      bankAccount = {
        bankCode,
        bankName,
        accountNo,
        accountName: text(form.bankAccountName) || `${firstNameTh} ${lastNameTh}`.trim(),
      };
    }
  }

  if (Object.keys(problems).length > 0) return { problems };

  const body: Record<string, unknown> = { firstNameTh, lastNameTh, hireDate };
  const put = (key: string, value: string) => {
    if (value) body[key] = value;
  };
  put('employeeCode', text(form.employeeCode));
  put('titleTh', text(form.titleTh));
  put('firstNameEn', firstNameEn);
  put('lastNameEn', lastNameEn);
  put('nickname', text(form.nickname));
  put('dateOfBirth', text(form.dateOfBirth));
  put('gender', form.gender);
  put('maritalStatus', form.maritalStatus);
  put('nationalId', nationalId);
  put('taxId', text(form.taxId));
  put('socialSecurityNo', text(form.socialSecurityNo));
  put('passportNo', passportNo);
  put('passportExpiresOn', text(form.passportExpiresOn));
  put('workPermitNo', text(form.workPermitNo));
  put('workPermitExpiresOn', text(form.workPermitExpiresOn));
  put('workEmail', text(form.workEmail));
  put('personalEmail', text(form.personalEmail));
  put('phone', text(form.phone));
  put('addressLine', text(form.addressLine));
  put('province', text(form.province));
  put('postalCode', text(form.postalCode));
  put('departmentId', form.departmentId);
  put('positionId', form.positionId);
  put('workLocationId', form.workLocationId);
  put('managerId', form.managerId);
  put('employmentType', form.employmentType);
  put('probationEndDate', probationEndDate);
  put('scannerId', scannerId);
  if (bankAccount) body.bankAccount = bankAccount;
  return { body };
}
