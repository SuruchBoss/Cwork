// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { ImportProblem } from '../imports/import-problems';

/** Mirrors backend/src/modules/payroll/domain/period-check.ts (CW-089). Amounts are baht as text, to the satang. */

export interface TotalCheck {
  cwork: string;
  filed: string;
  /** What was filed minus Cwork's figure. */
  difference: string;
  matches: boolean;
}

export interface PeriodComparison {
  period: { code: string; year: number; month: number };
  tax: TotalCheck | null;
  sso: (TotalCheck & { employee: string; employer: string }) | null;
}

export type FigureKey = 'gross' | 'tax' | 'sso' | 'net';

export interface FigureDiff {
  cwork: string;
  theirs: string;
  /** Theirs minus Cwork's. */
  difference: string;
  differs: boolean;
}

export interface PersonDiff {
  row: number;
  employeeCode: string;
  name: string;
  figures: Record<FigureKey, FigureDiff>;
  differs: boolean;
}

export interface ParallelRunReport {
  fileName: string;
  period: { code: string; year: number; month: number };
  people: PersonDiff[];
  onlyInFile: { row: number; employeeCode: string }[];
  onlyInCwork: { employeeCode: string; name: string }[];
  problems: ImportProblem[];
  totals: { people: number; differing: number; onlyInFile: number; onlyInCwork: number };
}
