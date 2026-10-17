// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  PunchMethod,
  PunchType,
  ScannerDayDecisionAction,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  AccessDeniedError,
  BusinessRuleError,
  NotFoundError,
} from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import type { ImportProblem } from '../../core/spreadsheet/problems';
import type { UploadedTable } from '../../core/spreadsheet/upload';
import { formatDateOnly, toDateOnly, zonedInstant } from '../../core/utils/date.util';
import { AuditService } from '../audit/audit.service';
import { OrganizationService } from '../organization/organization.service';
import { AttendanceService } from './attendance.service';
import {
  checkDecision,
  classifyDay,
  decodeScannerExport,
  parseScannerExport,
  sameTimes,
  scannerPunchKey,
  type DayDecision,
  type DayVerdict,
  type ScannerDayStatus,
  type ScannerLine,
  type WaitingReason,
} from './domain/scanner-export';
import type {
  BindScannerNumberDto,
  DecideScannerDayDto,
  ScannerDaysQueryDto,
} from './dto/scanner.dto';

/** The review list covers at most this many days at a time. */
const MAX_REVIEW_DAYS = 93;

const dayInclude = {
  decisions: { orderBy: { createdAt: 'desc' }, take: 1 },
  punches: { select: { supersededAt: true, punch: { select: { clientPunchId: true } } } },
} satisfies Prisma.ScannerDayInclude;

type LoadedDay = Prisma.ScannerDayGetPayload<{ include: typeof dayInclude }>;

export interface UnmappedNumber {
  scannerNumber: string;
  name: string;
  days: number;
  daysWithTimes: number;
  firstDay: string;
  lastDay: string;
}

export interface ScannerPreview {
  fileName: string;
  problems: ImportProblem[];
  dateFrom: string | null;
  dateTo: string | null;
  lines: number;
  /** Days of the file not in Cwork yet, days that gain a time, and days already as they are. */
  days: { added: number; changed: number; unchanged: number };
  /** What each day of the file is, counting every line. */
  byStatus: Record<ScannerDayStatus, number>;
  /** Punches this file would add to attendance. */
  punchesToAdd: number;
  unmapped: UnmappedNumber[];
}

export interface ScannerCommitResult {
  importId: string;
  fileName: string;
  dateFrom: string;
  dateTo: string;
  lines: number;
  days: { added: number; changed: number; unchanged: number };
  byStatus: Record<ScannerDayStatus, number>;
  punchesAdded: number;
  /** Days whose attendance a payroll run already used: left as they were. */
  lockedDays: number;
  unmapped: UnmappedNumber[];
}

export interface ScannerDayView {
  id: string;
  scannerNumber: string;
  name: string;
  workDate: string;
  /** Every time the scanner recorded, as it recorded them. */
  times: string[];
  status: ScannerDayStatus;
  reason: WaitingReason | null;
  employee: { id: string; employeeCode: string; name: string } | null;
  /** HR's decision, when it still applies to these times. */
  decision: {
    action: ScannerDayDecisionAction;
    clockIn: string | null;
    clockOut: string | null;
    note: string | null;
    decidedAt: string;
  } | null;
  /** A decision was made about fewer times than the day has now. */
  decisionOutdated: boolean;
  /** Punches this day currently contributes to attendance. */
  punchesCounted: number;
  /** A payroll run has used this employee's day, so it cannot change. */
  locked: boolean;
}

export interface ScannerDaysPage {
  from: string | null;
  to: string | null;
  items: ScannerDayView[];
  total: number;
  page: number;
  limit: number;
  /** Over the whole range, not the page: it changes as HR decides. */
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

interface PlanEntry {
  line: ScannerLine;
  existing: LoadedDay | null;
  times: string[];
  isNew: boolean;
  changed: boolean;
  employeeId: string | null;
  verdict: DayVerdict;
}

const EMPTY_BY_STATUS = (): Record<ScannerDayStatus, number> => ({
  NO_PUNCH: 0,
  UNMAPPED: 0,
  COUNTED: 0,
  WAITING: 0,
  DECIDED_USE: 0,
  DECIDED_IGNORE: 0,
});

/** The decision of a day, as long as it was made about the times the day has. */
function inForce(day: Pick<LoadedDay, 'decisions'>, times: string[]): DayDecision | null {
  const latest = day.decisions[0];
  if (!latest || !sameTimes(latest.timesAtDecision, times)) return null;
  return { action: latest.action, clockIn: latest.clockIn, clockOut: latest.clockOut };
}

const dayKey = (scannerNumber: string, workDate: string) => `${scannerNumber}|${workDate}`;

/**
 * Taking in the export of a fingerprint scanner (CW-061).
 *
 * The file's days are kept as the scanner wrote them (`ScannerDay`), and what
 * counts toward attendance is worked out from them: two times are a normal day,
 * one time or three or more wait for HR, a number nobody registered is listed
 * apart, and nothing is guessed. HR's decisions are stored beside the raw days,
 * not in them, and can be changed.
 *
 * The punches that do count are ordinary `BIOMETRIC` punches in the append-only
 * stream. Importing an overlapping file adds only the ones not already there
 * (each carries a key made from the scanner number, the day and the time), and
 * a punch that stops counting is marked on its link and left out of the day.
 */
@Injectable()
export class ScannerImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attendance: AttendanceService,
    private readonly organization: OrganizationService,
  ) {}

  // ------------------------------------------------------------------ import

  async preview(user: AuthenticatedUser, file: UploadedTable): Promise<ScannerPreview> {
    this.assertWholeCompany(user);
    const { lines, problems } = this.read(file);
    if (problems.length > 0 || lines.length === 0) {
      return {
        fileName: file.originalname,
        problems,
        dateFrom: null,
        dateTo: null,
        lines: lines.length,
        days: { added: 0, changed: 0, unchanged: 0 },
        byStatus: EMPTY_BY_STATUS(),
        punchesToAdd: 0,
        unmapped: [],
      };
    }

    const plan = await this.plan(user.organizationId, lines);
    const known = await this.existingPunchKeys(user.organizationId, plan);
    let punchesToAdd = 0;
    for (const entry of plan.entries) {
      for (const punch of entry.verdict.punches) {
        const key = scannerPunchKey(
          entry.line.scannerNumber,
          entry.line.workDate,
          punch.time,
          punch.type,
        );
        if (entry.employeeId && !known.has(`${entry.employeeId}|${key}`)) punchesToAdd += 1;
      }
    }

    return {
      fileName: file.originalname,
      problems,
      ...this.summarise(plan, lines),
      punchesToAdd,
      unmapped: this.unmappedOf(plan.entries),
    };
  }

  async commit(user: AuthenticatedUser, file: UploadedTable): Promise<ScannerCommitResult> {
    this.assertWholeCompany(user);
    const { lines, problems } = this.read(file);
    if (problems.length > 0) {
      throw new BusinessRuleError(
        'IMPORT_HAS_PROBLEMS',
        `The file has ${problems.length} problem(s); nothing was imported`,
        { problems },
      );
    }
    if (lines.length === 0) {
      throw new BusinessRuleError(
        'IMPORT_HAS_PROBLEMS',
        'The file has no lines; nothing was imported',
        {
          problems,
        },
      );
    }

    const { organizationId } = user;
    const organization = await this.organization.getOrganization(organizationId);
    const plan = await this.plan(organizationId, lines);
    const summary = this.summarise(plan, lines);
    const sha = createHash('sha256').update(file.buffer).digest('hex');

    const imported = await this.prisma.$transaction(
      async (tx) => {
        const record = await tx.scannerImport.create({
          data: {
            organizationId,
            fileName: file.originalname.slice(0, 255),
            fileSha256: sha,
            dateFrom: toDateOnly(summary.dateFrom!),
            dateTo: toDateOnly(summary.dateTo!),
            lineCount: lines.length,
            daysAdded: summary.days.added,
            daysChanged: summary.days.changed,
            punchesAdded: 0,
            importedById: user.userId,
          },
        });

        const created = plan.entries.filter((e) => e.isNew);
        if (created.length > 0) {
          await tx.scannerDay.createMany({
            data: created.map((e) => ({
              organizationId,
              scannerNumber: e.line.scannerNumber,
              name: e.line.name,
              workDate: toDateOnly(e.line.workDate),
              times: e.times,
              employeeId: e.employeeId,
              firstImportId: record.id,
              lastImportId: record.id,
            })),
          });
        }
        for (const e of plan.entries.filter((x) => !x.isNew)) {
          await tx.scannerDay.update({
            where: { id: e.existing!.id },
            data: {
              times: e.times,
              ...(e.line.name ? { name: e.line.name } : {}),
              employeeId: e.employeeId,
              lastImportId: record.id,
            },
          });
        }
        return record;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    // Everything the file touched, with what is already known about each day.
    const touched = await this.loadDays(organizationId, lines);
    const sync = await this.syncPunches(
      organizationId,
      organization.timezone,
      user.userId,
      touched,
    );

    // A number HR registered since an earlier file may now belong to someone.
    const late = await this.rematchUnmapped(organizationId, organization.timezone, user.userId);

    await this.prisma.scannerImport.update({
      where: { id: imported.id },
      data: { punchesAdded: sync.added + late.punchesAdded },
    });

    const result: ScannerCommitResult = {
      importId: imported.id,
      fileName: file.originalname,
      dateFrom: summary.dateFrom!,
      dateTo: summary.dateTo!,
      lines: lines.length,
      days: summary.days,
      byStatus: summary.byStatus,
      punchesAdded: sync.added + late.punchesAdded,
      lockedDays: sync.locked,
      unmapped: this.unmappedOf(plan.entries),
    };

    await this.audit.record({
      organizationId,
      actorUserId: user.userId,
      action: AuditAction.CREATE,
      entityType: 'ScannerImport',
      entityId: imported.id,
      summary: `Imported scanner file "${file.originalname}" (${result.dateFrom} to ${result.dateTo}): ${result.punchesAdded} punch(es) added`,
      changes: {
        fileName: file.originalname,
        dateFrom: result.dateFrom,
        dateTo: result.dateTo,
        lines: result.lines,
        daysAdded: result.days.added,
        daysChanged: result.days.changed,
        punchesAdded: result.punchesAdded,
        lockedDays: result.lockedDays,
      },
    });

    return result;
  }

  async imports(user: AuthenticatedUser) {
    this.assertWholeCompany(user);
    const rows = await this.prisma.scannerImport.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      dateFrom: formatDateOnly(r.dateFrom),
      dateTo: formatDateOnly(r.dateTo),
      lines: r.lineCount,
      daysAdded: r.daysAdded,
      daysChanged: r.daysChanged,
      punchesAdded: r.punchesAdded,
      importedAt: r.createdAt.toISOString(),
    }));
  }

  // ------------------------------------------------------------------ review

  async days(user: AuthenticatedUser, query: ScannerDaysQueryDto): Promise<ScannerDaysPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const filter = query.status ?? 'WAITING';

    let from = query.from ?? null;
    let to = query.to ?? null;
    if (!from || !to) {
      const latest = await this.prisma.scannerImport.findFirst({
        where: { organizationId: user.organizationId },
        orderBy: { createdAt: 'desc' },
        select: { dateFrom: true, dateTo: true },
      });
      if (!latest) return this.emptyPage(page, limit);
      from = from ?? formatDateOnly(latest.dateFrom);
      to = to ?? formatDateOnly(latest.dateTo);
    }
    const span = (toDateOnly(to).getTime() - toDateOnly(from).getTime()) / 86_400_000 + 1;
    if (span < 1 || span > MAX_REVIEW_DAYS) {
      throw new BusinessRuleError(
        'RANGE_NOT_SUPPORTED',
        `Choose a range of 1 to ${MAX_REVIEW_DAYS} days`,
        { from, to },
      );
    }

    const scoped = user.scopedDepartmentIds;
    const rows = await this.prisma.scannerDay.findMany({
      where: {
        organizationId: user.organizationId,
        workDate: { gte: toDateOnly(from), lte: toDateOnly(to) },
        ...(query.scannerNumber ? { scannerNumber: query.scannerNumber } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        // A department limit sees only its own people, and nobody unregistered.
        ...(scoped.length > 0 ? { employee: { departmentId: { in: scoped } } } : {}),
      },
      include: {
        ...dayInclude,
        employee: { select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true } },
      },
      orderBy: [{ workDate: 'asc' }, { scannerNumber: 'asc' }],
    });

    const locked = await this.lockedSet(
      user.organizationId,
      rows.flatMap((r) => (r.employeeId ? [r.employeeId] : [])),
      from,
      to,
    );
    const views = rows.map((row) => this.view(row, locked));

    const totals = {
      days: views.length,
      waiting: 0,
      counted: 0,
      decidedUse: 0,
      decidedIgnore: 0,
      noPunch: 0,
      unmapped: 0,
      locked: views.filter((v) => v.locked).length,
    };
    for (const v of views) {
      if (v.status === 'WAITING') totals.waiting += 1;
      else if (v.status === 'COUNTED') totals.counted += 1;
      else if (v.status === 'DECIDED_USE') totals.decidedUse += 1;
      else if (v.status === 'DECIDED_IGNORE') totals.decidedIgnore += 1;
      else if (v.status === 'NO_PUNCH') totals.noPunch += 1;
      else totals.unmapped += 1;
    }

    const wanted = filter === 'ALL' ? views : views.filter((v) => v.status === filter);
    return {
      from,
      to,
      items: wanted.slice((page - 1) * limit, page * limit),
      total: wanted.length,
      page,
      limit,
      totals,
    };
  }

  async day(user: AuthenticatedUser, dayId: string) {
    const row = await this.visibleDay(user, dayId);
    const locked = row.employeeId
      ? await this.lockedSet(
          user.organizationId,
          [row.employeeId],
          formatDateOnly(row.workDate),
          formatDateOnly(row.workDate),
        )
      : new Set<string>();
    const decisions = await this.prisma.scannerDayDecision.findMany({
      where: { scannerDayId: dayId },
      orderBy: { createdAt: 'desc' },
    });
    const current =
      decisions[0] && sameTimes(decisions[0].timesAtDecision, row.times) ? decisions[0].id : null;
    return {
      ...this.view(row, locked),
      history: decisions.map((d) => ({
        id: d.id,
        action: d.action,
        clockIn: d.clockIn,
        clockOut: d.clockOut,
        timesAtDecision: d.timesAtDecision,
        note: d.note,
        decidedAt: d.createdAt.toISOString(),
        inForce: d.id === current,
      })),
    };
  }

  async decide(
    user: AuthenticatedUser,
    dayId: string,
    dto: DecideScannerDayDto,
  ): Promise<ScannerDayView> {
    const row = await this.visibleDay(user, dayId);
    if (!row.employeeId) {
      throw new BusinessRuleError(
        'SCANNER_NUMBER_NOT_REGISTERED',
        'This scanner number belongs to no employee yet; register it first',
      );
    }
    if (row.times.length === 0) {
      throw new BusinessRuleError(
        'SCANNER_DAY_HAS_NO_TIMES',
        'The scanner recorded no time this day',
      );
    }
    const problem = checkDecision(row.times, dto);
    if (problem) {
      throw new BusinessRuleError(
        `DECISION_${problem}`,
        {
          NOTHING_TO_USE: 'Pick at least one of the times to use, or ignore the day',
          TIME_NOT_ON_DAY: 'Pick among the times the scanner recorded that day',
          OUT_NOT_AFTER_IN: 'The clock-out must be later than the clock-in',
          IGNORE_TAKES_NO_TIMES: 'Ignoring a day takes no times',
        }[problem],
        { times: row.times },
      );
    }

    const day = formatDateOnly(row.workDate);
    const locked = await this.lockedSet(user.organizationId, [row.employeeId], day, day);
    if (locked.has(`${row.employeeId}|${day}`)) {
      throw new BusinessRuleError(
        'DAY_LOCKED',
        'A payroll run has already used this day, so it can no longer change',
      );
    }

    await this.prisma.scannerDayDecision.create({
      data: {
        scannerDayId: row.id,
        action: dto.action as ScannerDayDecisionAction,
        clockIn: dto.action === 'USE' ? (dto.clockIn ?? null) : null,
        clockOut: dto.action === 'USE' ? (dto.clockOut ?? null) : null,
        timesAtDecision: row.times,
        note: dto.note ?? null,
        decidedById: user.userId,
      },
    });

    const organization = await this.organization.getOrganization(user.organizationId);
    const reloaded = await this.loadDaysByIds(user.organizationId, [row.id]);
    await this.syncPunches(user.organizationId, organization.timezone, user.userId, reloaded);

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.UPDATE,
      entityType: 'ScannerDay',
      entityId: row.id,
      summary: `Decided scanner number ${row.scannerNumber} on ${day}: ${dto.action}`,
      changes: {
        scannerNumber: row.scannerNumber,
        workDate: day,
        action: dto.action,
        clockIn: dto.clockIn ?? null,
        clockOut: dto.clockOut ?? null,
        times: row.times,
      },
    });

    return (await this.day(user, row.id)) as ScannerDayView;
  }

  // ------------------------------------------------- numbers nobody registered

  async unmapped(user: AuthenticatedUser): Promise<UnmappedNumber[]> {
    // Whoever is limited to some departments has no one to attribute these to.
    if (user.scopedDepartmentIds.length > 0) return [];
    const base: Prisma.ScannerDayWhereInput = {
      organizationId: user.organizationId,
      employeeId: null,
    };
    const [all, withTimes] = await Promise.all([
      this.prisma.scannerDay.groupBy({
        by: ['scannerNumber'],
        where: base,
        _count: { _all: true },
        _min: { workDate: true },
        _max: { workDate: true },
      }),
      this.prisma.scannerDay.groupBy({
        by: ['scannerNumber'],
        where: { ...base, NOT: { times: { isEmpty: true } } },
        _count: { _all: true },
      }),
    ]);
    const names = await this.prisma.scannerDay.findMany({
      where: { ...base, NOT: { name: '' } },
      distinct: ['scannerNumber'],
      orderBy: [{ scannerNumber: 'asc' }, { workDate: 'desc' }],
      select: { scannerNumber: true, name: true },
    });
    const nameOf = new Map(names.map((n) => [n.scannerNumber, n.name]));
    const timed = new Map(withTimes.map((w) => [w.scannerNumber, w._count._all]));
    return all
      .map((g) => ({
        scannerNumber: g.scannerNumber,
        name: nameOf.get(g.scannerNumber) ?? '',
        days: g._count._all,
        daysWithTimes: timed.get(g.scannerNumber) ?? 0,
        firstDay: formatDateOnly(g._min.workDate!),
        lastDay: formatDateOnly(g._max.workDate!),
      }))
      .sort((a, b) => Number(a.scannerNumber) - Number(b.scannerNumber));
  }

  /** Registers a scanner number on an employee, and counts the days that were waiting on it. */
  async bind(user: AuthenticatedUser, dto: BindScannerNumberDto) {
    this.assertWholeCompany(user);
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, employeeCode: true, scannerId: true },
    });
    if (!employee) throw new NotFoundError('Employee', dto.employeeId);
    if (employee.scannerId) {
      throw new BusinessRuleError(
        'EMPLOYEE_HAS_SCANNER_NUMBER',
        `Employee ${employee.employeeCode} already has scanner number ${employee.scannerId}`,
      );
    }
    const holder = await this.prisma.employee.findFirst({
      where: { organizationId: user.organizationId, scannerId: dto.scannerNumber },
      select: { employeeCode: true },
    });
    if (holder) {
      throw new BusinessRuleError(
        'DUPLICATE_SCANNER_ID',
        `Scanner number ${dto.scannerNumber} already belongs to employee ${holder.employeeCode}`,
      );
    }

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { scannerId: dto.scannerNumber },
    });
    const organization = await this.organization.getOrganization(user.organizationId);
    const result = await this.rematchUnmapped(
      user.organizationId,
      organization.timezone,
      user.userId,
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.UPDATE,
      entityType: 'Employee',
      entityId: employee.id,
      summary: `Registered scanner number ${dto.scannerNumber} on employee ${employee.employeeCode}`,
      changes: {
        scannerId: { from: null, to: dto.scannerNumber },
        daysMatched: result.daysMatched,
      },
    });
    return result;
  }

  /**
   * Days waiting on one scanner number, now that an employee carries it. Used when an
   * employee's number is edited on their page (CW-090); it touches only that number's
   * days that no one owns, so decided days and days already counted stay where they are.
   */
  async rematchNumber(
    organizationId: string,
    userId: string,
    scannerNumber: string,
  ): Promise<{ daysMatched: number; punchesAdded: number }> {
    const organization = await this.organization.getOrganization(organizationId);
    return this.rematchUnmapped(organizationId, organization.timezone, userId, scannerNumber);
  }

  /** Numbers registered since a file was imported find their days. */
  async rematch(user: AuthenticatedUser) {
    this.assertWholeCompany(user);
    const organization = await this.organization.getOrganization(user.organizationId);
    return this.rematchUnmapped(user.organizationId, organization.timezone, user.userId);
  }

  // ---------------------------------------------------------------- internals

  private assertWholeCompany(user: AuthenticatedUser): void {
    if (user.scopedDepartmentIds.length > 0) {
      throw new AccessDeniedError(
        'A department limit cannot import or register scanner numbers: the file covers the whole company',
      );
    }
  }

  /** Decodes and reads the file; the problems of either come back together. */
  private read(file: UploadedTable): { lines: ScannerLine[]; problems: ImportProblem[] } {
    const decoded = decodeScannerExport(file.buffer);
    if (decoded.problem) return { lines: [], problems: [decoded.problem] };
    return parseScannerExport(decoded.text);
  }

  private async visibleDay(user: AuthenticatedUser, dayId: string) {
    const scoped = user.scopedDepartmentIds;
    const row = await this.prisma.scannerDay.findFirst({
      where: {
        id: dayId,
        organizationId: user.organizationId,
        ...(scoped.length > 0 ? { employee: { departmentId: { in: scoped } } } : {}),
      },
      include: {
        ...dayInclude,
        employee: { select: { id: true, employeeCode: true, firstNameTh: true, lastNameTh: true } },
      },
    });
    if (!row) throw new NotFoundError('ScannerDay', dayId);
    return row;
  }

  private emptyPage(page: number, limit: number): ScannerDaysPage {
    return {
      from: null,
      to: null,
      items: [],
      total: 0,
      page,
      limit,
      totals: {
        days: 0,
        waiting: 0,
        counted: 0,
        decidedUse: 0,
        decidedIgnore: 0,
        noPunch: 0,
        unmapped: 0,
        locked: 0,
      },
    };
  }

  private view(
    row: LoadedDay & {
      employee?: {
        id: string;
        employeeCode: string;
        firstNameTh: string;
        lastNameTh: string;
      } | null;
    },
    locked: Set<string>,
  ): ScannerDayView {
    const decision = inForce(row, row.times);
    const verdict = classifyDay({ times: row.times, mapped: row.employeeId !== null, decision });
    const latest = row.decisions[0];
    const day = formatDateOnly(row.workDate);
    return {
      id: row.id,
      scannerNumber: row.scannerNumber,
      name: row.name,
      workDate: day,
      times: row.times,
      status: verdict.status,
      reason: verdict.reason,
      employee: row.employee
        ? {
            id: row.employee.id,
            employeeCode: row.employee.employeeCode,
            name: `${row.employee.firstNameTh} ${row.employee.lastNameTh}`.trim(),
          }
        : null,
      decision:
        decision && latest
          ? {
              action: latest.action,
              clockIn: latest.clockIn,
              clockOut: latest.clockOut,
              note: latest.note,
              decidedAt: latest.createdAt.toISOString(),
            }
          : null,
      decisionOutdated: Boolean(latest) && !decision,
      punchesCounted: row.punches.filter((p) => p.supersededAt === null).length,
      locked: row.employeeId !== null && locked.has(`${row.employeeId}|${day}`),
    };
  }

  /** `employeeId|yyyy-mm-dd` of every day a payroll run has already used. */
  private async lockedSet(
    organizationId: string,
    employeeIds: string[],
    from: string,
    to: string,
  ): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        organizationId,
        employeeId: { in: [...new Set(employeeIds)] },
        workDate: { gte: toDateOnly(from), lte: toDateOnly(to) },
        lockedAt: { not: null },
      },
      select: { employeeId: true, workDate: true },
    });
    return new Set(records.map((r) => `${r.employeeId}|${formatDateOnly(r.workDate)}`));
  }

  /** What the file would do, against what Cwork already holds. */
  private async plan(
    organizationId: string,
    lines: ScannerLine[],
  ): Promise<{ entries: PlanEntry[] }> {
    const numbers = [...new Set(lines.map((l) => l.scannerNumber))];
    const [employees, existing] = await Promise.all([
      this.prisma.employee.findMany({
        where: { organizationId, scannerId: { in: numbers }, deletedAt: null },
        select: { id: true, scannerId: true },
      }),
      this.loadDays(organizationId, lines),
    ]);
    const employeeOf = new Map(employees.map((e) => [e.scannerId!, e.id]));
    const known = new Map(
      existing.map((d) => [dayKey(d.scannerNumber, formatDateOnly(d.workDate)), d]),
    );

    const entries = lines.map((line): PlanEntry => {
      const found = known.get(dayKey(line.scannerNumber, line.workDate)) ?? null;
      // A later export of a day can only add times, never take one away.
      const times = found ? [...new Set([...found.times, ...line.times])].sort() : line.times;
      const employeeId = employeeOf.get(line.scannerNumber) ?? found?.employeeId ?? null;
      const decision = found ? inForce(found, times) : null;
      return {
        line,
        existing: found,
        times,
        isNew: found === null,
        changed: found !== null && times.length !== found.times.length,
        employeeId,
        verdict: classifyDay({ times, mapped: employeeId !== null, decision }),
      };
    });
    return { entries };
  }

  private summarise(plan: { entries: PlanEntry[] }, lines: ScannerLine[]) {
    const byStatus = EMPTY_BY_STATUS();
    let added = 0;
    let changed = 0;
    for (const e of plan.entries) {
      byStatus[e.verdict.status] += 1;
      if (e.isNew) added += 1;
      else if (e.changed) changed += 1;
    }
    const dates = lines.map((l) => l.workDate).sort();
    return {
      dateFrom: dates[0] ?? null,
      dateTo: dates[dates.length - 1] ?? null,
      lines: lines.length,
      days: { added, changed, unchanged: plan.entries.length - added - changed },
      byStatus,
    };
  }

  private unmappedOf(entries: PlanEntry[]): UnmappedNumber[] {
    const byNumber = new Map<string, UnmappedNumber>();
    for (const e of entries) {
      if (e.verdict.status !== 'UNMAPPED') continue;
      const row = byNumber.get(e.line.scannerNumber) ?? {
        scannerNumber: e.line.scannerNumber,
        name: '',
        days: 0,
        daysWithTimes: 0,
        firstDay: e.line.workDate,
        lastDay: e.line.workDate,
      };
      row.days += 1;
      if (e.times.length > 0) row.daysWithTimes += 1;
      if (!row.name && e.line.name) row.name = e.line.name;
      if (e.line.workDate < row.firstDay) row.firstDay = e.line.workDate;
      if (e.line.workDate > row.lastDay) row.lastDay = e.line.workDate;
      byNumber.set(e.line.scannerNumber, row);
    }
    return [...byNumber.values()].sort((a, b) => Number(a.scannerNumber) - Number(b.scannerNumber));
  }

  private loadDays(organizationId: string, lines: ScannerLine[]): Promise<LoadedDay[]> {
    const dates = lines.map((l) => l.workDate).sort();
    return this.prisma.scannerDay.findMany({
      where: {
        organizationId,
        scannerNumber: { in: [...new Set(lines.map((l) => l.scannerNumber))] },
        workDate: { gte: toDateOnly(dates[0]!), lte: toDateOnly(dates[dates.length - 1]!) },
      },
      include: dayInclude,
    });
  }

  private loadDaysByIds(organizationId: string, ids: string[]): Promise<LoadedDay[]> {
    return this.prisma.scannerDay.findMany({
      where: { organizationId, id: { in: ids } },
      include: dayInclude,
    });
  }

  /** `employeeId|punch key` of the scanner punches Cwork already holds for the days of a plan. */
  private async existingPunchKeys(
    organizationId: string,
    plan: { entries: PlanEntry[] },
  ): Promise<Set<string>> {
    const employeeIds = [
      ...new Set(plan.entries.flatMap((e) => (e.employeeId ? [e.employeeId] : []))),
    ];
    if (employeeIds.length === 0) return new Set();
    const dates = plan.entries.map((e) => e.line.workDate).sort();
    const punches = await this.prisma.attendancePunch.findMany({
      where: {
        organizationId,
        employeeId: { in: employeeIds },
        workDate: { gte: toDateOnly(dates[0]!), lte: toDateOnly(dates[dates.length - 1]!) },
        clientPunchId: { startsWith: 'scan:' },
      },
      select: { employeeId: true, clientPunchId: true },
    });
    return new Set(punches.map((p) => `${p.employeeId}|${p.clientPunchId}`));
  }

  /**
   * Brings the punch stream in line with what each day now is: punches the day
   * should have and does not are written (or counted again, if they were once
   * set aside); punches it no longer should have are set aside. Writes nothing
   * for a day that is already right, and nothing for a day a payroll run has
   * used.
   */
  private async syncPunches(
    organizationId: string,
    timezone: string,
    userId: string,
    days: LoadedDay[],
  ): Promise<{ added: number; locked: number }> {
    const mapped = days.filter((d) => d.employeeId !== null);
    const dates = mapped.map((d) => formatDateOnly(d.workDate)).sort();
    const locked = mapped.length
      ? await this.lockedSet(
          organizationId,
          mapped.map((d) => d.employeeId!),
          dates[0]!,
          dates[dates.length - 1]!,
        )
      : new Set<string>();

    let added = 0;
    let lockedDays = 0;
    for (const day of mapped) {
      const employeeId = day.employeeId!;
      const date = formatDateOnly(day.workDate);
      const verdict = classifyDay({
        times: day.times,
        mapped: true,
        decision: inForce(day, day.times),
      });
      const wanted = new Map(
        verdict.punches.map((p) => [scannerPunchKey(day.scannerNumber, date, p.time, p.type), p]),
      );
      const active = new Set(
        day.punches
          .filter((l) => l.supersededAt === null && l.punch.clientPunchId)
          .map((l) => l.punch.clientPunchId!),
      );
      const right = wanted.size === active.size && [...wanted.keys()].every((k) => active.has(k));
      if (right) continue;
      if (locked.has(`${employeeId}|${date}`)) {
        lockedDays += 1;
        continue;
      }

      const decisionId = inForce(day, day.times) ? (day.decisions[0]?.id ?? null) : null;
      const created = await this.prisma.$transaction(async (tx) => {
        let made = 0;
        // Set aside what the day no longer should have.
        const links = await tx.scannerPunchLink.findMany({
          where: { scannerDayId: day.id },
          select: { punchId: true, supersededAt: true, punch: { select: { clientPunchId: true } } },
        });
        const stale = links.filter(
          (l) => l.supersededAt === null && !wanted.has(l.punch.clientPunchId ?? ''),
        );
        if (stale.length > 0) {
          await tx.scannerPunchLink.updateMany({
            where: { punchId: { in: stale.map((l) => l.punchId) } },
            data: { supersededAt: new Date() },
          });
        }
        for (const [key, punch] of wanted) {
          const link = links.find((l) => l.punch.clientPunchId === key);
          if (link) {
            if (link.supersededAt !== null) {
              await tx.scannerPunchLink.update({
                where: { punchId: link.punchId },
                data: { supersededAt: null, decisionId },
              });
            }
            continue;
          }
          const row = await tx.attendancePunch.create({
            data: {
              organizationId,
              employeeId,
              type: punch.type === 'CLOCK_IN' ? PunchType.CLOCK_IN : PunchType.CLOCK_OUT,
              method: PunchMethod.BIOMETRIC,
              punchedAt: zonedInstant(day.workDate, punch.time, timezone),
              workDate: day.workDate,
              clientPunchId: key,
              note: 'Fingerprint scanner export',
            },
          });
          await tx.scannerPunchLink.create({
            data: { punchId: row.id, scannerDayId: day.id, decisionId },
          });
          made += 1;
        }
        return made;
      });
      added += created;
      await this.attendance.recalculateDay(organizationId, employeeId, day.workDate, timezone);
    }
    void userId;
    return { added, locked: lockedDays };
  }

  /** Days of a number nobody had registered, now that someone has. */
  private async rematchUnmapped(
    organizationId: string,
    timezone: string,
    userId: string,
    onlyNumber?: string,
  ): Promise<{ daysMatched: number; punchesAdded: number }> {
    const orphans = await this.prisma.scannerDay.findMany({
      where: {
        organizationId,
        employeeId: null,
        ...(onlyNumber ? { scannerNumber: onlyNumber } : {}),
      },
      select: { scannerNumber: true },
      distinct: ['scannerNumber'],
    });
    if (orphans.length === 0) return { daysMatched: 0, punchesAdded: 0 };
    const owners = await this.prisma.employee.findMany({
      where: {
        organizationId,
        deletedAt: null,
        scannerId: { in: orphans.map((o) => o.scannerNumber) },
      },
      select: { id: true, scannerId: true },
    });
    let daysMatched = 0;
    const ids: string[] = [];
    for (const owner of owners) {
      const matched = await this.prisma.scannerDay.findMany({
        where: { organizationId, employeeId: null, scannerNumber: owner.scannerId! },
        select: { id: true },
      });
      await this.prisma.scannerDay.updateMany({
        where: { id: { in: matched.map((m) => m.id) } },
        data: { employeeId: owner.id },
      });
      daysMatched += matched.length;
      ids.push(...matched.map((m) => m.id));
    }
    if (ids.length === 0) return { daysMatched: 0, punchesAdded: 0 };
    const days = await this.loadDaysByIds(organizationId, ids);
    const sync = await this.syncPunches(organizationId, timezone, userId, days);
    return { daysMatched, punchesAdded: sync.added };
  }
}
