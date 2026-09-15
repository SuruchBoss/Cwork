import { Injectable } from '@nestjs/common';
import { LeaveType, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService, type PrismaLike } from '../../core/prisma/prisma.service';
import { toDateOnly } from '../../core/utils/date.util';
import { Decimal, toPrismaDecimal } from '../../core/utils/money.util';
import {
  availableBalance,
  computeAccruedQuota,
  computeCarryOver,
  type SeniorityTier,
} from './domain/leave-calculator';
import type { AdjustLeaveBalanceDto, LeaveBalanceDto } from './dto/leave.dto';

@Injectable()
export class LeaveBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads (and lazily creates) an employee's entitlement row for a leave year.
   *
   * Entitlements are materialised on first use rather than pre-created for
   * everyone every January: a row that nobody ever reads is just noise, and this
   * keeps a new hire's balance correct from day one without a nightly job.
   */
  async ensureEntitlement(
    tx: PrismaLike,
    organizationId: string,
    employeeId: string,
    leaveType: LeaveType,
    year: number,
  ) {
    const existing = await tx.leaveEntitlement.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: leaveType.id, year } },
    });
    if (existing) return existing;

    const employee = await tx.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { hireDate: true },
    });

    const granted = computeAccruedQuota({
      method: leaveType.accrualMethod,
      defaultQuota: Number(leaveType.defaultQuota),
      seniorityTiers: (leaveType.seniorityTiers as unknown as SeniorityTier[]) ?? [],
      hireDate: employee.hireDate,
      year,
    });

    return tx.leaveEntitlement.create({
      data: {
        organizationId,
        employeeId,
        leaveTypeId: leaveType.id,
        year,
        granted: toPrismaDecimal(granted),
      },
    });
  }

  /** Every leave type's balance for one employee, for the balance screen. */
  async getBalances(
    organizationId: string,
    employeeId: string,
    year = new Date().getUTCFullYear(),
  ): Promise<LeaveBalanceDto[]> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId, deletedAt: null },
      select: { id: true, gender: true, hireDate: true },
    });
    if (!employee) throw new NotFoundError('Employee', employeeId);

    const leaveTypes = await this.prisma.leaveType.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
      orderBy: { orderIndex: 'asc' },
    });

    const eligible = leaveTypes.filter(
      (type) => !type.genderRestriction || type.genderRestriction === employee.gender,
    );

    const entitlements = await this.prisma.leaveEntitlement.findMany({
      where: { employeeId, year, leaveTypeId: { in: eligible.map((t) => t.id) } },
    });
    const byType = new Map(entitlements.map((e) => [e.leaveTypeId, e]));

    return eligible.map((type) => {
      const entitlement = byType.get(type.id);
      const granted = entitlement
        ? new Decimal(entitlement.granted.toString())
        : computeAccruedQuota({
            method: type.accrualMethod,
            defaultQuota: Number(type.defaultQuota),
            seniorityTiers: (type.seniorityTiers as unknown as SeniorityTier[]) ?? [],
            hireDate: employee.hireDate,
            year,
          });

      const available = availableBalance({
        openingBalance: entitlement?.openingBalance ?? 0,
        granted,
        carriedOver: entitlement?.carriedOver ?? 0,
        adjusted: entitlement?.adjusted ?? 0,
        used: entitlement?.used ?? 0,
        pending: entitlement?.pending ?? 0,
        expired: entitlement?.expired ?? 0,
      });

      return {
        leaveTypeId: type.id,
        code: type.code,
        name: type.name,
        colorHex: type.colorHex,
        unit: type.unit,
        year,
        granted: granted.toNumber(),
        carriedOver: Number(entitlement?.carriedOver ?? 0),
        adjusted: Number(entitlement?.adjusted ?? 0),
        used: Number(entitlement?.used ?? 0),
        pending: Number(entitlement?.pending ?? 0),
        available: available.toNumber(),
        isPaid: type.isPaid,
      };
    });
  }

  /** Moves days between the `pending`, `used` and available buckets. */
  async applyDelta(
    tx: PrismaLike,
    entitlementId: string,
    delta: { pending?: Decimal; used?: Decimal },
  ): Promise<void> {
    await tx.leaveEntitlement.update({
      where: { id: entitlementId },
      data: {
        ...(delta.pending
          ? { pending: { increment: new Prisma.Decimal(delta.pending.toFixed(2)) } }
          : {}),
        ...(delta.used ? { used: { increment: new Prisma.Decimal(delta.used.toFixed(2)) } } : {}),
      },
    });
  }

  /** Manual HR correction, always paired with a reason and an audit row. */
  async adjust(organizationId: string, dto: AdjustLeaveBalanceDto, actorUserId: string) {
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: dto.leaveTypeId, organizationId, deletedAt: null },
    });
    if (!leaveType) throw new NotFoundError('LeaveType', dto.leaveTypeId);

    return this.prisma.$transaction(async (tx) => {
      const entitlement = await this.ensureEntitlement(
        tx,
        organizationId,
        dto.employeeId,
        leaveType,
        dto.year,
      );

      const amount = new Decimal(dto.amount);
      const projected = availableBalance({
        openingBalance: entitlement.openingBalance,
        granted: entitlement.granted,
        carriedOver: entitlement.carriedOver,
        adjusted: new Decimal(entitlement.adjusted.toString()).plus(amount),
        used: entitlement.used,
        pending: entitlement.pending,
        expired: entitlement.expired,
      });

      if (projected.isNegative() && !leaveType.allowNegativeBalance) {
        throw new BusinessRuleError(
          'ADJUSTMENT_WOULD_GO_NEGATIVE',
          `This adjustment would leave a balance of ${projected.toFixed(2)} days`,
        );
      }

      await tx.leaveEntitlement.update({
        where: { id: entitlement.id },
        data: { adjusted: { increment: new Prisma.Decimal(amount.toFixed(2)) } },
      });

      return tx.leaveAdjustment.create({
        data: {
          entitlementId: entitlement.id,
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          amount: toPrismaDecimal(amount),
          reason: dto.reason,
          effectiveDate: toDateOnly(dto.effectiveDate ?? new Date()),
          createdById: actorUserId,
        },
      });
    });
  }

  /**
   * Year-end roll-over: carries the capped remainder into the next leave year
   * and expires the rest. Idempotent — re-running it will not double-carry,
   * because the target row is created with the carry-over already applied.
   */
  async rolloverYear(organizationId: string, fromYear: number): Promise<number> {
    const leaveTypes = await this.prisma.leaveType.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
    });
    const byId = new Map(leaveTypes.map((t) => [t.id, t]));

    const entitlements = await this.prisma.leaveEntitlement.findMany({
      where: { organizationId, year: fromYear },
    });

    let processed = 0;
    for (const entitlement of entitlements) {
      const leaveType = byId.get(entitlement.leaveTypeId);
      if (!leaveType) continue;

      const remaining = availableBalance(entitlement);
      const carried = computeCarryOver(remaining, Number(leaveType.carryOverMaxDays));
      const expired = remaining.minus(carried);

      const expiresOn = leaveType.carryOverExpiryMonths
        ? new Date(Date.UTC(fromYear + 1, leaveType.carryOverExpiryMonths, 0))
        : null;

      await this.prisma.$transaction(async (tx) => {
        await tx.leaveEntitlement.update({
          where: { id: entitlement.id },
          data: { expired: toPrismaDecimal(expired.isNegative() ? 0 : expired) },
        });

        const nextGranted = computeAccruedQuota({
          method: leaveType.accrualMethod,
          defaultQuota: Number(leaveType.defaultQuota),
          seniorityTiers: (leaveType.seniorityTiers as unknown as SeniorityTier[]) ?? [],
          hireDate: (
            await tx.employee.findUniqueOrThrow({
              where: { id: entitlement.employeeId },
              select: { hireDate: true },
            })
          ).hireDate,
          year: fromYear + 1,
        });

        await tx.leaveEntitlement.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: entitlement.employeeId,
              leaveTypeId: entitlement.leaveTypeId,
              year: fromYear + 1,
            },
          },
          create: {
            organizationId,
            employeeId: entitlement.employeeId,
            leaveTypeId: entitlement.leaveTypeId,
            year: fromYear + 1,
            granted: toPrismaDecimal(nextGranted),
            carriedOver: toPrismaDecimal(carried),
            carryOverExpiresOn: expiresOn,
          },
          update: { carriedOver: toPrismaDecimal(carried), carryOverExpiresOn: expiresOn },
        });
      });

      processed += 1;
    }

    return processed;
  }
}
