import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { toDateOnly } from '../../core/utils/date.util';
import type {
  CreateDepartmentDto,
  CreateHolidayDto,
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
      select: { code: true },
    });
    if (!existing) throw new NotFoundError('WorkLocation', id);

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

  listHolidays(organizationId: string, year?: number) {
    const range = year
      ? {
          date: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lte: new Date(Date.UTC(year, 11, 31)),
          },
        }
      : {};
    return this.prisma.holiday.findMany({
      where: { organizationId, ...range },
      orderBy: { date: 'asc' },
    });
  }

  createHoliday(organizationId: string, dto: CreateHolidayDto) {
    return this.prisma.holiday.create({
      data: {
        organizationId,
        date: toDateOnly(dto.date),
        name: dto.name,
        nameEn: dto.nameEn,
        workLocationId: dto.workLocationId,
      },
    });
  }

  async deleteHoliday(organizationId: string, id: string): Promise<void> {
    const result = await this.prisma.holiday.deleteMany({ where: { id, organizationId } });
    if (result.count === 0) throw new NotFoundError('Holiday', id);
  }

  /**
   * Holiday dates in a range, as `yyyy-MM-dd` strings. Leave and attendance both
   * need this, so it lives here rather than being duplicated.
   */
  async holidayDateSet(
    organizationId: string,
    from: Date,
    to: Date,
    workLocationId?: string | null,
  ): Promise<Set<string>> {
    const holidays = await this.prisma.holiday.findMany({
      where: {
        organizationId,
        date: { gte: toDateOnly(from), lte: toDateOnly(to) },
        OR: [{ workLocationId: null }, ...(workLocationId ? [{ workLocationId }] : [])],
      },
      select: { date: true },
    });
    return new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
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
