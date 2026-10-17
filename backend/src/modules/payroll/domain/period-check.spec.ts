// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { Cell, Table } from '../../../core/spreadsheet/table';
import { Decimal } from '../../../core/utils/money.util';
import type { ReconciledPeriod, ReconciledRow } from './payroll-export';
import { compareFiledTotals, compareParallelRun, cworkPeople } from './period-check';

const d = (value: string) => new Decimal(value);

function row(overrides: Partial<ReconciledRow> = {}): ReconciledRow {
  return {
    runNo: 'RUN-1',
    employeeCode: 'EMP001',
    fullNameTh: 'สมชาย ใจดี',
    departmentName: 'บัญชี',
    currency: 'THB',
    grossEarnings: d('30000.00'),
    totalDeductions: d('2500.00'),
    taxableIncome: d('30000.00'),
    withholdingTax: d('1000.00'),
    ssoEmployee: d('750.00'),
    ssoEmployer: d('750.00'),
    netPay: d('27500.00'),
    taxId: '',
    ...overrides,
  };
}

function period(rows: ReconciledRow[]): ReconciledPeriod {
  return {
    period: { code: 'PR-2026-09', year: 2026, month: 9 },
    rows,
    runCount: 1,
    totals: { gross: d('0'), deduction: d('0'), net: d('0') },
  };
}

const two = period([
  row(),
  row({
    employeeCode: 'EMP002',
    fullNameTh: 'สมหญิง ขยัน',
    grossEarnings: d('20000.00'),
    withholdingTax: d('250.00'),
    ssoEmployee: d('750.00'),
    ssoEmployer: d('750.00'),
    netPay: d('18250.00'),
  }),
]);

describe('compareFiledTotals', () => {
  it('matches when the filed totals are Cwork’s own', () => {
    const result = compareFiledTotals(two, { tax: d('1250.00'), sso: d('3000.00') });

    expect(result.tax).toEqual({
      cwork: '1250.00',
      filed: '1250.00',
      difference: '0.00',
      matches: true,
    });
    expect(result.sso).toMatchObject({
      cwork: '3000.00',
      matches: true,
      employee: '1500.00',
      employer: '1500.00',
    });
  });

  it('shows a filed total that is one satang out as different', () => {
    const result = compareFiledTotals(two, { tax: d('1250.01'), sso: d('2999.99') });

    expect(result.tax).toMatchObject({ matches: false, difference: '0.01' });
    expect(result.sso).toMatchObject({ matches: false, difference: '-0.01' });
  });

  it('checks only the totals that were entered', () => {
    expect(compareFiledTotals(two, { tax: d('1250.00') }).sso).toBeNull();
    expect(compareFiledTotals(two, { sso: d('3000.00') }).tax).toBeNull();
  });

  it('counts a filed total of zero as entered', () => {
    const result = compareFiledTotals(two, { tax: d('0') });
    // Decimal(0) is falsy-looking to a careless check; it must still be compared.
    expect(result.tax).toMatchObject({ filed: '0.00', matches: false });
  });
});

describe('cworkPeople', () => {
  it('adds an employee’s runs together', () => {
    const people = cworkPeople(
      period([
        row({ runNo: 'RUN-1' }),
        row({
          runNo: 'RUN-2',
          grossEarnings: d('1000.00'),
          withholdingTax: d('10.00'),
          ssoEmployee: d('50.00'),
          netPay: d('940.00'),
        }),
      ]),
    );

    expect(people.size).toBe(1);
    expect(people.get('EMP001')).toMatchObject({
      gross: d('31000.00'),
      tax: d('1010.00'),
      sso: d('800.00'),
      net: d('28440.00'),
    });
  });
});

const header = ['รหัสพนักงาน', 'รายได้', 'ภาษี', 'ประกันสังคม', 'สุทธิ'];

function table(...rows: Cell[][]): Table {
  return { rows: [header, ...rows], dateSystem: 1900 };
}

describe('compareParallelRun', () => {
  const people = cworkPeople(two);

  it('marks nobody when HR’s figures are Cwork’s', () => {
    const result = compareParallelRun(
      table(['EMP001', 30000, 1000, 750, 27500], ['EMP002', 20000, 250, 750, 18250]),
      people,
    );

    expect(result.problems).toEqual([]);
    expect(result.people.map((p) => p.differs)).toEqual([false, false]);
    expect(result.onlyInFile).toEqual([]);
    expect(result.onlyInCwork).toEqual([]);
  });

  it('marks the one person and the one column that differ', () => {
    const result = compareParallelRun(
      table(['EMP001', 30000, 1000.5, 750, 27500], ['EMP002', 20000, 250, 750, 18250]),
      people,
    );

    const [first, second] = result.people;
    expect(first!.differs).toBe(true);
    expect(first!.figures.tax).toEqual({
      cwork: '1000.00',
      theirs: '1000.50',
      difference: '0.50',
      differs: true,
    });
    expect((['gross', 'sso', 'net'] as const).map((key) => first!.figures[key].differs)).toEqual([
      false,
      false,
      false,
    ]);
    expect(second!.differs).toBe(false);
  });

  it('sees a satang', () => {
    const result = compareParallelRun(
      table(['EMP001', 30000, 1000, 750, 27500.01], ['EMP002', 20000, 250, 750, 18250]),
      people,
    );
    expect(result.people[0]!.figures.net).toMatchObject({ differs: true, difference: '0.01' });
  });

  it('lists a person only one side has', () => {
    const result = compareParallelRun(
      table(['EMP001', 30000, 1000, 750, 27500], ['EMP999', 1, 0, 0, 1]),
      people,
    );

    expect(result.onlyInFile).toEqual([{ row: 3, employeeCode: 'EMP999' }]);
    expect(result.onlyInCwork).toEqual([{ employeeCode: 'EMP002', name: 'สมหญิง ขยัน' }]);
  });

  it('reads Excel’s own text, thousands separators and all, and ignores columns of HR’s own', () => {
    const result = compareParallelRun(
      {
        rows: [
          [...header, 'หมายเหตุ'],
          ['EMP001', '30,000.00', '1,000.00', '750.00', '27,500.00', 'ok'],
        ],
        dateSystem: 1900,
      },
      people,
    );
    expect(result.problems).toEqual([]);
    expect(result.people[0]!.differs).toBe(false);
  });

  it('refuses a file without every column, naming the one missing', () => {
    const result = compareParallelRun(
      {
        rows: [
          ['รหัสพนักงาน', 'รายได้', 'ภาษี', 'สุทธิ'],
          ['EMP001', 1, 1, 1],
        ],
        dateSystem: 1900,
      },
      people,
    );
    expect(result.people).toEqual([]);
    expect(result.problems.map((p) => p.code)).toEqual(['MISSING_COLUMN']);
  });

  it('refuses a blank figure, a bad amount and a code twice, by row and column', () => {
    const result = compareParallelRun(
      table(
        ['EMP001', 30000, null, 750, 27500],
        ['EMP002', 'abc', 250, 750, 18250],
        ['EMP001', 1, 1, 1, 1],
      ),
      people,
    );

    expect(result.problems.map((p) => [p.row, p.column, p.code])).toEqual([
      [2, 'C', 'REQUIRED'],
      [3, 'B', 'INVALID_AMOUNT'],
      [4, 'A', 'DUPLICATE_IN_FILE'],
    ]);
    expect(result.people).toEqual([]);
  });

  it('refuses an empty file', () => {
    expect(compareParallelRun(table(), people).problems.map((p) => p.code)).toEqual(['NO_ROWS']);
  });
});
