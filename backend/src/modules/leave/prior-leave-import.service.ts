// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AuditAction, EmployeeStatus, Prisma, type LeaveType } from '@prisma/client';
import { BusinessRuleError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { importProblem, type ImportProblem } from '../../core/spreadsheet/problems';
import { readTable, TableError, type Table } from '../../core/spreadsheet/table';
import type { UploadedTable } from '../../core/spreadsheet/upload';
import { writeXlsx } from '../../core/spreadsheet/xlsx';
import { workDateFor } from '../../core/utils/date.util';
import { Decimal } from '../../core/utils/money.util';
import { AuditService } from '../audit/audit.service';
import {
  availableBalance,
  computeAccruedQuota,
  type SeniorityTier,
} from './domain/leave-calculator';
import {
  readPriorLeave,
  type PriorLeaveContext,
  type PriorLeaveRow,
} from './domain/prior-leave-import';
import { LeaveBalanceService } from './leave-balance.service';

export interface PriorLeavePreview {
  fileName: string;
  year: number;
  leaveTypes: { id: string; code: string; name: string }[];
  /** Employees whose leave the file sets; empty unless `problems` is. */
  rows: PriorLeaveRow[];
  problems: ImportProblem[];
}

/** People who can still hold leave: everyone not yet gone. */
const CURRENT: EmployeeStatus[] = [
  EmployeeStatus.PRE_BOARDING,
  EmployeeStatus.PROBATION,
  EmployeeStatus.ACTIVE,
  EmployeeStatus.ON_LEAVE,
  EmployeeStatus.SUSPENDED,
];

/**
 * Leave taken this year before the company moved to Cwork (CW-059).
 *
 * The template is filled in already: every current employee on a row, every
 * leave type in a column, so HR only types numbers. `preview` checks the file
 * and says what each balance becomes; `commit` checks it again and sets the
 * figures in one transaction. Setting rather than adding is what makes a
 * second import of the same file harmless.
 */
@Injectable()
export class PriorLeaveImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balances: LeaveBalanceService,
  ) {}

  async template(
    organizationId: string,
    language: 'th' | 'en',
  ): Promise<{ filename: string; content: Buffer }> {
    const [{ year }, employees, types] = await Promise.all([
      this.leaveYear(organizationId),
      this.currentEmployees(organizationId),
      this.leaveTypes(organizationId),
    ]);
    const typeName = (t: LeaveType) => (language === 'en' ? (t.nameEn ?? t.name) : t.name);
    const header =
      language === 'th'
        ? ['รหัสพนักงาน', 'ชื่อ', ...types.map(typeName)]
        : ['Employee code', 'Name', ...types.map(typeName)];
    const guide =
      language === 'th'
        ? [
            [`วันลาที่พนักงานแต่ละคนใช้ไปแล้วในปี ${year + 543} ก่อนเริ่มใช้ Cwork`],
            ['กรอกจำนวนวันในช่องของประเภทการลา เช่น 3 หรือ 0.5 สำหรับครึ่งวัน'],
            ['ช่องว่าง = ไม่เปลี่ยนแปลง  ใส่ 0 = ยังไม่ได้ลาเลย'],
            ['นำเข้าซ้ำได้ ระบบจะใช้ตัวเลขล่าสุดแทนของเดิม ไม่บวกเพิ่ม'],
            ['ลบแถวหรือคอลัมน์ที่ไม่ใช้ได้ แต่ห้ามเปลี่ยนรหัสพนักงานหรือชื่อหัวคอลัมน์'],
          ]
        : [
            [`Leave each employee took in ${year}, before the company started using Cwork.`],
            ["Type the days in each leave type's column: 3, or 0.5 for half a day."],
            ['A blank cell changes nothing. 0 means none taken.'],
            ['Importing again replaces the figures rather than adding to them.'],
            ["Rows and columns you do not need can be deleted; don't change codes or headings."],
          ];

    const content = writeXlsx([
      {
        name: language === 'th' ? 'วันลาที่ใช้ไป' : 'Leave taken',
        header: true,
        widths: [14, 26, ...types.map(() => 14)],
        rows: [header, ...employees.map((e) => [e.employeeCode, fullName(e)])],
      },
      { name: language === 'th' ? 'คำอธิบาย' : 'Guide', widths: [100], rows: guide },
    ]);
    return {
      // ASCII on purpose: a browser saving a Blob may drop a Thai name.
      filename: `cwork-leave-taken-${year}-${language}.xlsx`,
      content: Buffer.from(content),
    };
  }

  async preview(user: AuthenticatedUser, file: UploadedTable): Promise<PriorLeavePreview> {
    const { year, types, rows, problems } = await this.check(user.organizationId, file);
    return {
      fileName: file.originalname,
      year,
      leaveTypes: types.map((t) => ({ id: t.id, code: t.code, name: t.name })),
      rows,
      problems,
    };
  }

  async commit(
    user: AuthenticatedUser,
    file: UploadedTable,
  ): Promise<{ employees: number; year: number }> {
    const { year, types, rows, problems } = await this.check(user.organizationId, file);
    if (problems.length > 0) {
      throw new BusinessRuleError(
        'IMPORT_HAS_PROBLEMS',
        `The file has ${problems.length} problem(s); nothing was imported`,
        { problems },
      );
    }

    const typeById = new Map(types.map((t) => [t.id, t]));
    await this.prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          for (const { leaveTypeId, days } of row.taken) {
            const entitlement = await this.balances.ensureEntitlement(
              tx,
              user.organizationId,
              row.employeeId,
              typeById.get(leaveTypeId)!,
              year,
            );
            await tx.leaveEntitlement.update({
              where: { id: entitlement.id },
              data: { priorUsed: new Prisma.Decimal(days.toFixed(2)) },
            });
          }
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.UPDATE,
      entityType: 'LeaveEntitlement',
      summary: `Imported leave taken before Cwork in ${year} for ${rows.length} employee(s) from "${file.originalname}"`,
      changes: {
        fileName: file.originalname,
        year,
        rows: rows.length,
        taken: rows.map((r) => ({
          employeeCode: r.employeeCode,
          days: Object.fromEntries(r.taken.map((t) => [typeById.get(t.leaveTypeId)!.code, t.days])),
        })),
      },
    });

    return { employees: rows.length, year };
  }

  private async check(organizationId: string, file: UploadedTable) {
    const [{ year }, employees, types] = await Promise.all([
      this.leaveYear(organizationId),
      this.currentEmployees(organizationId),
      this.leaveTypes(organizationId),
    ]);

    let table: Table;
    try {
      table = readTable(file.buffer);
    } catch (error) {
      if (!(error instanceof TableError)) throw error;
      return { year, types, rows: [], problems: [importProblem(error.problem, { row: 0 })] };
    }

    const context: PriorLeaveContext = {
      employees: new Map(
        employees.map((e) => [
          e.employeeCode,
          { id: e.id, code: e.employeeCode, name: fullName(e), gender: e.gender },
        ]),
      ),
      leaveTypes: types,
      availableBefore: await this.availableBefore(employees, types, year),
    };
    return { year, types, ...readPriorLeave(table, context) };
  }

  /**
   * Each balance as it would be with no leave counted from before Cwork: the
   * figure the file's days are taken from. Worked out the same way as the
   * balance screen, for entitlements that do not exist yet as well.
   */
  private async availableBefore(
    employees: { id: string; hireDate: Date }[],
    types: LeaveType[],
    year: number,
  ): Promise<PriorLeaveContext['availableBefore']> {
    const entitlements = await this.prisma.leaveEntitlement.findMany({
      where: { year, employeeId: { in: employees.map((e) => e.id) } },
    });
    const byKey = new Map(entitlements.map((e) => [`${e.employeeId}:${e.leaveTypeId}`, e]));
    const hireDate = new Map(employees.map((e) => [e.id, e.hireDate]));
    const typeById = new Map(types.map((t) => [t.id, t]));

    return (employeeId, leaveTypeId) => {
      const entitlement = byKey.get(`${employeeId}:${leaveTypeId}`);
      const type = typeById.get(leaveTypeId)!;
      const granted = entitlement
        ? entitlement.granted
        : computeAccruedQuota({
            method: type.accrualMethod,
            defaultQuota: Number(type.defaultQuota),
            seniorityTiers: (type.seniorityTiers as unknown as SeniorityTier[]) ?? [],
            hireDate: hireDate.get(employeeId)!,
            year,
          });
      return availableBalance({
        openingBalance: entitlement?.openingBalance ?? 0,
        granted: new Decimal(granted.toString()),
        carriedOver: entitlement?.carriedOver ?? 0,
        adjusted: entitlement?.adjusted ?? 0,
        used: entitlement?.used ?? 0,
        pending: entitlement?.pending ?? 0,
        expired: entitlement?.expired ?? 0,
        // Replaced by the file, so not counted against it.
        priorUsed: 0,
      }).toNumber();
    };
  }

  private async leaveYear(organizationId: string): Promise<{ year: number }> {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return { year: workDateFor(new Date(), organization.timezone).getUTCFullYear() };
  }

  private currentEmployees(organizationId: string) {
    return this.prisma.employee.findMany({
      where: { organizationId, deletedAt: null, status: { in: CURRENT } },
      select: {
        id: true,
        employeeCode: true,
        firstNameTh: true,
        lastNameTh: true,
        gender: true,
        hireDate: true,
      },
      orderBy: { employeeCode: 'asc' },
    });
  }

  private leaveTypes(organizationId: string) {
    return this.prisma.leaveType.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
      orderBy: { orderIndex: 'asc' },
    });
  }
}

function fullName(e: { firstNameTh: string; lastNameTh: string }): string {
  return `${e.firstNameTh} ${e.lastNameTh}`;
}
