// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { employeeVisibilityFilter } from '../../core/security/employee-access';
import {
  eachDateInRange,
  formatDateOnly,
  isoWeekday,
  toDateOnly,
} from '../../core/utils/date.util';
import { findOverlap, isValidRange, resolveRosterDay, type DateRange } from './domain/roster';
import type {
  BulkScheduleAssignmentDto,
  CreateScheduleAssignmentDto,
  CreateShiftDto,
  CreateWorkScheduleDto,
  RosterQueryDto,
  SetRosterDayDto,
  UpdateShiftDto,
  UpdateWorkScheduleDto,
} from './dto/shift.dto';

/** How many days a single roster view may span, to bound the employee×day grid. */
const MAX_ROSTER_DAYS = 62;
const ROSTERED_STATUSES: EmployeeStatus[] = [EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION];

/**
 * Shift definitions, weekly schedules and the roster that assigns them (CW-010).
 *
 * The models existed and attendance already reads them — late and early-leave
 * minutes are computed against the shift `resolveShift` picks — but there was no
 * way to define or assign one, so those numbers came from seeded data alone.
 * This is the write side, plus the calendar read the console renders.
 *
 * Two invariants are load-bearing and enforced here rather than trusted to the
 * caller: a schedule assignment may not overlap another for the same employee
 * (an ambiguous roster is worse than none), and every id is re-scoped to the
 * caller's organisation and visible employees on the way in.
 */
@Injectable()
export class ShiftService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------- shifts

  listShifts(organizationId: string, includeInactive = false) {
    return this.prisma.shift.findMany({
      where: { organizationId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async createShift(organizationId: string, dto: CreateShiftDto) {
    await this.assertShiftCodeFree(organizationId, dto.code);
    return this.prisma.shift.create({ data: { ...dto, organizationId } });
  }

  async updateShift(organizationId: string, id: string, dto: UpdateShiftDto) {
    const existing = await this.prisma.shift.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundError('Shift', id);
    return this.prisma.shift.update({ where: { id }, data: dto });
  }

  /** Deactivates rather than deletes: a shift may be referenced by past attendance. */
  async deactivateShift(organizationId: string, id: string): Promise<void> {
    const result = await this.prisma.shift.updateMany({
      where: { id, organizationId },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundError('Shift', id);
  }

  // ---------------------------------------------------------- work schedules

  listWorkSchedules(organizationId: string, includeInactive = false) {
    return this.prisma.workSchedule.findMany({
      where: { organizationId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
      include: { defaultShift: { select: { id: true, code: true, name: true } } },
    });
  }

  async createWorkSchedule(organizationId: string, dto: CreateWorkScheduleDto) {
    const clash = await this.prisma.workSchedule.findFirst({
      where: { organizationId, code: dto.code },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictError('DUPLICATE_SCHEDULE_CODE', `มีตารางเวลารหัส "${dto.code}" อยู่แล้ว`);
    }
    if (dto.defaultShiftId) await this.assertShiftInOrg(organizationId, dto.defaultShiftId);
    return this.prisma.workSchedule.create({ data: { ...dto, organizationId } });
  }

  async updateWorkSchedule(organizationId: string, id: string, dto: UpdateWorkScheduleDto) {
    const existing = await this.prisma.workSchedule.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundError('WorkSchedule', id);
    if (dto.defaultShiftId) await this.assertShiftInOrg(organizationId, dto.defaultShiftId);
    return this.prisma.workSchedule.update({ where: { id }, data: dto });
  }

  async deactivateWorkSchedule(organizationId: string, id: string): Promise<void> {
    const result = await this.prisma.workSchedule.updateMany({
      where: { id, organizationId },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundError('WorkSchedule', id);
  }

  // ----------------------------------------------------- schedule assignments

  listScheduleAssignments(user: AuthenticatedUser, employeeId?: string) {
    return this.prisma.scheduleAssignment.findMany({
      where: {
        employee: { AND: [employeeVisibilityFilter(user), employeeId ? { id: employeeId } : {}] },
      },
      orderBy: [{ effectiveFrom: 'desc' }],
      include: {
        schedule: { select: { id: true, code: true, name: true } },
        employee: {
          select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true },
        },
      },
    });
  }

  async createScheduleAssignment(user: AuthenticatedUser, dto: CreateScheduleAssignmentDto) {
    await this.assertEmployeeVisible(user, dto.employeeId);
    await this.assertScheduleInOrg(user.organizationId, dto.scheduleId);

    const range = this.rangeOf(dto.effectiveFrom, dto.effectiveTo);
    await this.assertNoAssignmentOverlap(dto.employeeId, range);

    return this.prisma.scheduleAssignment.create({
      data: {
        employeeId: dto.employeeId,
        scheduleId: dto.scheduleId,
        effectiveFrom: range.from,
        effectiveTo: range.to,
      },
    });
  }

  /** Assigns one schedule to a set of employees (by id, department or location) at once. */
  async bulkAssignSchedule(
    user: AuthenticatedUser,
    dto: BulkScheduleAssignmentDto,
  ): Promise<{ assigned: number }> {
    if (!dto.employeeIds?.length && !dto.departmentId && !dto.workLocationId) {
      throw new BusinessRuleError(
        'NO_TARGET_SELECTED',
        'ต้องเลือกพนักงาน แผนก หรือสถานที่อย่างน้อยหนึ่งอย่าง',
      );
    }
    await this.assertScheduleInOrg(user.organizationId, dto.scheduleId);
    const range = this.rangeOf(dto.effectiveFrom, dto.effectiveTo);

    const targets = await this.prisma.employee.findMany({
      where: {
        AND: [
          employeeVisibilityFilter(user),
          { deletedAt: null, status: { in: ROSTERED_STATUSES } },
          dto.employeeIds?.length ? { id: { in: dto.employeeIds } } : {},
          dto.departmentId ? { departmentId: dto.departmentId } : {},
          dto.workLocationId ? { workLocationId: dto.workLocationId } : {},
        ],
      },
      select: { id: true, firstNameTh: true, lastNameTh: true },
    });
    if (targets.length === 0) {
      throw new BusinessRuleError('NO_TARGET_EMPLOYEES', 'ไม่พบพนักงานที่ตรงกับเงื่อนไข');
    }

    // All-or-nothing: name everyone who already has an overlapping schedule
    // rather than assigning some and silently skipping the rest.
    const conflicts: string[] = [];
    for (const employee of targets) {
      const clash = await this.findAssignmentOverlap(employee.id, range);
      if (clash) conflicts.push(`${employee.firstNameTh} ${employee.lastNameTh}`);
    }
    if (conflicts.length > 0) {
      throw new ConflictError(
        'SCHEDULE_ASSIGNMENT_OVERLAP',
        `พนักงานต่อไปนี้มีตารางที่ทับซ้อนในช่วงนี้อยู่แล้ว: ${conflicts.join(', ')}`,
        { conflicts },
      );
    }

    await this.prisma.$transaction(
      targets.map((employee) =>
        this.prisma.scheduleAssignment.create({
          data: {
            employeeId: employee.id,
            scheduleId: dto.scheduleId,
            effectiveFrom: range.from,
            effectiveTo: range.to,
          },
        }),
      ),
    );
    return { assigned: targets.length };
  }

  async deleteScheduleAssignment(user: AuthenticatedUser, id: string): Promise<void> {
    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: { id, employee: employeeVisibilityFilter(user) },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundError('ScheduleAssignment', id);
    await this.prisma.scheduleAssignment.delete({ where: { id } });
  }

  // ------------------------------------------------------ per-day roster edits

  /** Sets (or replaces) the roster override for one employee on one date. */
  async setRosterDay(user: AuthenticatedUser, dto: SetRosterDayDto) {
    await this.assertEmployeeVisible(user, dto.employeeId);
    await this.assertShiftInOrg(user.organizationId, dto.shiftId);
    const date = toDateOnly(dto.date);

    return this.prisma.shiftAssignment.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date } },
      create: {
        employeeId: dto.employeeId,
        shiftId: dto.shiftId,
        date,
        isDayOff: dto.isDayOff ?? false,
        note: dto.note ?? null,
      },
      update: { shiftId: dto.shiftId, isDayOff: dto.isDayOff ?? false, note: dto.note ?? null },
    });
  }

  async deleteRosterDay(user: AuthenticatedUser, id: string): Promise<void> {
    const override = await this.prisma.shiftAssignment.findFirst({
      where: { id, employee: employeeVisibilityFilter(user) },
      select: { id: true },
    });
    if (!override) throw new NotFoundError('ShiftAssignment', id);
    await this.prisma.shiftAssignment.delete({ where: { id } });
  }

  // -------------------------------------------------------------- roster view

  /**
   * The calendar grid: for each visible employee, the shift they are on each day
   * in the window, resolved with the same precedence as `resolveShift` at punch
   * time (override → schedule default → nothing).
   */
  async getRoster(user: AuthenticatedUser, query: RosterQueryDto) {
    const from = toDateOnly(query.from);
    const to = toDateOnly(query.to);
    const days = eachDateInRange(from, to);
    if (days.length === 0) {
      throw new BusinessRuleError('INVALID_RANGE', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    }
    if (days.length > MAX_ROSTER_DAYS) {
      throw new BusinessRuleError(
        'RANGE_TOO_WIDE',
        `ช่วงเวลายาวเกินไป (สูงสุด ${MAX_ROSTER_DAYS} วัน)`,
      );
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        AND: [
          employeeVisibilityFilter(user),
          { deletedAt: null, status: { in: ROSTERED_STATUSES } },
          query.departmentId ? { departmentId: query.departmentId } : {},
          query.employeeId ? { id: query.employeeId } : {},
        ],
      },
      select: {
        id: true,
        employeeCode: true,
        firstNameTh: true,
        lastNameTh: true,
        department: { select: { name: true } },
      },
      orderBy: [{ employeeCode: 'asc' }],
    });
    const employeeIds = employees.map((employee) => employee.id);
    if (employeeIds.length === 0) return { from: query.from, to: query.to, employees: [] };

    const [overrides, assignments] = await Promise.all([
      this.prisma.shiftAssignment.findMany({
        where: { employeeId: { in: employeeIds }, date: { gte: from, lte: to } },
        include: { shift: { select: { id: true, name: true } } },
      }),
      this.prisma.scheduleAssignment.findMany({
        where: {
          employeeId: { in: employeeIds },
          effectiveFrom: { lte: to },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
        orderBy: { effectiveFrom: 'desc' },
        include: {
          schedule: {
            select: { workingDays: true, defaultShift: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);

    const overrideByKey = new Map<string, (typeof overrides)[number]>();
    for (const override of overrides) {
      overrideByKey.set(`${override.employeeId}:${formatDateOnly(override.date)}`, override);
    }
    const assignmentsByEmployee = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const list = assignmentsByEmployee.get(assignment.employeeId) ?? [];
      list.push(assignment);
      assignmentsByEmployee.set(assignment.employeeId, list);
    }

    return {
      from: query.from,
      to: query.to,
      employees: employees.map((employee) => ({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: `${employee.firstNameTh} ${employee.lastNameTh}`,
        department: employee.department?.name ?? null,
        days: days.map((day) => {
          const dayTime = day.getTime();
          const override = overrideByKey.get(`${employee.id}:${formatDateOnly(day)}`);
          // Most-recent-first, so the first covering assignment is the active one.
          const active = (assignmentsByEmployee.get(employee.id) ?? []).find(
            (assignment) =>
              assignment.effectiveFrom.getTime() <= dayTime &&
              (assignment.effectiveTo === null || assignment.effectiveTo.getTime() >= dayTime),
          );
          const resolved = resolveRosterDay({
            weekday: isoWeekday(day),
            override: override
              ? {
                  shiftId: override.shift.id,
                  shiftName: override.shift.name,
                  isDayOff: override.isDayOff,
                }
              : null,
            schedule: active
              ? {
                  workingDays: active.schedule.workingDays,
                  defaultShiftId: active.schedule.defaultShift?.id ?? null,
                  defaultShiftName: active.schedule.defaultShift?.name ?? null,
                }
              : null,
          });
          return { date: formatDateOnly(day), ...resolved };
        }),
      })),
    };
  }

  // ------------------------------------------------------------------ internals

  private rangeOf(fromIso: string, toIso?: string): DateRange {
    const range: DateRange = { from: toDateOnly(fromIso), to: toIso ? toDateOnly(toIso) : null };
    if (!isValidRange(range)) {
      throw new BusinessRuleError('INVALID_RANGE', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    }
    return range;
  }

  private async findAssignmentOverlap(
    employeeId: string,
    candidate: DateRange,
    excludeId?: string,
  ): Promise<DateRange | null> {
    const existing = await this.prisma.scheduleAssignment.findMany({
      where: { employeeId, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { effectiveFrom: true, effectiveTo: true },
    });
    return findOverlap(
      candidate,
      existing.map((assignment) => ({
        from: assignment.effectiveFrom,
        to: assignment.effectiveTo,
      })),
    );
  }

  private async assertNoAssignmentOverlap(employeeId: string, candidate: DateRange): Promise<void> {
    const clash = await this.findAssignmentOverlap(employeeId, candidate);
    if (clash) {
      const until = clash.to ? formatDateOnly(clash.to) : 'ไม่มีกำหนด';
      throw new ConflictError(
        'SCHEDULE_ASSIGNMENT_OVERLAP',
        `พนักงานคนนี้มีตารางในช่วงที่ทับซ้อนอยู่แล้ว (${formatDateOnly(clash.from)} – ${until})`,
      );
    }
  }

  private async assertEmployeeVisible(user: AuthenticatedUser, employeeId: string): Promise<void> {
    const visible = await this.prisma.employee.findFirst({
      where: { AND: [employeeVisibilityFilter(user), { id: employeeId }] },
      select: { id: true },
    });
    if (!visible) throw new NotFoundError('Employee', employeeId);
  }

  private async assertShiftInOrg(organizationId: string, shiftId: string): Promise<void> {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, organizationId },
      select: { id: true },
    });
    if (!shift) throw new NotFoundError('Shift', shiftId);
  }

  private async assertScheduleInOrg(organizationId: string, scheduleId: string): Promise<void> {
    const schedule = await this.prisma.workSchedule.findFirst({
      where: { id: scheduleId, organizationId },
      select: { id: true },
    });
    if (!schedule) throw new NotFoundError('WorkSchedule', scheduleId);
  }

  private async assertShiftCodeFree(organizationId: string, code: string): Promise<void> {
    const clash = await this.prisma.shift.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    if (clash) throw new ConflictError('DUPLICATE_SHIFT_CODE', `มีกะรหัส "${code}" อยู่แล้ว`);
  }
}
