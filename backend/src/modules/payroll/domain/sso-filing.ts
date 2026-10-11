// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Decimal, round2 } from '../../../core/utils/money.util';
import { computeSocialSecurity, type TaxRuleSet } from './thai-tax';

/**
 * The monthly social security filing, สปส.1-10 (CW-048). Pure: the service
 * gathers the payslips and the people; this only works out what the form says.
 *
 * The contribution is `computeSocialSecurity`, the function the payslips use
 * (CW-084), because what is withheld has to equal what is filed: a wage under
 * the floor is worked on the floor, one over the ceiling on the ceiling, each
 * person's amount is rounded to the baht and the employer's share is the same.
 * The ceiling and floor are the ones in force for the filing's year. An insured
 * person who was paid nothing that month is listed all the same, with nil
 * (note 6 of the form).
 */

/** One payslip's part of a month, as stored. Both halves of a month come in separately. */
export interface FilingSlip {
  employeeId: string;
  /** The wage social security was worked out on, before the ceiling. */
  ssoWage: number;
  ssoEmployee: number;
  ssoEmployer: number;
}

/** What identifies the person to the Social Security Office, as HR recorded it. */
export interface FilingPerson {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  /** A passport or a work permit is on the record: the form asks for the card number. */
  foreign: boolean;
  nationalId: string | null;
  socialSecurityNo: string | null;
}

export type FilingIdentifierKind = 'NATIONAL_ID' | 'SOCIAL_SECURITY_CARD';

export type FilingProblemCode =
  | 'NO_NATIONAL_ID'
  | 'NATIONAL_ID_NOT_13_DIGITS'
  | 'NO_SOCIAL_SECURITY_CARD'
  | 'SOCIAL_SECURITY_CARD_NOT_DIGITS';

export interface FilingProblem {
  employeeId: string;
  employeeCode: string;
  name: string;
  code: FilingProblemCode;
  message: string;
}

export interface FilingRow {
  /** 1-based, in employee-code order, as the form's ลำดับที่. */
  sequence: number;
  employeeId: string;
  employeeCode: string;
  identifierKind: FilingIdentifierKind;
  identifier: string;
  name: string;
  /** ค่าจ้างที่จ่ายจริง: the month's wage, both halves added up. */
  wage: string;
  /** The wage the contribution is worked out on, after the floor and the ceiling. */
  contributoryWage: string;
  /** เงินสมทบผู้ประกันตน, whole baht; the employer's share is the same. */
  employee: string;
  employer: string;
  /** What the month's payslips deducted from the employee and the employer. */
  deductedEmployee: string;
  deductedEmployer: string;
  /** True when the payslips deducted something other than what the form says. */
  differsFromPayslips: boolean;
}

export interface FilingTotals {
  /** จำนวนผู้ประกันตนที่ส่งเงินสมทบ */
  insured: number;
  /** เงินค่าจ้างทั้งสิ้น */
  wage: string;
  /** เงินสมทบผู้ประกันตน */
  employee: string;
  /** เงินสมทบนายจ้าง */
  employer: string;
  /** รวมเงินสมทบที่นำส่งทั้งสิ้น */
  total: string;
  deductedEmployee: string;
  deductedEmployer: string;
}

export interface FilingSheet {
  year: number;
  month: number;
  /** The rate the form states, as a percentage ("5"). */
  ratePercent: string;
  floor: number;
  ceiling: number;
  rows: FilingRow[];
  totals: FilingTotals;
  /** Anyone who cannot be put on the form. While there are any, nothing is exported. */
  problems: FilingProblem[];
}

const baht = (value: Decimal): string => value.toFixed(2);

const digitsOnly = (value: string): string => value.replace(/[\s-]/g, '');

function identify(person: FilingPerson):
  | {
      kind: FilingIdentifierKind;
      value: string;
    }
  | { problem: FilingProblemCode; message: string } {
  if (person.foreign) {
    const card = digitsOnly(person.socialSecurityNo ?? '');
    if (!card) {
      return {
        problem: 'NO_SOCIAL_SECURITY_CARD',
        message:
          'A foreign worker is filed under the social security card number, and none is recorded',
      };
    }
    if (!/^\d+$/.test(card)) {
      return {
        problem: 'SOCIAL_SECURITY_CARD_NOT_DIGITS',
        message: 'The social security card number is not digits only',
      };
    }
    return { kind: 'SOCIAL_SECURITY_CARD', value: card };
  }
  const id = digitsOnly(person.nationalId ?? '');
  if (!id) {
    return { problem: 'NO_NATIONAL_ID', message: 'No national ID number is recorded' };
  }
  if (!/^\d{13}$/.test(id)) {
    return {
      problem: 'NATIONAL_ID_NOT_13_DIGITS',
      message: 'The national ID number is not 13 digits',
    };
  }
  return { kind: 'NATIONAL_ID', value: id };
}

/**
 * The month's form: one row per insured person, the two halves of a month
 * added up first and the floor, the ceiling and the rounding applied once.
 * Someone who cannot be put on the form is reported by name, never left out.
 */
export function filingSheet(
  year: number,
  month: number,
  slips: FilingSlip[],
  people: FilingPerson[],
  rules: TaxRuleSet,
): FilingSheet {
  const byPerson = new Map<string, { wage: Decimal; employee: Decimal; employer: Decimal }>();
  for (const slip of slips) {
    const sum = byPerson.get(slip.employeeId) ?? {
      wage: new Decimal(0),
      employee: new Decimal(0),
      employer: new Decimal(0),
    };
    sum.wage = sum.wage.plus(slip.ssoWage);
    sum.employee = sum.employee.plus(slip.ssoEmployee);
    sum.employer = sum.employer.plus(slip.ssoEmployer);
    byPerson.set(slip.employeeId, sum);
  }

  const directory = new Map(people.map((person) => [person.employeeId, person]));
  const problems: FilingProblem[] = [];
  const rows: FilingRow[] = [];

  const ordered = [...byPerson.entries()]
    .map(([employeeId, sum]) => ({ employeeId, sum, person: directory.get(employeeId) }))
    .filter((entry): entry is typeof entry & { person: FilingPerson } => entry.person !== undefined)
    .sort((a, b) => a.person.employeeCode.localeCompare(b.person.employeeCode));

  for (const { employeeId, sum, person } of ordered) {
    const name = `${person.firstName} ${person.lastName}`.trim();
    const who = identify(person);
    if ('problem' in who) {
      problems.push({
        employeeId,
        employeeCode: person.employeeCode,
        name,
        code: who.problem,
        message: who.message,
      });
      continue;
    }
    // The same function the payslips use: what is withheld has to equal what is filed.
    const { contributoryWage, employeeContribution: amount } = computeSocialSecurity(
      sum.wage,
      rules,
    );
    rows.push({
      sequence: rows.length + 1,
      employeeId,
      employeeCode: person.employeeCode,
      identifierKind: who.kind,
      identifier: who.value,
      name,
      wage: baht(round2(sum.wage)),
      contributoryWage: baht(contributoryWage),
      employee: baht(amount),
      employer: baht(amount),
      deductedEmployee: baht(round2(sum.employee)),
      deductedEmployer: baht(round2(sum.employer)),
      differsFromPayslips:
        !round2(sum.employee).equals(amount) || !round2(sum.employer).equals(amount),
    });
  }

  const add = (pick: (row: FilingRow) => string) =>
    rows.reduce((acc, row) => acc.plus(pick(row)), new Decimal(0));
  const employee = add((row) => row.employee);
  const employer = add((row) => row.employer);
  return {
    year,
    month,
    ratePercent: new Decimal(rules.socialSecurity.rate).times(100).toString(),
    floor: rules.socialSecurity.minMonthlyWage,
    ceiling: rules.socialSecurity.maxMonthlyWage,
    rows,
    totals: {
      insured: rows.length,
      wage: baht(add((row) => row.wage)),
      employee: baht(employee),
      employer: baht(employer),
      total: baht(employee.plus(employer)),
      deductedEmployee: baht(add((row) => row.deductedEmployee)),
      deductedEmployer: baht(add((row) => row.deductedEmployer)),
    },
    problems,
  };
}
