// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { filingSheet, type FilingPerson, type FilingSlip } from './sso-filing';
import { taxRulesFor } from './thai-tax';

const rules = taxRulesFor(2026);

const person = (code: string, over: Partial<FilingPerson> = {}): FilingPerson => ({
  employeeId: `id-${code}`,
  employeeCode: code,
  firstName: 'สมชาย',
  lastName: code,
  foreign: false,
  nationalId: '1101700230673',
  socialSecurityNo: null,
  ...over,
});

const slip = (code: string, wage: number, over: Partial<FilingSlip> = {}): FilingSlip => ({
  employeeId: `id-${code}`,
  ssoWage: wage,
  ssoEmployee: 0,
  ssoEmployer: 0,
  ...over,
});

describe('the contribution on the form', () => {
  const rowFor = (wage: number, year = 2026) =>
    filingSheet(year, 11, [slip('E1', wage)], [person('E1')], taxRulesFor(year)).rows[0]!;

  it('is the one the payslips use: whole baht, the floor, the ceiling for the year (CW-084)', () => {
    expect(rowFor(5_010).employee).toBe('251.00');
    expect(rowFor(5_009).employee).toBe('250.00');
    expect(rowFor(1_200)).toMatchObject({ contributoryWage: '1650.00', employee: '83.00' });
    expect(rowFor(20_000)).toMatchObject({ contributoryWage: '17500.00', employee: '875.00' });
    expect(rowFor(30_000, 2029).contributoryWage).toBe(
      taxRulesFor(2029).socialSecurity.maxMonthlyWage.toFixed(2),
    );
  });

  it('lists someone paid nothing that month with nil, as note 6 of the form asks', () => {
    expect(rowFor(0)).toMatchObject({
      wage: '0.00',
      contributoryWage: '0.00',
      employee: '0.00',
      employer: '0.00',
    });
  });
});

describe('filingSheet', () => {
  it('adds a month’s two halves up before the ceiling and the rounding are applied', () => {
    const halves = [slip('E1', 9_000), slip('E1', 9_000)];
    const sheet = filingSheet(2026, 11, halves, [person('E1')], rules);
    expect(sheet.rows).toHaveLength(1);
    // 18,000 is over the ceiling of 17,500: 875, not 450 + 450.
    expect(sheet.rows[0]).toMatchObject({
      wage: '18000.00',
      contributoryWage: '17500.00',
      employee: '875.00',
      employer: '875.00',
    });
  });

  it('totals the form: wage, both shares, the sum, and how many are insured', () => {
    const sheet = filingSheet(
      2026,
      11,
      [slip('E1', 5_010), slip('E2', 20_000), slip('E3', 1_000)],
      [person('E1'), person('E2'), person('E3')],
      rules,
    );
    expect(sheet.totals).toMatchObject({
      insured: 3,
      wage: '26010.00',
      employee: String((251 + 875 + 83).toFixed(2)),
      employer: String((251 + 875 + 83).toFixed(2)),
      total: String(((251 + 875 + 83) * 2).toFixed(2)),
    });
  });

  it('numbers the rows in employee-code order', () => {
    const sheet = filingSheet(
      2026,
      11,
      [slip('B', 5_000), slip('A', 5_000), slip('C', 5_000)],
      [person('B'), person('A'), person('C')],
      rules,
    );
    expect(sheet.rows.map((r) => [r.sequence, r.employeeCode])).toEqual([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ]);
  });

  it('files a Thai under the national ID and a foreign worker under the social security card', () => {
    const sheet = filingSheet(
      2026,
      11,
      [slip('T', 5_000), slip('F', 5_000)],
      [
        person('T'),
        person('F', {
          foreign: true,
          nationalId: '1101700230673',
          socialSecurityNo: '12-3456-789-0',
          firstName: 'Nguyen',
          lastName: 'Van An',
        }),
      ],
      rules,
    );
    const byCode = Object.fromEntries(sheet.rows.map((r) => [r.employeeCode, r]));
    expect(byCode.T).toMatchObject({ identifierKind: 'NATIONAL_ID', identifier: '1101700230673' });
    expect(byCode.F).toMatchObject({
      identifierKind: 'SOCIAL_SECURITY_CARD',
      identifier: '1234567890',
      name: 'Nguyen Van An',
    });
  });

  it.each([
    ['a Thai with no national ID', { nationalId: null }, 'NO_NATIONAL_ID'],
    ['a Thai with a short national ID', { nationalId: '12345' }, 'NATIONAL_ID_NOT_13_DIGITS'],
    [
      'a foreign worker with no card number',
      { foreign: true, socialSecurityNo: null },
      'NO_SOCIAL_SECURITY_CARD',
    ],
    [
      'a foreign worker with letters in the card number',
      { foreign: true, socialSecurityNo: 'AB123' },
      'SOCIAL_SECURITY_CARD_NOT_DIGITS',
    ],
  ])('reports %s by name and leaves them off the form and its totals', (_label, over, code) => {
    const sheet = filingSheet(
      2026,
      11,
      [slip('OK', 5_000), slip('BAD', 5_000)],
      [person('OK'), person('BAD', over as Partial<FilingPerson>)],
      rules,
    );
    expect(sheet.problems).toHaveLength(1);
    expect(sheet.problems[0]).toMatchObject({ employeeCode: 'BAD', code });
    expect(sheet.problems[0]!.name).toContain('BAD');
    expect(sheet.rows.map((r) => r.employeeCode)).toEqual(['OK']);
    expect(sheet.totals.insured).toBe(1);
  });

  it('marks a row whose payslips deducted something other than the form says', () => {
    const sheet = filingSheet(
      2026,
      11,
      [
        slip('SAME', 5_000, { ssoEmployee: 250, ssoEmployer: 250 }),
        slip('SATANG', 5_010, { ssoEmployee: 250.5, ssoEmployer: 250.5 }),
        slip('ZERO', 1_000, { ssoEmployee: 0, ssoEmployer: 0 }),
      ],
      [person('SAME'), person('SATANG'), person('ZERO')],
      rules,
    );
    const flag = Object.fromEntries(sheet.rows.map((r) => [r.employeeCode, r.differsFromPayslips]));
    expect(flag).toEqual({ SAME: false, SATANG: true, ZERO: true });
    expect(sheet.totals.deductedEmployee).toBe('500.50');
  });

  it('ignores a payslip of someone it was not given a record for, rather than inventing a row', () => {
    const sheet = filingSheet(2026, 11, [slip('GHOST', 5_000)], [], rules);
    expect(sheet.rows).toEqual([]);
    expect(sheet.problems).toEqual([]);
  });

  it('states the rate, the floor and the ceiling it worked to', () => {
    const sheet = filingSheet(2026, 11, [], [], rules);
    expect(sheet).toMatchObject({ ratePercent: '5', floor: 1_650, ceiling: 17_500 });
  });
});
