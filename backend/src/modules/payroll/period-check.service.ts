// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { importProblem, type ImportProblem } from '../../core/spreadsheet/problems';
import { readTable, TableError } from '../../core/spreadsheet/table';
import type { UploadedTable } from '../../core/spreadsheet/upload';
import { Decimal } from '../../core/utils/money.util';
import {
  compareFiledTotals,
  compareParallelRun,
  cworkPeople,
  type ParallelRunResult,
  type PeriodComparison,
} from './domain/period-check';
import type { ComparePeriodDto } from './dto/period-check.dto';
import { loadReconciledPeriod } from './reconciled-period';

export interface ParallelRunReport extends ParallelRunResult {
  fileName: string;
  period: { code: string; year: number; month: number };
  totals: { people: number; differing: number; onlyInFile: number; onlyInCwork: number };
}

/**
 * Checking a period against what was filed, and against HR's own method
 * (CW-089). Both read the period the way the export does, reconciled first, and
 * neither writes anything: the figures HR enters or uploads are used to answer
 * and then forgotten, and no payslip is read for writing.
 */
@Injectable()
export class PeriodCheckService {
  constructor(private readonly prisma: PrismaService) {}

  /** The period's tax and social security totals, beside the ones HR typed in. */
  async compare(
    user: AuthenticatedUser,
    periodId: string,
    dto: ComparePeriodDto,
  ): Promise<PeriodComparison> {
    if (dto.taxFiled === undefined && dto.ssoFiled === undefined) {
      throw new BusinessRuleError(
        'NOTHING_TO_COMPARE',
        'Enter the tax total, the social security total, or both',
      );
    }
    const { reconciled } = await loadReconciledPeriod(this.prisma, user.organizationId, periodId);
    return compareFiledTotals(reconciled, {
      tax: dto.taxFiled === undefined ? null : new Decimal(dto.taxFiled),
      sso: dto.ssoFiled === undefined ? null : new Decimal(dto.ssoFiled),
    });
  }

  /** HR's own figures for the period, person by person, against Cwork's. */
  async parallelRun(
    user: AuthenticatedUser,
    periodId: string,
    file: UploadedTable,
  ): Promise<ParallelRunReport> {
    const { period, reconciled } = await loadReconciledPeriod(
      this.prisma,
      user.organizationId,
      periodId,
    );
    const shown = { code: period.code, year: period.year, month: period.month };

    let result: ParallelRunResult;
    try {
      result = compareParallelRun(readTable(file.buffer), cworkPeople(reconciled));
    } catch (error) {
      if (!(error instanceof TableError)) throw error;
      const problems: ImportProblem[] = [importProblem(error.problem, { row: 0 })];
      result = { people: [], onlyInFile: [], onlyInCwork: [], problems };
    }
    return {
      fileName: file.originalname,
      period: shown,
      ...result,
      totals: {
        people: result.people.length,
        differing: result.people.filter((person) => person.differs).length,
        onlyInFile: result.onlyInFile.length,
        onlyInCwork: result.onlyInCwork.length,
      },
    };
  }
}
