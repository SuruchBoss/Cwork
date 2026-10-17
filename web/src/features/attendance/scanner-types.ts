// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { ImportProblem } from '../imports/import-problems';

/** Mirrors backend/src/modules/attendance/scanner-import.service.ts (CW-061). */

export type ScannerDayStatus =
  'NO_PUNCH' | 'UNMAPPED' | 'COUNTED' | 'WAITING' | 'DECIDED_USE' | 'DECIDED_IGNORE';

export type ScannerStatusFilter = ScannerDayStatus | 'ALL';

export type WaitingReason = 'ONE_TIME' | 'MANY_TIMES';

export interface UnmappedNumber {
  scannerNumber: string;
  name: string;
  days: number;
  daysWithTimes: number;
  firstDay: string;
  lastDay: string;
}

interface DayCounts {
  added: number;
  changed: number;
  unchanged: number;
}

export interface ScannerPreview {
  fileName: string;
  problems: ImportProblem[];
  dateFrom: string | null;
  dateTo: string | null;
  lines: number;
  days: DayCounts;
  byStatus: Record<ScannerDayStatus, number>;
  punchesToAdd: number;
  unmapped: UnmappedNumber[];
}

export interface ScannerCommitResult {
  importId: string;
  fileName: string;
  dateFrom: string;
  dateTo: string;
  lines: number;
  days: DayCounts;
  byStatus: Record<ScannerDayStatus, number>;
  punchesAdded: number;
  lockedDays: number;
  unmapped: UnmappedNumber[];
}

export interface ScannerImportRow {
  id: string;
  fileName: string;
  dateFrom: string;
  dateTo: string;
  lines: number;
  daysAdded: number;
  daysChanged: number;
  punchesAdded: number;
  importedAt: string;
}

export interface ScannerDay {
  id: string;
  scannerNumber: string;
  name: string;
  workDate: string;
  times: string[];
  status: ScannerDayStatus;
  reason: WaitingReason | null;
  employee: { id: string; employeeCode: string; name: string } | null;
  decision: {
    action: 'USE' | 'IGNORE';
    clockIn: string | null;
    clockOut: string | null;
    note: string | null;
    decidedAt: string;
  } | null;
  decisionOutdated: boolean;
  punchesCounted: number;
  locked: boolean;
}

export interface ScannerDaysPage {
  from: string | null;
  to: string | null;
  items: ScannerDay[];
  total: number;
  page: number;
  limit: number;
  totals: {
    days: number;
    waiting: number;
    counted: number;
    decidedUse: number;
    decidedIgnore: number;
    noPunch: number;
    unmapped: number;
    locked: number;
  };
}

export interface ScannerDecision {
  action: 'USE' | 'IGNORE';
  clockIn?: string;
  clockOut?: string;
}
