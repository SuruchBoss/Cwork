// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BusinessRuleError,
  ConflictError,
  ErrorCode,
  NotFoundError,
} from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  eachDateInRange,
  formatDateOnly,
  isoWeekday,
  toDateOnly,
} from '../../core/utils/date.util';
import { resolveWorkCalendar } from './domain/work-calendar';
import { organizationToday } from './organization-today';
import type {
  CreateDepartmentDto,
  CreateHolidayDto,
  UpdateHolidayDto,
  CreatePositionDto,
  CreateWorkLocationDto,
  UpdateDepartmentDto,
  UpdateOrganizationDto,
  UpdatePositionDto,
  UpdateWorkLocationDto,
} from './dto/organization.dto';

export interface DepartmentNode {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  headEmployeeId: string | null;
  employeeCount: number;
  children: DepartmentNode[];
}

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Today's calendar day where the organisation is (CW-074). */
  today(organizationId: string): Promise<Date> {
    return organizationToday(this.prisma, organizationId);
  }

  getOrganization(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  }

  updateOrganization(organizationId: string, dto: UpdateOrganizationDto) {
    return this.prisma.organization.update({ where: { id: organizationId }, data: dto });
  }

  // ---------------------------------------------------------------- departments

  listDepartments(organizationId: string, includeInactive = false) {
    return this.prisma.department.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ code: 'asc' }],
      include: {
        head: { select: { id: true, firstNameTh: true, lastNameTh: true } },
        _count: { select: { employees: true } },
      },
    });
  }

  /** Builds the department tree in one query instead of N recursive ones. */
  async getDepartmentTree(organizationId: string): Promise<DepartmentNode[]> {
    const departments = await this.prisma.department.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      orderBy: { code: 'asc' },
      include: { _count: { select: { employees: true } } },
    });

    const nodes = new Map<string, DepartmentNode>();
    for (const dept of departments) {
      nodes.set(dept.id, {
        id: dept.id,
        code: dept.code,
        name: dept.name,
        nameEn: dept.nameEn,
        headEmployeeId: dept.headEmployeeId,
        employeeCount: dept._count.employees,
        children: [],
      });
    }

    const roots: DepartmentNode[] = [];
    for (const dept of departments) {
      const node = nodes.get(dept.id)!;
      const parent = dept.parentId ? nodes.get(dept.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async createDepartment(organizationId: string, dto: CreateDepartmentDto) {
    if (dto.parentId) await this.assertDepartmentExists(organizationId, dto.parentId);
    return this.prisma.department.create({ data: { ...dto, organizationId } });
  }

  async updateDepartment(organizationId: string, id: string, dto: UpdateDepartmentDto) {
    await this.assertDepartmentExists(organizationId, id);
    if (dto.parentId) {
      await this.assertNoDepartmentCycle(organizationId, id, dto.parentId);
    }
    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async deleteDepartment(organizationId: string, id: string): Promise<void> {
    await this.assertDepartmentExists(organizationId, id);
    // Soft delete keeps historical records (payslips, org charts) readable.
    await this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ------------------------------------------------------------------ positions

  listPositions(organizationId: string, departmentId?: string) {
    return this.prisma.position.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isActive: true,
        ...(departmentId ? { departmentId } : {}),
      },
      orderBy: [{ level: 'desc' }, { title: 'asc' }],
      include: { department: { select: { id: true, name: true } } },
    });
  }

  createPosition(organizationId: string, dto: CreatePositionDto) {
    return this.prisma.position.create({ data: { ...dto, organizationId } });
  }

  async updatePosition(organizationId: string, id: string, dto: UpdatePositionDto) {
    await this.assertOwned('position', organizationId, id);
    return this.prisma.position.update({ where: { id }, data: dto });
  }

  // ------------------------------------------------------------- work locations

  listWorkLocations(organizationId: string) {
    return this.prisma.workLocation.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  createWorkLocation(organizationId: string, dto: CreateWorkLocationDto) {
    assertMinimumWageSource(dto.minimumDailyWage, dto.minimumDailyWageSource);
    return this.prisma.workLocation.create({
      data: {
        ...dto,
        organizationId,
        latitude: dto.latitude !== undefined ? new Prisma.Decimal(dto.latitude) : null,
        longitude: dto.longitude !== undefined ? new Prisma.Decimal(dto.longitude) : null,
      },
    });
  }

  async updateWorkLocation(organizationId: string, id: string, dto: UpdateWorkLocationDto) {
    const existing = await this.prisma.workLocation.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { code: true, minimumDailyWage: true, minimumDailyWageSource: true },
    });
    if (!existing) throw new NotFoundError('WorkLocation', id);
    assertMinimumWageSource(
      dto.minimumDailyWage !== undefined ? dto.minimumDailyWage : existing.minimumDailyWage,
      dto.minimumDailyWageSource !== undefined
        ? dto.minimumDailyWageSource
        : existing.minimumDailyWageSource,
    );

    // The code is an identifier once the site is first used: a correction before
    // that is ordinary editing, but after it the code is fixed and must be
    // replaced by superseding, never edited in place (CW-049). Every other field
    // stays freely editable.
    if (dto.code !== undefined && dto.code !== existing.code) {
      const reasons = await this.firstUseReasons(id);
      if (reasons.length > 0) {
        throw new BusinessRuleError(
          'WORK_LOCATION_CODE_LOCKED',
          `รหัสสถานที่ "${existing.code}" ถูกใช้งานแล้วจึงเปลี่ยนไม่ได้ (${reasons.join('; ')}) — ` +
            'หากรหัสผิด ให้สร้างสถานที่ใหม่แล้วแทนที่ (supersede) ของเดิม',
        );
      }
    }

    return this.prisma.workLocation.update({
      where: { id },
      data: {
        ...dto,
        latitude: dto.latitude !== undefined ? new Prisma.Decimal(dto.latitude) : undefined,
        longitude: dto.longitude !== undefined ? new Prisma.Decimal(dto.longitude) : undefined,
      },
    });
  }

  /**
   * Replaces a work location whose code is locked with a new one (CW-049).
   *
   * The old row is kept, deactivated, and pointed at its replacement, so every
   * punch and record that referenced it still resolves — where somebody worked
   * last year is a fact and is not rewritten. Employees based at the old site
   * are moved to the replacement so new punches go there.
   */
  async supersedeWorkLocation(organizationId: string, id: string, dto: CreateWorkLocationDto) {
    assertMinimumWageSource(dto.minimumDailyWage, dto.minimumDailyWageSource);
    const old = await this.prisma.workLocation.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!old) throw new NotFoundError('WorkLocation', id);

    return this.prisma.$transaction(async (tx) => {
      const replacement = await tx.workLocation.create({
        data: {
          ...dto,
          organizationId,
          latitude: dto.latitude !== undefined ? new Prisma.Decimal(dto.latitude) : null,
          longitude: dto.longitude !== undefined ? new Prisma.Decimal(dto.longitude) : null,
        },
      });
      await tx.workLocation.update({
        where: { id },
        data: { isActive: false, supersededById: replacement.id },
      });
      await tx.employee.updateMany({
        where: { workLocationId: id },
        data: { workLocationId: replacement.id },
      });
      return replacement;
    });
  }

  /**
   * Which of ADR-0006's "first used" events have happened to this location, as
   * human-readable reasons — empty while the code is still free to correct.
   *
   * Event 1 (a punch against it) and event 2 (an employee based at it) are
   * checked here. Event 2 is Cwork's representable form of the ADR's "a shift or
   * schedule assigned to it", since shifts and schedules attach to employees,
   * not to sites. Event 3 ("it appeared in an export that left the system") has
   * no source yet — no export carries a location code today — and is wired in
   * here the moment one does.
   */
  private async firstUseReasons(workLocationId: string): Promise<string[]> {
    const [punches, employees] = await Promise.all([
      this.prisma.attendancePunch.count({ where: { workLocationId } }),
      this.prisma.employee.count({ where: { workLocationId, deletedAt: null } }),
    ]);
    const reasons: string[] = [];
    if (punches > 0) reasons.push('มีการลงเวลาที่สถานที่นี้แล้ว');
    if (employees > 0) reasons.push('มีพนักงานประจำอยู่ที่สถานที่นี้');
    return reasons;
  }

  // ------------------------------------------------------------------- holidays

  /**
   * The holiday calendar. Each row says which holiday it is the substitute
   * for, if HR entered it as one, and an ordinary holiday on a weekend says
   * where the automatic rule moves it for a Monday-to-Friday week when no
   * substitute is entered (CW-081). Someone on another schedule gets their
   * own: the work calendar decides per employee.
   */
  async listHolidays(organizationId: string, year?: number) {
    const range = year
      ? { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 11, 31)) }
      : null;
    const rows = await this.prisma.holiday.findMany({
      where: { organizationId, ...(range ? { date: { gte: range.from, lte: range.to } } : {}) },
      orderBy: { date: 'asc' },
      include: { substituteFor: { select: { id: true, date: true, name: true } } },
    });
    if (rows.length === 0) return [];

    // The automatic substitute can cross into the next year; look a month on.
    const first = rows[0]!.date;
    const last = rows[rows.length - 1]!.date;
    const windowTo = new Date(
      Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + 31),
    );
    const around = await this.prisma.holiday.findMany({
      where: { organizationId, date: { gte: first, lte: windowTo } },
      select: {
        date: true,
        isPaid: true,
        workLocationId: true,
        substituteForId: true,
        substituteFor: { select: { date: true } },
      },
    });
    // A holiday HR has given a substitute day is not left to the automatic rule.
    const marked = new Set(around.flatMap((h) => (h.substituteForId ? [h.substituteForId] : [])));
    const automaticByScope = new Map<string | null, Map<string, string>>();
    const automaticFor = (workLocationId: string | null) => {
      if (!automaticByScope.has(workLocationId)) {
        const days = resolveWorkCalendar(
          eachDateInRange(first, windowTo).map((date) => ({
            date: formatDateOnly(date),
            scheduled: isoWeekday(date) <= 5,
            employed: true,
          })),
          around
            .filter((h) => h.workLocationId === null || h.workLocationId === workLocationId)
            .map((h) => ({
              date: formatDateOnly(h.date),
              isPaid: h.isPaid,
              substituteFor: h.substituteFor ? formatDateOnly(h.substituteFor.date) : null,
            })),
        );
        automaticByScope.set(
          workLocationId,
          new Map(
            days.filter((d) => d.substitutedOn !== null).map((d) => [d.date, d.substitutedOn!]),
          ),
        );
      }
      return automaticByScope.get(workLocationId)!;
    };

    return rows.map((row) => ({
      ...row,
      substituteOnWeekdays:
        row.substituteForId === null && !marked.has(row.id)
          ? (automaticFor(row.workLocationId).get(formatDateOnly(row.date)) ?? null)
          : null,
    }));
  }

  async createHoliday(organizationId: string, dto: CreateHolidayDto) {
    const date = toDateOnly(dto.date);
    if (dto.substituteForId) {
      await this.assertCanStandIn(organizationId, dto.substituteForId, {
        date,
        workLocationId: dto.workLocationId ?? null,
      });
    }
    return this.prisma.holiday.create({
      data: {
        organizationId,
        date,
        name: dto.name,
        nameEn: dto.nameEn,
        workLocationId: dto.workLocationId,
        substituteForId: dto.substituteForId,
      },
    });
  }

  /** Marks a holiday as the substitute for another, or back as an ordinary one. */
  async updateHoliday(organizationId: string, id: string, dto: UpdateHolidayDto) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, organizationId },
      select: { id: true, date: true, workLocationId: true, substitute: { select: { id: true } } },
    });
    if (!holiday) throw new NotFoundError('Holiday', id);
    if (dto.substituteForId) {
      if (holiday.substitute) {
        throw new BusinessRuleError(
          ErrorCode.SUBSTITUTE_OF_SUBSTITUTE,
          'This holiday has a substitute of its own, so it cannot be a substitute',
        );
      }
      await this.assertCanStandIn(organizationId, dto.substituteForId, holiday, id);
    }
    return this.prisma.holiday.update({
      where: { id },
      data: { substituteForId: dto.substituteForId ?? null },
    });
  }

  async deleteHoliday(organizationId: string, id: string): Promise<void> {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, organizationId },
      select: { substitute: { select: { date: true } } },
    });
    if (!holiday) throw new NotFoundError('Holiday', id);
    if (holiday.substitute) {
      throw new ConflictError(
        ErrorCode.HOLIDAY_HAS_SUBSTITUTE,
        'Remove the substitute day entered for this holiday first',
        { substituteDate: formatDateOnly(holiday.substitute.date) },
      );
    }
    await this.prisma.holiday.delete({ where: { id } });
  }

  /**
   * A substitute stands in for an ordinary holiday of the same calendar (the
   * whole organisation, or the same work location) that comes before it and
   * has no other substitute.
   */
  private async assertCanStandIn(
    organizationId: string,
    holidayId: string,
    substitute: { date: Date; workLocationId: string | null },
    substituteId?: string,
  ): Promise<void> {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id: holidayId, organizationId },
      select: {
        date: true,
        workLocationId: true,
        substituteForId: true,
        substitute: { select: { id: true } },
      },
    });
    if (!holiday) throw new NotFoundError('Holiday', holidayId);
    if (holiday.substituteForId !== null) {
      throw new BusinessRuleError(
        ErrorCode.SUBSTITUTE_OF_SUBSTITUTE,
        'A substitute day cannot have a substitute of its own',
      );
    }
    if (holiday.workLocationId !== substitute.workLocationId) {
      throw new BusinessRuleError(
        ErrorCode.SUBSTITUTE_LOCATION_MISMATCH,
        'A substitute applies to the same work location as its holiday',
      );
    }
    if (substitute.date <= holiday.date) {
      throw new BusinessRuleError(
        ErrorCode.SUBSTITUTE_NOT_AFTER_HOLIDAY,
        'A substitute day comes after the holiday it stands in for',
      );
    }
    if (holiday.substitute && holiday.substitute.id !== substituteId) {
      throw new ConflictError(
        ErrorCode.HOLIDAY_ALREADY_HAS_SUBSTITUTE,
        'That holiday already has a substitute day',
      );
    }
  }

  // --------------------------------------------------------------------- roles

  listRoles(organizationId: string) {
    return this.prisma.role.findMany({
      where: { organizationId },
      orderBy: { key: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  // ------------------------------------------------------------------- helpers

  private async assertDepartmentExists(organizationId: string, id: string): Promise<void> {
    const found = await this.prisma.department.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundError('Department', id);
  }

  private async assertOwned(
    model: 'position' | 'workLocation',
    organizationId: string,
    id: string,
  ): Promise<void> {
    const delegate = model === 'position' ? this.prisma.position : this.prisma.workLocation;
    const found = await (delegate as { findFirst: (args: unknown) => Promise<unknown> }).findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundError(model === 'position' ? 'Position' : 'WorkLocation', id);
  }

  /** Prevents a department from becoming its own ancestor. */
  private async assertNoDepartmentCycle(
    organizationId: string,
    departmentId: string,
    newParentId: string,
  ): Promise<void> {
    let cursor: string | null = newParentId;
    const seen = new Set<string>([departmentId]);
    while (cursor) {
      if (seen.has(cursor)) {
        throw new NotFoundError('Department', 'cycle detected in department hierarchy');
      }
      seen.add(cursor);
      const parent: { parentId: string | null } | null = await this.prisma.department.findFirst({
        where: { id: cursor, organizationId },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }
}

/**
 * A minimum daily wage is kept only with the announcement it was read from
 * (CW-069): rates differ by area and business type and change by announcement,
 * so a number without its source cannot be checked when the next one comes out.
 */
function assertMinimumWageSource(
  wage: number | Prisma.Decimal | null | undefined,
  source: string | null | undefined,
) {
  if (wage !== null && wage !== undefined && !source?.trim()) {
    throw new BusinessRuleError(
      'MINIMUM_WAGE_SOURCE_REQUIRED',
      'Say which Wage Committee announcement the minimum daily wage comes from',
    );
  }
}
