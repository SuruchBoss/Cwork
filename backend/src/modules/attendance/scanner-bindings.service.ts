// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { formatDateOnly, toDateOnly } from '../../core/utils/date.util';
import { AuditService } from '../audit/audit.service';
import { OrganizationService } from '../organization/organization.service';
import { earliestFreeStart, periodsOverlap, type ScannerBinding } from './domain/scanner-binding';

/** A binding as the API says it. */
export interface ScannerBindingView {
  id: string;
  employeeId: string;
  scannerNumber: string;
  validFrom: string | null;
  validTo: string | null;
}

type Db = Prisma.TransactionClient | PrismaService;

const view = (row: {
  id: string;
  employeeId: string;
  scannerNumber: string;
  validFrom: Date | null;
  validTo: Date | null;
}): ScannerBindingView => ({
  id: row.id,
  employeeId: row.employeeId,
  scannerNumber: row.scannerNumber,
  validFrom: row.validFrom ? formatDateOnly(row.validFrom) : null,
  validTo: row.validTo ? formatDateOnly(row.validTo) : null,
});

const asBinding = (row: ScannerBindingView): ScannerBinding => ({
  employeeId: row.employeeId,
  scannerNumber: row.scannerNumber,
  validFrom: row.validFrom,
  validTo: row.validTo,
});

/**
 * Which employee a scanner number belongs to, and for which days (CW-109).
 *
 * Every rule here is also kept by the database (two periods of one number never
 * overlap, one employee has one number in use), so two requests at once cannot
 * both succeed; the checks first are for a clear answer in Thai, and a refusal
 * from the database is turned into the same answer.
 */
@Injectable()
export class ScannerBindingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly organization: OrganizationService,
  ) {}

  /** The number each of these employees uses now. */
  async inUse(employeeIds: string[], db: Db = this.prisma): Promise<Map<string, string>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await db.employeeScannerNumber.findMany({
      where: { employeeId: { in: employeeIds }, validTo: null },
      select: { employeeId: true, scannerNumber: true },
    });
    return new Map(rows.map((r) => [r.employeeId, r.scannerNumber]));
  }

  /** The numbers an employee has had, newest first. */
  async history(organizationId: string, employeeId: string): Promise<ScannerBindingView[]> {
    const rows = await this.prisma.employeeScannerNumber.findMany({
      where: { organizationId, employeeId },
      orderBy: [{ validFrom: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return rows.map(view);
  }

  /**
   * Every period of these numbers that belongs to someone still on the books, for
   * matching days. A person who has left (deleted) counts days to no one.
   */
  async forNumbers(
    organizationId: string,
    scannerNumbers: string[],
    db: Db = this.prisma,
  ): Promise<ScannerBinding[]> {
    if (scannerNumbers.length === 0) return [];
    const rows = await db.employeeScannerNumber.findMany({
      where: {
        organizationId,
        scannerNumber: { in: scannerNumbers },
        employee: { deletedAt: null },
      },
      select: { id: true, employeeId: true, scannerNumber: true, validFrom: true, validTo: true },
    });
    return rows.map((r) => asBinding(view(r)));
  }

  /**
   * Binds a number to an employee. `from` null is from the beginning, `to` null is
   * still in use. Refuses a period that meets another period of the same number,
   * and a second number in use for the same employee.
   */
  async bind(
    input: {
      organizationId: string;
      actorUserId: string;
      employeeId: string;
      scannerNumber: string;
      from: string | null;
      to: string | null;
    },
    db: Db = this.prisma,
  ): Promise<ScannerBindingView> {
    const { organizationId, employeeId, scannerNumber, from, to } = input;
    if (from !== null && to !== null && to < from) {
      throw new BusinessRuleError('SCANNER_PERIOD_ORDER', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น', {
        from,
        to,
      });
    }
    const employee = await db.employee.findFirst({
      where: { id: employeeId, organizationId, deletedAt: null },
      select: { id: true, employeeCode: true },
    });
    if (!employee) throw new NotFoundError('Employee', employeeId);

    if (to === null) {
      const open = await db.employeeScannerNumber.findFirst({
        where: { employeeId, validTo: null },
        select: { scannerNumber: true },
      });
      if (open) throw this.alreadyHasNumber(employee.employeeCode, open.scannerNumber);
    }
    await this.assertFree(db, organizationId, scannerNumber, { validFrom: from, validTo: to });

    try {
      const row = await db.employeeScannerNumber.create({
        data: {
          organizationId,
          employeeId,
          scannerNumber,
          validFrom: from ? toDateOnly(from) : null,
          validTo: to ? toDateOnly(to) : null,
          createdById: input.actorUserId,
        },
      });
      return view(row);
    } catch (error) {
      throw this.refusalFrom(error, employee.employeeCode, scannerNumber) ?? error;
    }
  }

  /**
   * The number an employee uses now, as the employee page and the employee file
   * set it (CW-090): a number typed over the one in use corrects it in place, a
   * first number counts from the beginning (or from the day after an earlier end
   * of that number), and an empty one ends the number today.
   */
  async setInUse(
    input: {
      organizationId: string;
      actorUserId: string;
      employeeId: string;
      scannerNumber: string | null;
    },
    db: Db = this.prisma,
  ): Promise<{ changed: boolean; previous: string | null }> {
    const { organizationId, employeeId, scannerNumber } = input;
    const open = await db.employeeScannerNumber.findFirst({
      where: { employeeId, validTo: null },
    });

    if (scannerNumber === null) {
      if (!open) return { changed: false, previous: null };
      const today = formatDateOnly(await this.organization.today(organizationId));
      const ends =
        open.validFrom && formatDateOnly(open.validFrom) > today
          ? formatDateOnly(open.validFrom)
          : today;
      await db.employeeScannerNumber.update({
        where: { id: open.id },
        data: { validTo: toDateOnly(ends) },
      });
      return { changed: true, previous: open.scannerNumber };
    }
    if (open?.scannerNumber === scannerNumber) {
      return { changed: false, previous: open.scannerNumber };
    }

    const employee = await db.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { employeeCode: true },
    });
    if (!employee) throw new NotFoundError('Employee', employeeId);

    if (open) {
      const span = {
        validFrom: open.validFrom ? formatDateOnly(open.validFrom) : null,
        validTo: null,
      };
      await this.assertFree(db, organizationId, scannerNumber, span, open.id);
      try {
        await db.employeeScannerNumber.update({
          where: { id: open.id },
          data: { scannerNumber },
        });
      } catch (error) {
        throw this.refusalFrom(error, employee.employeeCode, scannerNumber) ?? error;
      }
      return { changed: true, previous: open.scannerNumber };
    }

    const earlier = await db.employeeScannerNumber.findMany({
      where: { organizationId, scannerNumber },
      select: { validFrom: true, validTo: true },
    });
    const from = earliestFreeStart(
      earlier.map((p) => ({
        validFrom: p.validFrom ? formatDateOnly(p.validFrom) : null,
        validTo: p.validTo ? formatDateOnly(p.validTo) : null,
      })),
    );
    if (from === undefined) {
      // Still in use by someone else: say who.
      await this.assertFree(db, organizationId, scannerNumber, { validFrom: null, validTo: null });
    }
    await this.bind(
      {
        organizationId,
        actorUserId: input.actorUserId,
        employeeId,
        scannerNumber,
        from: from ?? null,
        to: null,
      },
      db,
    );
    return { changed: true, previous: null };
  }

  /** Ends a number that is in use, on the day given: it counts through that day. */
  async end(
    user: { organizationId: string; userId: string },
    bindingId: string,
    endDate: string,
  ): Promise<ScannerBindingView> {
    const row = await this.prisma.employeeScannerNumber.findFirst({
      where: { id: bindingId, organizationId: user.organizationId },
      include: { employee: { select: { employeeCode: true } } },
    });
    if (!row) throw new NotFoundError('ScannerNumber', bindingId);
    if (row.validTo !== null) {
      throw new BusinessRuleError(
        'SCANNER_NUMBER_ALREADY_ENDED',
        `เลขสแกน ${row.scannerNumber} ของพนักงาน ${row.employee.employeeCode} สิ้นสุดไปแล้ว`,
        { endedOn: formatDateOnly(row.validTo) },
      );
    }
    if (row.validFrom && endDate < formatDateOnly(row.validFrom)) {
      throw new BusinessRuleError('SCANNER_PERIOD_ORDER', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น', {
        from: formatDateOnly(row.validFrom),
        to: endDate,
      });
    }
    const updated = await this.prisma.employeeScannerNumber.update({
      where: { id: row.id },
      data: { validTo: toDateOnly(endDate) },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.UPDATE,
      entityType: 'Employee',
      entityId: row.employeeId,
      summary: `Ended scanner number ${row.scannerNumber} of employee ${row.employee.employeeCode} on ${endDate}`,
      changes: { scannerNumber: row.scannerNumber, validTo: { from: null, to: endDate } },
    });
    return view(updated);
  }

  /** The day after the latest end of a number, for "from now on" bindings. */
  async firstFreeStart(organizationId: string, scannerNumber: string): Promise<string | null> {
    const earlier = await this.prisma.employeeScannerNumber.findMany({
      where: { organizationId, scannerNumber },
      select: { validFrom: true, validTo: true },
    });
    const start = earliestFreeStart(
      earlier.map((p) => ({
        validFrom: p.validFrom ? formatDateOnly(p.validFrom) : null,
        validTo: p.validTo ? formatDateOnly(p.validTo) : null,
      })),
    );
    if (start === undefined) {
      const holder = await this.prisma.employeeScannerNumber.findFirst({
        where: { organizationId, scannerNumber, validTo: null },
        select: { employee: { select: { employeeCode: true } } },
      });
      throw this.numberTaken(scannerNumber, holder?.employee.employeeCode ?? '');
    }
    return start;
  }

  // ------------------------------------------------------------- internals

  /** The number is free over the whole period, except for one period being changed. */
  private async assertFree(
    db: Db,
    organizationId: string,
    scannerNumber: string,
    span: { validFrom: string | null; validTo: string | null },
    exceptId?: string,
  ): Promise<void> {
    const others = await db.employeeScannerNumber.findMany({
      where: { organizationId, scannerNumber, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: {
        validFrom: true,
        validTo: true,
        employee: { select: { employeeCode: true } },
      },
    });
    const meeting = others.find((other) =>
      periodsOverlap(span, {
        validFrom: other.validFrom ? formatDateOnly(other.validFrom) : null,
        validTo: other.validTo ? formatDateOnly(other.validTo) : null,
      }),
    );
    if (meeting) throw this.numberTaken(scannerNumber, meeting.employee.employeeCode);
  }

  private numberTaken(scannerNumber: string, employeeCode: string) {
    return new ConflictError(
      'DUPLICATE_SCANNER_ID',
      employeeCode
        ? `เลขสแกน ${scannerNumber} เป็นของพนักงาน ${employeeCode} ในช่วงวันที่ทับกัน`
        : `เลขสแกน ${scannerNumber} มีผู้ใช้อยู่ในช่วงวันที่ทับกัน`,
      { employeeCode, scannerNumber },
    );
  }

  private alreadyHasNumber(employeeCode: string, scannerNumber: string) {
    return new BusinessRuleError(
      'EMPLOYEE_HAS_SCANNER_NUMBER',
      `พนักงาน ${employeeCode} ใช้เลขสแกน ${scannerNumber} อยู่แล้ว ให้สิ้นสุดเลขนั้นก่อน`,
      { employeeCode, scannerNumber },
    );
  }

  /** A refusal by the database, said as the checks above would have said it. */
  private refusalFrom(error: unknown, employeeCode: string, scannerNumber: string) {
    const text = error instanceof Error ? error.message : '';
    const code = (error as { code?: string; meta?: { code?: string } } | null)?.meta?.code;
    if (text.includes('employee_scanner_numbers_no_overlap') || code === '23P01') {
      return this.numberTaken(scannerNumber, '');
    }
    if (text.includes('employee_scanner_numbers_one_in_use_idx')) {
      return this.alreadyHasNumber(employeeCode, scannerNumber);
    }
    if ((error as { code?: string } | null)?.code === 'P2002') {
      return this.alreadyHasNumber(employeeCode, scannerNumber);
    }
    return null;
  }
}
