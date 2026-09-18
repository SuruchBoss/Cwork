import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceStatus,
  DeviceBindingStatus,
  LeaveRequestStatus,
  Prisma,
  PunchMethod,
  PunchType,
  type Shift,
} from '@prisma/client';
import { BusinessRuleError, ErrorCode, NotFoundError } from '../../core/errors/domain.errors';
import { PageDto } from '../../core/http/pagination.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import {
  formatDateOnly,
  isoWeekday,
  minutesBetween,
  toDateOnly,
  workDateFor,
} from '../../core/utils/date.util';
import { employeeVisibilityFilter, requireEmployeeId } from '../../core/security/employee-access';
import { OrganizationService } from '../organization/organization.service';
import {
  AnomalyFlag,
  deriveAttendance,
  detectImpossibleTravel,
  type PunchInput,
  type ShiftDefinition,
} from './domain/attendance-calculator';
import { checkGeofence, distanceMeters } from './domain/geo';
import type { AttendanceQueryDto, CreateCorrectionDto, PunchDto } from './dto/attendance.dto';

/** Device clocks more than this far from the server's are flagged. */
const CLOCK_DRIFT_TOLERANCE_MINUTES = 10;
/** GPS readings worse than this are too vague to trust for a geofence. */
const POOR_ACCURACY_METERS = 500;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationService,
  ) {}

  /**
   * Records a punch and recomputes the day.
   *
   * The punch itself is append-only and always stored, even when it looks
   * suspicious: refusing a clock-in because GPS drifted leaves an employee
   * unable to prove they turned up. Instead we store the evidence, flag the
   * anomaly, and let HR decide.
   */
  async punch(user: AuthenticatedUser, dto: PunchDto, requestIp?: string) {
    const employeeId = requireEmployeeId(user);
    const organization = await this.organization.getOrganization(user.organizationId);
    const timezone = organization.timezone;

    const now = new Date();
    const workDate = workDateFor(now, timezone);

    if (dto.clientPunchId) {
      const duplicate = await this.prisma.attendancePunch.findUnique({
        where: { employeeId_clientPunchId: { employeeId, clientPunchId: dto.clientPunchId } },
      });
      // Idempotent replay from an offline queue: return the original result.
      if (duplicate) return this.getDay(user, employeeId, formatDateOnly(duplicate.workDate));
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { workLocationId: true, status: true },
    });

    await this.assertPunchSequence(employeeId, workDate, dto.type);
    await this.assertNotLocked(employeeId, workDate);

    const { workLocation, geofence, anomalyFlags } = await this.evaluateLocation(
      user.organizationId,
      dto,
      employee.workLocationId,
      employeeId,
      now,
    );

    if (dto.clientTime) {
      const drift = Math.abs(minutesBetween(new Date(dto.clientTime), now));
      if (drift > CLOCK_DRIFT_TOLERANCE_MINUTES) anomalyFlags.add(AnomalyFlag.CLOCK_DRIFT);
    }
    if (dto.isMockLocation) anomalyFlags.add(AnomalyFlag.MOCK_LOCATION);
    if (dto.isRootedDevice) anomalyFlags.add(AnomalyFlag.ROOTED_DEVICE);
    if (
      dto.deviceId &&
      (await this.evaluateDevice(user.organizationId, employeeId, dto.deviceId, dto.deviceModel))
    ) {
      // Recorded and flagged, never refused: an employee must always be able to
      // prove they turned up, even from a device HR has not yet approved.
      anomalyFlags.add(AnomalyFlag.NEW_DEVICE);
    }

    await this.prisma.attendancePunch.create({
      data: {
        organizationId: user.organizationId,
        employeeId,
        type: dto.type,
        method: dto.method ?? PunchMethod.MOBILE_GPS,
        punchedAt: now,
        clientTime: dto.clientTime ? new Date(dto.clientTime) : null,
        workDate,
        latitude: dto.latitude !== undefined ? new Prisma.Decimal(dto.latitude) : null,
        longitude: dto.longitude !== undefined ? new Prisma.Decimal(dto.longitude) : null,
        accuracyM: dto.accuracyM,
        workLocationId: workLocation?.id ?? null,
        distanceM: geofence?.distanceM ?? null,
        isOutsideGeofence: geofence ? !geofence.isInside : false,
        deviceId: dto.deviceId,
        deviceModel: dto.deviceModel,
        appVersion: dto.appVersion,
        ipAddress: requestIp,
        anomalyFlags: [...anomalyFlags],
        note: dto.note,
        clientPunchId: dto.clientPunchId,
      },
    });

    await this.recalculateDay(user.organizationId, employeeId, workDate, timezone);
    return this.getDay(user, employeeId, formatDateOnly(workDate));
  }

  /** Today's status for the mobile home screen. */
  async getToday(user: AuthenticatedUser) {
    const employeeId = requireEmployeeId(user);
    const organization = await this.organization.getOrganization(user.organizationId);
    const workDate = workDateFor(new Date(), organization.timezone);
    return this.getDay(user, employeeId, formatDateOnly(workDate));
  }

  async getDay(user: AuthenticatedUser, employeeId: string, date: string) {
    await this.assertEmployeeVisible(user, employeeId);
    const workDate = toDateOnly(date);

    const [record, punches, shift] = await Promise.all([
      this.prisma.attendanceRecord.findUnique({
        where: { employeeId_workDate: { employeeId, workDate } },
        include: { workLocation: { select: { id: true, name: true } } },
      }),
      this.prisma.attendancePunch.findMany({
        where: { employeeId, workDate },
        orderBy: { punchedAt: 'asc' },
        select: {
          id: true,
          type: true,
          method: true,
          punchedAt: true,
          distanceM: true,
          isOutsideGeofence: true,
          anomalyFlags: true,
          workLocation: { select: { id: true, name: true } },
        },
      }),
      this.resolveShift(employeeId, workDate),
    ]);

    const lastPunch = punches.at(-1);
    const isClockedIn =
      lastPunch !== undefined &&
      (lastPunch.type === PunchType.CLOCK_IN || lastPunch.type === PunchType.BREAK_END);

    return {
      date,
      employeeId,
      record,
      punches,
      shift: shift
        ? {
            id: shift.id,
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            breakMinutes: shift.breakMinutes,
          }
        : null,
      isClockedIn,
      nextAction: isClockedIn ? PunchType.CLOCK_OUT : PunchType.CLOCK_IN,
    };
  }

  async list(user: AuthenticatedUser, query: AttendanceQueryDto) {
    const where: Prisma.AttendanceRecordWhereInput = {
      AND: [
        { organizationId: user.organizationId },
        { employee: employeeVisibilityFilter(user) },
        query.employeeId ? { employeeId: query.employeeId } : {},
        query.departmentId ? { employee: { departmentId: query.departmentId } } : {},
        query.from ? { workDate: { gte: toDateOnly(query.from) } } : {},
        query.to ? { workDate: { lte: toDateOnly(query.to) } } : {},
        query.status?.length ? { status: { in: query.status } } : {},
        query.anomaliesOnly
          ? { OR: [{ isOutsideGeofence: true }, { anomalyFlags: { isEmpty: false } }] }
          : {},
      ],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendanceRecord.findMany({
        where,
        orderBy: [{ workDate: query.sortOrder }, { employeeId: 'asc' }],
        skip: query.skip,
        take: query.limit,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstNameTh: true,
              lastNameTh: true,
              department: { select: { id: true, name: true } },
            },
          },
          shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return PageDto.of(data, total, query.page, query.limit);
  }

  /** Monthly totals used by the timesheet screen and payroll. */
  async monthlySummary(organizationId: string, employeeId: string, year: number, month: number) {
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0));

    const records = await this.prisma.attendanceRecord.findMany({
      where: { organizationId, employeeId, workDate: { gte: periodStart, lte: periodEnd } },
      orderBy: { workDate: 'asc' },
    });

    const summary = records.reduce(
      (acc, record) => {
        acc.workedMinutes += record.workedMinutes;
        acc.lateMinutes += record.lateMinutes;
        acc.earlyLeaveMinutes += record.earlyLeaveMinutes;
        acc.overtimeMinutes += record.overtimeMinutes;
        acc.approvedOvertimeMinutes += record.approvedOvertimeMinutes;
        acc.byStatus[record.status] = (acc.byStatus[record.status] ?? 0) + 1;
        if (record.lateMinutes > 0) acc.lateDays += 1;
        if (record.status === AttendanceStatus.PRESENT || record.status === AttendanceStatus.LATE) {
          acc.presentDays += 1;
        }
        if (record.status === AttendanceStatus.ABSENT) acc.absentDays += 1;
        if (record.status === AttendanceStatus.ON_LEAVE) acc.leaveDays += 1;
        return acc;
      },
      {
        workedMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        overtimeMinutes: 0,
        approvedOvertimeMinutes: 0,
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
        leaveDays: 0,
        byStatus: {} as Record<string, number>,
      },
    );

    return { year, month, employeeId, records, summary };
  }

  // ----------------------------------------------------------------- corrections

  async requestCorrection(user: AuthenticatedUser, dto: CreateCorrectionDto) {
    const employeeId = requireEmployeeId(user);
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id: dto.recordId, employeeId, organizationId: user.organizationId },
    });
    if (!record) throw new NotFoundError('AttendanceRecord', dto.recordId);
    if (record.lockedAt) {
      throw new BusinessRuleError(
        ErrorCode.ATTENDANCE_LOCKED,
        'This day has already been paid and can no longer be corrected',
      );
    }
    if (!dto.requestedClockIn && !dto.requestedClockOut) {
      throw new BusinessRuleError(
        'NOTHING_TO_CORRECT',
        'Provide a clock-in or clock-out time to correct',
      );
    }

    return this.prisma.attendanceCorrection.create({
      data: {
        recordId: dto.recordId,
        employeeId,
        requestedClockIn: dto.requestedClockIn ? new Date(dto.requestedClockIn) : null,
        requestedClockOut: dto.requestedClockOut ? new Date(dto.requestedClockOut) : null,
        reason: dto.reason,
        attachmentIds: dto.attachmentIds ?? [],
      },
    });
  }

  /**
   * Applying a correction writes MANUAL punches rather than editing history —
   * the original stream stays intact and the daily record is re-derived.
   */
  async decideCorrection(
    user: AuthenticatedUser,
    correctionId: string,
    decision: 'APPROVE' | 'REJECT',
    note?: string,
  ) {
    const correction = await this.prisma.attendanceCorrection.findFirst({
      where: { id: correctionId, employee: { organizationId: user.organizationId } },
      include: { record: true },
    });
    if (!correction) throw new NotFoundError('AttendanceCorrection', correctionId);
    if (correction.status !== 'PENDING') {
      throw new BusinessRuleError(
        'CORRECTION_NOT_PENDING',
        'This correction has already been decided',
      );
    }

    if (decision === 'REJECT') {
      return this.prisma.attendanceCorrection.update({
        where: { id: correctionId },
        data: {
          status: 'REJECTED',
          decidedAt: new Date(),
          decidedById: user.userId,
          decisionNote: note,
        },
      });
    }

    const organization = await this.organization.getOrganization(user.organizationId);

    await this.prisma.$transaction(async (tx) => {
      const punches: Prisma.AttendancePunchCreateManyInput[] = [];
      if (correction.requestedClockIn) {
        punches.push({
          organizationId: user.organizationId,
          employeeId: correction.employeeId,
          type: PunchType.CLOCK_IN,
          method: PunchMethod.MANUAL,
          punchedAt: correction.requestedClockIn,
          workDate: correction.record.workDate,
          note: `Correction ${correctionId}`,
        });
      }
      if (correction.requestedClockOut) {
        punches.push({
          organizationId: user.organizationId,
          employeeId: correction.employeeId,
          type: PunchType.CLOCK_OUT,
          method: PunchMethod.MANUAL,
          punchedAt: correction.requestedClockOut,
          workDate: correction.record.workDate,
          note: `Correction ${correctionId}`,
        });
      }
      if (punches.length > 0) await tx.attendancePunch.createMany({ data: punches });

      await tx.attendanceCorrection.update({
        where: { id: correctionId },
        data: {
          status: 'APPROVED',
          decidedAt: new Date(),
          decidedById: user.userId,
          decisionNote: note,
        },
      });
    });

    await this.recalculateDay(
      user.organizationId,
      correction.employeeId,
      correction.record.workDate,
      organization.timezone,
      { replaceManual: true },
    );

    return this.prisma.attendanceCorrection.findUniqueOrThrow({ where: { id: correctionId } });
  }

  listCorrections(
    organizationId: string,
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
  ) {
    return this.prisma.attendanceCorrection.findMany({
      where: { employee: { organizationId }, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true } },
        record: {
          select: { id: true, workDate: true, firstClockInAt: true, lastClockOutAt: true },
        },
      },
    });
  }

  // ------------------------------------------------------------- recalculation

  /**
   * Rebuilds the daily aggregate from the punch stream. Called after every punch
   * and after any correction; safe to call repeatedly.
   */
  async recalculateDay(
    organizationId: string,
    employeeId: string,
    workDate: Date,
    timezone: string,
    options: { replaceManual?: boolean } = {},
  ): Promise<void> {
    const day = toDateOnly(workDate);

    const [punchRows, shift, holidays, leaveDay, scheduleWeekdays] = await Promise.all([
      this.prisma.attendancePunch.findMany({
        where: { employeeId, workDate: day },
        orderBy: { punchedAt: 'asc' },
      }),
      this.resolveShift(employeeId, day),
      this.organization.holidayDateSet(organizationId, day, day),
      this.prisma.leaveRequestDay.findFirst({
        where: {
          date: day,
          leaveRequest: { employeeId, status: LeaveRequestStatus.APPROVED },
        },
        select: { dayValue: true, leaveRequestId: true },
      }),
      this.resolveWorkingWeekdays(employeeId, day),
    ]);

    // A correction supersedes the automatic punches of the same type.
    const effectivePunches = options.replaceManual ? preferManualPunches(punchRows) : punchRows;

    const punches: PunchInput[] = effectivePunches.map((p) => ({
      type: p.type,
      punchedAt: p.punchedAt,
      isOutsideGeofence: p.isOutsideGeofence,
      anomalyFlags: p.anomalyFlags,
    }));

    const isHoliday = holidays.has(formatDateOnly(day));
    const isWorkingDay = scheduleWeekdays.includes(isoWeekday(day));

    const derived = deriveAttendance({
      workDate: day,
      timezone,
      punches,
      shift: shift ? toShiftDefinition(shift) : null,
      isWorkingDay,
      isHoliday,
      leaveDayValue: leaveDay ? Number(leaveDay.dayValue) : 0,
    });

    const status =
      derived.status === AttendanceStatus.NOT_STARTED && leaveDay
        ? AttendanceStatus.ON_LEAVE
        : derived.status;

    // Everything a recalculation may change, written once. Listing these twice
    // — as `create` and again as `update` — is how a field added to one and
    // forgotten in the other becomes a day that is correct when first derived
    // and stale for ever after.
    const derivedFields = {
      shiftId: shift?.id ?? null,
      firstClockInAt: derived.firstClockInAt,
      lastClockOutAt: derived.lastClockOutAt,
      breakMinutes: derived.breakMinutes,
      workedMinutes: derived.workedMinutes,
      lateMinutes: derived.lateMinutes,
      earlyLeaveMinutes: derived.earlyLeaveMinutes,
      overtimeMinutes: derived.overtimeMinutes,
      status,
      isOutsideGeofence: derived.isOutsideGeofence,
      anomalyFlags: derived.anomalyFlags,
      leaveRequestId: leaveDay?.leaveRequestId ?? null,
    };

    await this.prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId, workDate: day } },
      // The identity of the row, which only a create can set.
      create: {
        organizationId,
        employeeId,
        workDate: day,
        workLocationId: effectivePunches[0]?.workLocationId ?? null,
        ...derivedFields,
      },
      update: derivedFields,
    });
  }

  /**
   * Nightly close-out: anyone scheduled to work who never punched is marked
   * ABSENT, and anyone who forgot to clock out is marked INCOMPLETE so HR sees
   * it rather than it silently counting as a full day.
   */
  async closeOutDay(
    organizationId: string,
    workDate: Date,
  ): Promise<{ absent: number; incomplete: number }> {
    const day = toDateOnly(workDate);
    const organization = await this.organization.getOrganization(organizationId);

    const employees = await this.prisma.employee.findMany({
      where: { organizationId, deletedAt: null, status: { in: ['ACTIVE', 'PROBATION'] } },
      select: { id: true },
    });

    let absent = 0;
    let incomplete = 0;

    for (const employee of employees) {
      await this.recalculateDay(organizationId, employee.id, day, organization.timezone);

      const record = await this.prisma.attendanceRecord.findUnique({
        where: { employeeId_workDate: { employeeId: employee.id, workDate: day } },
      });
      if (!record) continue;

      if (record.status === AttendanceStatus.NOT_STARTED) {
        await this.prisma.attendanceRecord.update({
          where: { id: record.id },
          data: { status: AttendanceStatus.ABSENT },
        });
        absent += 1;
      } else if (record.firstClockInAt && !record.lastClockOutAt) {
        await this.prisma.attendanceRecord.update({
          where: { id: record.id },
          data: { status: AttendanceStatus.INCOMPLETE },
        });
        incomplete += 1;
      }
    }

    this.logger.log(
      `Closed out ${formatDateOnly(day)}: ${absent} absent, ${incomplete} incomplete`,
    );
    return { absent, incomplete };
  }

  // -------------------------------------------------------------------- devices

  /** The devices bound to an employee, newest first — for HR to review (CW-024). */
  async listDevices(user: AuthenticatedUser, employeeId: string) {
    await this.assertEmployeeVisible(user, employeeId);
    return this.prisma.employeeDevice.findMany({
      where: { employeeId, organizationId: user.organizationId },
      orderBy: { boundAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        deviceModel: true,
        status: true,
        boundAt: true,
        boundByUserId: true,
        revokedAt: true,
      },
    });
  }

  /**
   * Re-binds an employee to a new device (CW-024).
   *
   * This is the only way the active binding changes after the first device
   * self-binds: it requires HR (the route is `attendance:manage`), and the audit
   * decorator on that route records who did it. Self-service re-binding would
   * defeat the control, so there is no employee-facing path to here.
   */
  async rebindDevice(
    user: AuthenticatedUser,
    input: { employeeId: string; deviceId: string; deviceModel?: string },
  ) {
    await this.assertEmployeeVisible(user, input.employeeId);

    return this.prisma.$transaction(async (tx) => {
      await tx.employeeDevice.updateMany({
        where: { employeeId: input.employeeId, status: DeviceBindingStatus.ACTIVE },
        data: { status: DeviceBindingStatus.REVOKED, revokedAt: new Date() },
      });
      return tx.employeeDevice.create({
        data: {
          organizationId: user.organizationId,
          employeeId: input.employeeId,
          deviceId: input.deviceId,
          deviceModel: input.deviceModel ?? null,
          status: DeviceBindingStatus.ACTIVE,
          boundByUserId: user.userId,
        },
      });
    });
  }

  // ------------------------------------------------------------------ internals

  /**
   * Whether a punch is from a device other than the one the employee is bound to.
   *
   * The first device seen binds automatically — that is the initial binding, not
   * a re-bind, so it needs no approval. Afterwards a different device returns
   * true, and the caller flags the punch NEW_DEVICE; the binding is not changed,
   * because moving it is HR's decision (`rebindDevice`).
   */
  private async evaluateDevice(
    organizationId: string,
    employeeId: string,
    deviceId: string,
    deviceModel?: string,
  ): Promise<boolean> {
    const active = await this.prisma.employeeDevice.findFirst({
      where: { employeeId, status: DeviceBindingStatus.ACTIVE },
      select: { deviceId: true },
    });
    if (!active) {
      await this.prisma.employeeDevice.create({
        data: {
          organizationId,
          employeeId,
          deviceId,
          deviceModel: deviceModel ?? null,
          status: DeviceBindingStatus.ACTIVE,
        },
      });
      return false;
    }
    return active.deviceId !== deviceId;
  }

  /** Callers may pass any employee id, so visibility is checked here, once. */
  private async assertEmployeeVisible(user: AuthenticatedUser, employeeId: string): Promise<void> {
    const visible = await this.prisma.employee.findFirst({
      where: { AND: [employeeVisibilityFilter(user), { id: employeeId }] },
      select: { id: true },
    });
    if (!visible) throw new NotFoundError('Employee', employeeId);
  }

  private async assertPunchSequence(
    employeeId: string,
    workDate: Date,
    type: PunchType,
  ): Promise<void> {
    const last = await this.prisma.attendancePunch.findFirst({
      where: { employeeId, workDate },
      orderBy: { punchedAt: 'desc' },
      select: { type: true, punchedAt: true },
    });

    if (type === PunchType.CLOCK_IN && last && last.type !== PunchType.CLOCK_OUT) {
      throw new BusinessRuleError(ErrorCode.ALREADY_CLOCKED_IN, 'You are already clocked in');
    }
    if (type === PunchType.CLOCK_OUT && (!last || last.type === PunchType.CLOCK_OUT)) {
      throw new BusinessRuleError(ErrorCode.NOT_CLOCKED_IN, 'You are not currently clocked in');
    }
    if (
      type === PunchType.BREAK_START &&
      (!last || last.type === PunchType.CLOCK_OUT || last.type === PunchType.BREAK_START)
    ) {
      throw new BusinessRuleError(
        'INVALID_BREAK_START',
        'You must be clocked in and not already on a break',
      );
    }
    if (type === PunchType.BREAK_END && (!last || last.type !== PunchType.BREAK_START)) {
      throw new BusinessRuleError('INVALID_BREAK_END', 'You are not currently on a break');
    }

    // Debounce accidental double taps.
    if (last && Math.abs(minutesBetween(last.punchedAt, new Date())) < 1 && last.type === type) {
      throw new BusinessRuleError(
        ErrorCode.DUPLICATE_PUNCH,
        'A punch was already recorded moments ago',
      );
    }
  }

  private async assertNotLocked(employeeId: string, workDate: Date): Promise<void> {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId, workDate } },
      select: { lockedAt: true },
    });
    if (record?.lockedAt) {
      throw new BusinessRuleError(
        ErrorCode.ATTENDANCE_LOCKED,
        'This day has been locked by payroll',
      );
    }
  }

  private async evaluateLocation(
    organizationId: string,
    dto: PunchDto,
    defaultWorkLocationId: string | null,
    employeeId: string,
    now: Date,
  ) {
    const anomalyFlags = new Set<string>();

    if (dto.latitude === undefined || dto.longitude === undefined) {
      // Kiosk/web punches legitimately have no GPS, so this is a flag not an error.
      if ((dto.method ?? PunchMethod.MOBILE_GPS) === PunchMethod.MOBILE_GPS) {
        anomalyFlags.add(AnomalyFlag.NO_LOCATION);
      }
      return { workLocation: null, geofence: null, anomalyFlags };
    }

    if ((dto.accuracyM ?? 0) > POOR_ACCURACY_METERS) {
      anomalyFlags.add(AnomalyFlag.LOW_GPS_ACCURACY);
    }

    const candidateId = dto.workLocationId ?? defaultWorkLocationId;
    const workLocation = candidateId
      ? await this.prisma.workLocation.findFirst({
          where: { id: candidateId, organizationId, isActive: true, deletedAt: null },
        })
      : null;

    if (!workLocation?.latitude || !workLocation?.longitude) {
      return { workLocation, geofence: null, anomalyFlags };
    }

    const geofence = checkGeofence(
      { latitude: dto.latitude, longitude: dto.longitude },
      { latitude: Number(workLocation.latitude), longitude: Number(workLocation.longitude) },
      workLocation.geofenceRadiusM,
      dto.accuracyM ?? 0,
    );
    if (!geofence.isInside) anomalyFlags.add(AnomalyFlag.OUTSIDE_GEOFENCE);

    const previous = await this.prisma.attendancePunch.findFirst({
      where: { employeeId, latitude: { not: null }, longitude: { not: null } },
      orderBy: { punchedAt: 'desc' },
      select: { punchedAt: true, latitude: true, longitude: true },
    });

    if (previous?.latitude && previous?.longitude) {
      const travelled = distanceMeters(
        { latitude: Number(previous.latitude), longitude: Number(previous.longitude) },
        { latitude: dto.latitude, longitude: dto.longitude },
      );
      if (
        detectImpossibleTravel({ punchedAt: previous.punchedAt, distanceFromM: travelled }, now)
      ) {
        anomalyFlags.add(AnomalyFlag.IMPOSSIBLE_TRAVEL);
      }
    }

    return { workLocation, geofence, anomalyFlags };
  }

  /** Roster override for the date wins; otherwise the schedule's default shift. */
  private async resolveShift(employeeId: string, workDate: Date): Promise<Shift | null> {
    const override = await this.prisma.shiftAssignment.findUnique({
      where: { employeeId_date: { employeeId, date: workDate } },
      include: { shift: true },
    });
    if (override) return override.isDayOff ? null : override.shift;

    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { schedule: { include: { defaultShift: true } } },
    });

    return assignment?.schedule.defaultShift ?? null;
  }

  private async resolveWorkingWeekdays(employeeId: string, workDate: Date): Promise<number[]> {
    const override = await this.prisma.shiftAssignment.findUnique({
      where: { employeeId_date: { employeeId, date: workDate } },
      select: { isDayOff: true },
    });
    if (override) return override.isDayOff ? [] : [isoWeekday(workDate)];

    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { schedule: { select: { workingDays: true } } },
    });

    return assignment?.schedule.workingDays ?? [1, 2, 3, 4, 5];
  }
}

function toShiftDefinition(shift: Shift): ShiftDefinition {
  return {
    startTime: shift.startTime,
    endTime: shift.endTime,
    crossesMidnight: shift.crossesMidnight,
    breakMinutes: shift.breakMinutes,
    graceInMinutes: shift.graceInMinutes,
    graceOutMinutes: shift.graceOutMinutes,
    standardWorkMinutes: shift.standardWorkMinutes,
    isFlexible: shift.isFlexible,
  };
}

/** Keeps only the corrected (MANUAL) punch when both exist for the same type. */
function preferManualPunches<T extends { type: PunchType; method: PunchMethod }>(
  punches: T[],
): T[] {
  const manualTypes = new Set(
    punches.filter((p) => p.method === PunchMethod.MANUAL).map((p) => p.type),
  );
  return punches.filter((p) => p.method === PunchMethod.MANUAL || !manualTypes.has(p.type));
}
