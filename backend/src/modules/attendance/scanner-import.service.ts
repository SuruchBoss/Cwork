// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  PunchMethod,
  PayrollRunStatus,
  PunchType,
  ScannerDayDecisionAction,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  AccessDeniedError,
  BusinessRuleError,
  NotFoundError,
} from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { Permission } from '../../core/security/permissions';
import type { ImportProblem } from '../../core/spreadsheet/problems';
import type { UploadedTable } from '../../core/spreadsheet/upload';
import { formatDateOnly, toDateOnly, zonedInstant } from '../../core/utils/date.util';
import { AuditService } from '../audit/audit.service';
import { judgeOwnRecord } from '../auth/domain/duty-separation';
import { DutySeparationService } from '../auth/duty-separation.service';
import { OrganizationService } from '../organization/organization.service';
import { AttendanceService } from './attendance.service';
import { earliestFreeStart, ownerOn } from './domain/scanner-binding';
import { ScannerBindingsService } from './scanner-bindings.service';
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
  BindPreviewQueryDto,
  BindScannerNumberDto,
  DecideScannerDayDto,
  ScannerDaysQueryDto,
} from './dto/scanner.dto';

/** The review list covers at most this many days at a time. */
/** How many days' punches are written in one transaction. */
const PUNCH_WRITE_DAYS_AT_A_TIME = 250;

const MAX_REVIEW_DAYS = 93;

const dayInclude = {
  decisions: { orderBy: { createdAt: 'desc' }, take: 1 },
  punches: {
    select: { supersededAt: true, punch: { select: { clientPunchId: true, employeeId: true } } },
  },
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
  /** Days scanned only once, whatever HR has decided about them (CW-106). */
  singleScanDays: number;
  /** Punches this file would add to attendance. */
  punchesToAdd: number;
  /** Days of the file payroll has already used (same rule as the review page): left as they are. */
  lockedDays: number;
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
  /** Days scanned only once, whatever HR has decided about them (CW-106). */
  singleScanDays: number;
  punchesAdded: number;
  /** Days of the file payroll has already used (same rule as the review page): left as they were. */
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
  /**
   * Set when the day belongs to the person asking. `canDecide` is false while
   * someone else may decide it, and true when nobody else could.
   */
  ownDay: { canDecide: boolean } | null;
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

/**
 * The days payroll has used. A day is used when its attendance record is locked,
 * or when it lies inside a period the employee was paid for.
 */
class LockedDays {
  constructor(
    private readonly records: Set<string>,
    private readonly paid: Map<string, Array<[string, string]>>,
  ) {}

  /** `key` is `employeeId|yyyy-mm-dd`. */
  has(key: string): boolean {
    if (this.records.has(key)) return true;
    const cut = key.lastIndexOf('|');
    const spans = this.paid.get(key.slice(0, cut));
    const day = key.slice(cut + 1);
    return Boolean(spans?.some(([start, end]) => start <= day && day <= end));
  }
}

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
    private readonly duty: DutySeparationService,
    private readonly bindings: ScannerBindingsService,
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
        singleScanDays: 0,
        punchesToAdd: 0,
        lockedDays: 0,
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
      lockedDays: await this.countLockedDays(user.organizationId, plan.entries),
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
    const added = await this.syncPunches(
      organizationId,
      organization.timezone,
      user.userId,
      touched,
    );

    // A number HR registered since an earlier file may now belong to someone.
    const late = await this.rematchUnmapped(organizationId, organization.timezone, user.userId);

    await this.prisma.scannerImport.update({
      where: { id: imported.id },
      data: { punchesAdded: added + late.punchesAdded },
    });

    const result: ScannerCommitResult = {
      importId: imported.id,
      fileName: file.originalname,
      dateFrom: summary.dateFrom!,
      dateTo: summary.dateTo!,
      lines: lines.length,
      days: summary.days,
      byStatus: summary.byStatus,
      singleScanDays: summary.singleScanDays,
      punchesAdded: added + late.punchesAdded,
      lockedDays: await this.countLockedDays(organizationId, plan.entries),
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
        { from, to, max: MAX_REVIEW_DAYS },
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
    const own = await this.ownContext(
      user,
      rows.map((r) => r.employeeId),
    );
    const views = rows.map((row) => this.view(row, locked, own));

    // A locked day is not work for HR: no decision can change it. It is counted
    // under locked, not waiting, and listed under the LOCKED filter (#95).
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
      if (v.status === 'WAITING') {
        if (!v.locked) totals.waiting += 1;
      } else if (v.status === 'COUNTED') totals.counted += 1;
      else if (v.status === 'DECIDED_USE') totals.decidedUse += 1;
      else if (v.status === 'DECIDED_IGNORE') totals.decidedIgnore += 1;
      else if (v.status === 'NO_PUNCH') totals.noPunch += 1;
      else totals.unmapped += 1;
    }

    const wanted =
      filter === 'ALL'
        ? views
        : filter === 'LOCKED'
          ? views.filter((v) => v.locked)
          : views.filter((v) => v.status === filter && !(filter === 'WAITING' && v.locked));
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
      : new LockedDays(new Set(), new Map());
    const decisions = await this.prisma.scannerDayDecision.findMany({
      where: { scannerDayId: dayId },
      orderBy: { createdAt: 'desc' },
    });
    const current =
      decisions[0] && sameTimes(decisions[0].timesAtDecision, row.times) ? decisions[0].id : null;
    const own = await this.ownContext(user, [row.employeeId]);
    return {
      ...this.view(row, locked, own),
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
    const ownVerdict = await this.ownVerdict(
      user,
      row.employeeId,
      row.employee?.departmentId ?? null,
    );
    if (ownVerdict === 'LEAVE_TO_ANOTHER') {
      throw new BusinessRuleError(
        'OWN_SCANNER_DAY_NEEDS_ANOTHER',
        'วันสแกนนี้เป็นของคุณเอง ต้องให้ผู้มีสิทธิ์จัดการเวลาทำงานคนอื่นเป็นผู้ตัดสิน',
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
        ownDay: ownVerdict === 'ALLOWED_AS_ONLY_HOLDER',
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
      summary:
        `Decided scanner number ${row.scannerNumber} on ${day}: ${dto.action}` +
        (ownVerdict === 'ALLOWED_AS_ONLY_HOLDER' ? ' (own day, no one else may decide)' : ''),
      changes: {
        ownDay: ownVerdict === 'ALLOWED_AS_ONLY_HOLDER',
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

    // "From now on" starts at the first day the number is free (CW-109), and counts
    // the waiting days from then on to the person: said before it is chosen.
    const waiting = await this.prisma.scannerDay.findMany({
      where: base,
      select: { scannerNumber: true, workDate: true },
    });
    const daysOf = new Map<string, string[]>();
    for (const day of waiting) {
      daysOf.set(day.scannerNumber, [
        ...(daysOf.get(day.scannerNumber) ?? []),
        formatDateOnly(day.workDate),
      ]);
    }
    const periods = await this.prisma.employeeScannerNumber.findMany({
      where: {
        organizationId: user.organizationId,
        scannerNumber: { in: all.map((g) => g.scannerNumber) },
      },
      select: { scannerNumber: true, validFrom: true, validTo: true },
    });
    const periodsOf = new Map<
      string,
      Array<{ validFrom: string | null; validTo: string | null }>
    >();
    for (const p of periods) {
      periodsOf.set(p.scannerNumber, [
        ...(periodsOf.get(p.scannerNumber) ?? []),
        {
          validFrom: p.validFrom ? formatDateOnly(p.validFrom) : null,
          validTo: p.validTo ? formatDateOnly(p.validTo) : null,
        },
      ]);
    }
    return all
      .map((g) => {
        // undefined: the number is in use by someone, so it cannot be bound from now on.
        const from = earliestFreeStart(periodsOf.get(g.scannerNumber) ?? []);
        return {
          scannerNumber: g.scannerNumber,
          name: nameOf.get(g.scannerNumber) ?? '',
          days: g._count._all,
          daysWithTimes: timed.get(g.scannerNumber) ?? 0,
          firstDay: formatDateOnly(g._min.workDate!),
          lastDay: formatDateOnly(g._max.workDate!),
          foreverPossible: from !== undefined,
          foreverFrom: from ?? null,
          foreverDays:
            from === undefined
              ? 0
              : (daysOf.get(g.scannerNumber) ?? []).filter((d) => from === null || d >= from)
                  .length,
        };
      })
      .sort((a, b) => Number(a.scannerNumber) - Number(b.scannerNumber));
  }

  /**
   * Registers a scanner number on an employee, and counts the days that were waiting on it.
   *
   * `ALWAYS` binds it from now on (from the beginning, or the day after an earlier
   * end of the number) and the number is then the employee's number in use.
   * `THESE_DAYS` binds it only for the days no one owns today, from the first to the
   * last, so the same number can belong to someone else outside them (CW-109).
   */
  async bind(user: AuthenticatedUser, dto: BindScannerNumberDto) {
    this.assertWholeCompany(user);
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, employeeCode: true },
    });
    if (!employee) throw new NotFoundError('Employee', dto.employeeId);

    const scope = dto.scope ?? 'ALWAYS';
    if (scope !== 'THESE_DAYS' && (dto.from || dto.to)) {
      throw new BusinessRuleError(
        'SCANNER_RANGE_NEEDS_THESE_DAYS',
        'เลือกวันแรกและวันสุดท้ายได้เฉพาะตอนผูกเลขเฉพาะวันเหล่านี้',
        { scannerNumber: dto.scannerNumber },
      );
    }
    let from: string | null;
    let to: string | null = null;
    if (scope === 'THESE_DAYS') {
      const range = await this.waitingRange(
        user.organizationId,
        dto.scannerNumber,
        dto.from,
        dto.to,
      );
      from = range.from;
      to = range.to;
    } else {
      from = await this.bindings.firstFreeStart(user.organizationId, dto.scannerNumber);
    }

    await this.bindings.bind({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      employeeId: employee.id,
      scannerNumber: dto.scannerNumber,
      from,
      to,
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
      summary:
        scope === 'THESE_DAYS'
          ? `Registered scanner number ${dto.scannerNumber} on employee ${employee.employeeCode} for ${from} to ${to}`
          : `Registered scanner number ${dto.scannerNumber} on employee ${employee.employeeCode}`,
      changes: {
        scannerId: { from: null, to: dto.scannerNumber },
        validFrom: from,
        validTo: to,
        daysMatched: result.daysMatched,
      },
    });
    return result;
  }

  /**
   * The days of a number that wait for an owner, narrowed to the first and last day asked
   * for (the whole waiting stretch when none is). A refusal in words when there is none, or
   * when a bound lies outside the waiting days or the two are the wrong way round.
   */
  private async waitingRange(
    organizationId: string,
    scannerNumber: string,
    wantedFrom?: string,
    wantedTo?: string,
  ) {
    const waiting = await this.prisma.scannerDay.findMany({
      where: { organizationId, employeeId: null, scannerNumber },
      select: { workDate: true, times: true },
      orderBy: { workDate: 'asc' },
    });
    if (waiting.length === 0) {
      throw new BusinessRuleError(
        'NO_UNOWNED_DAYS',
        `ไม่มีวันของเลขสแกน ${scannerNumber} ที่รอเจ้าของ`,
        { scannerNumber },
      );
    }
    const first = formatDateOnly(waiting[0]!.workDate);
    const last = formatDateOnly(waiting[waiting.length - 1]!.workDate);
    const from = wantedFrom ?? first;
    const to = wantedTo ?? last;
    if (from > to) {
      throw new BusinessRuleError('SCANNER_PERIOD_ORDER', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น', {
        from,
        to,
      });
    }
    if (from < first || to > last) {
      throw new BusinessRuleError(
        'SCANNER_RANGE_OUTSIDE_WAITING_DAYS',
        `เลือกได้เฉพาะวันที่ ${first} ถึง ${last} ซึ่งเป็นวันของเลขสแกน ${scannerNumber} ที่รอเจ้าของ`,
        { first, last },
      );
    }
    const inside = waiting.filter((d) => {
      const date = formatDateOnly(d.workDate);
      return date >= from && date <= to;
    });
    if (inside.length === 0) {
      throw new BusinessRuleError(
        'NO_UNOWNED_DAYS',
        `ไม่มีวันของเลขสแกน ${scannerNumber} ที่รอเจ้าของระหว่าง ${from} ถึง ${to}`,
        { scannerNumber, from, to },
      );
    }
    return {
      from,
      to,
      days: inside.map((d) => formatDateOnly(d.workDate)),
      daysWithTimes: inside
        .filter((d) => d.times.length > 0)
        .map((d) => formatDateOnly(d.workDate)),
    };
  }

  /**
   * What binding a waiting number to an employee for these days would count, worked out and
   * nothing written: the waiting days in the range, and how many of them the employee
   * already has scans for under another number. Both numbers' scans would count for the
   * same day, which is rarely what a borrowed card means.
   */
  async previewBind(user: AuthenticatedUser, query: BindPreviewQueryDto) {
    this.assertWholeCompany(user);
    const employee = await this.prisma.employee.findFirst({
      where: { id: query.employeeId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundError('Employee', query.employeeId);
    const range = await this.waitingRange(
      user.organizationId,
      query.scannerNumber,
      query.from,
      query.to,
    );
    const otherDays = await this.prisma.scannerDay.findMany({
      where: {
        organizationId: user.organizationId,
        employeeId: employee.id,
        scannerNumber: { not: query.scannerNumber },
        workDate: { gte: toDateOnly(range.from), lte: toDateOnly(range.to) },
        NOT: { times: { isEmpty: true } },
      },
      select: { workDate: true },
    });
    const scannedElsewhere = new Set(otherDays.map((d) => formatDateOnly(d.workDate)));
    return {
      from: range.from,
      to: range.to,
      days: range.days.length,
      daysWithTimes: range.daysWithTimes.length,
      daysAlsoScannedOnAnotherNumber: range.daysWithTimes.filter((d) => scannedElsewhere.has(d))
        .length,
    };
  }

  /**
   * What ending a number in use on a date would do, worked out and nothing written:
   * the later days of the number that no one has decided go back to no one, the
   * decided ones stay with whom they were decided for, and a day a payroll run
   * has calculated or paid blocks the end (CW-109).
   */
  async previewEnd(user: AuthenticatedUser, bindingId: string, endDate: string) {
    this.assertWholeCompany(user);
    const row = await this.bindings.endable(user.organizationId, bindingId, endDate);
    const { days: _days, ...said } = await this.planEnd(user.organizationId, row, endDate);
    void _days;
    return said;
  }

  /**
   * Ends a scanner number that is in use: it counts to the employee through the day
   * given. Later days of the number that no one has decided go back to no one (their
   * punches set aside) and are matched again against any other period that holds them.
   * A later day inside a calculated, approved or paid payroll run refuses the end,
   * naming the day and the run; nothing is changed then.
   */
  async endNumber(user: AuthenticatedUser, bindingId: string, endDate: string) {
    this.assertWholeCompany(user);
    // The first read only finds the number to lock and refuses the plain cases early.
    const found = await this.bindings.endable(user.organizationId, bindingId, endDate);
    const organization = await this.organization.getOrganization(user.organizationId);

    // Everything that decides and writes the end is done holding the number's lock,
    // the one binding a number takes, so two ends of one period (or an end and a
    // bind) cannot both pass the checks on the same state: the second waits, reads
    // what the first left and is refused in words.
    const { ended, row, released } = await this.bindings.withNumberLocked(
      this.prisma,
      user.organizationId,
      found.scannerNumber,
      async (tx) => {
        const current = await this.bindings.endable(user.organizationId, bindingId, endDate, tx);
        const plan = await this.planEnd(user.organizationId, current, endDate, tx);
        if (plan.blocked) {
          throw new BusinessRuleError(
            'SCANNER_DAY_IN_PAYROLL_RUN',
            plan.blocked.runNo
              ? `สิ้นสุดเลขสแกน ${current.scannerNumber} ก่อนวันที่ ${plan.blocked.date} ไม่ได้ เพราะวันนั้นอยู่ในรอบเงินเดือน ${plan.blocked.runNo} ที่คำนวณหรืออนุมัติแล้ว`
              : `สิ้นสุดเลขสแกน ${current.scannerNumber} ก่อนวันที่ ${plan.blocked.date} ไม่ได้ เพราะวันนั้นเงินเดือนใช้ไปแล้ว`,
            {
              scannerNumber: current.scannerNumber,
              date: plan.blocked.date,
              runNo: plan.blocked.runNo ?? '—',
            },
          );
        }
        const days = plan.days;
        const result = await this.bindings.end(user, bindingId, endDate, {
          db: tx,
          released: days.length,
        });
        if (days.length > 0) {
          const ids = days.map((d) => d.id);
          await tx.scannerPunchLink.updateMany({
            where: { scannerDayId: { in: ids }, supersededAt: null },
            data: { supersededAt: new Date() },
          });
          await tx.scannerDay.updateMany({
            where: { id: { in: ids } },
            data: { employeeId: null },
          });
        }
        return { ended: result, row: current, released: days };
      },
    );
    if (released.length > 0) {
      await this.attendance.recalculateDays(
        user.organizationId,
        released.map((d) => ({ employeeId: row.employeeId, workDate: d.workDate })),
        organization.timezone,
      );
    }
    // A period that holds one of those days now takes it (none can while this one was in use).
    const matched = await this.rematchUnmapped(
      user.organizationId,
      organization.timezone,
      user.userId,
      row.scannerNumber,
    );
    return { ...ended, daysReleased: released.length, daysMatched: matched.daysMatched };
  }

  /** The later days of a number held by an employee, who keeps them and who loses them. */
  private async planEnd(
    organizationId: string,
    row: { employeeId: string; scannerNumber: string; validTo?: Date | null },
    endDate: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const later = await db.scannerDay.findMany({
      where: {
        organizationId,
        scannerNumber: row.scannerNumber,
        employeeId: row.employeeId,
        // A period that has already ended only gives back the days between the new end and
        // its old one: later days of the number are another period's, even the same person's.
        workDate: { gt: toDateOnly(endDate), ...(row.validTo ? { lte: row.validTo } : {}) },
      },
      orderBy: { workDate: 'asc' },
      select: { id: true, workDate: true, decisions: { select: { id: true }, take: 1 } },
    });
    const days = later.filter((d) => d.decisions.length === 0);
    const kept = later.length - days.length;
    let blocked: { date: string; runNo: string | null } | null = null;
    if (days.length > 0) {
      const first = formatDateOnly(days[0]!.workDate);
      const last = formatDateOnly(days[days.length - 1]!.workDate);
      const [locked, slips] = await Promise.all([
        db.attendanceRecord.findMany({
          where: {
            organizationId,
            employeeId: row.employeeId,
            workDate: { gte: toDateOnly(first), lte: toDateOnly(last) },
            lockedAt: { not: null },
          },
          select: { workDate: true },
        }),
        db.payslip.findMany({
          where: {
            employeeId: row.employeeId,
            run: {
              organizationId,
              status: {
                in: [
                  PayrollRunStatus.CALCULATED,
                  PayrollRunStatus.PENDING_APPROVAL,
                  PayrollRunStatus.APPROVED,
                  PayrollRunStatus.PAID,
                ],
              },
              period: {
                periodStart: { lte: toDateOnly(last) },
                periodEnd: { gte: toDateOnly(first) },
              },
            },
          },
          select: {
            run: {
              select: { runNo: true, period: { select: { periodStart: true, periodEnd: true } } },
            },
          },
        }),
      ]);
      const lockedOn = new Set(locked.map((r) => formatDateOnly(r.workDate)));
      for (const day of days) {
        const date = formatDateOnly(day.workDate);
        const slip = slips.find(
          (s) =>
            formatDateOnly(s.run.period.periodStart) <= date &&
            formatDateOnly(s.run.period.periodEnd) >= date,
        );
        if (slip || lockedOn.has(date)) {
          blocked = { date, runNo: slip?.run.runNo ?? null };
          break;
        }
      }
    }
    return {
      scannerNumber: row.scannerNumber,
      endDate,
      daysReleased: days.length,
      firstDay: days.length > 0 ? formatDateOnly(days[0]!.workDate) : null,
      lastDay: days.length > 0 ? formatDateOnly(days[days.length - 1]!.workDate) : null,
      daysKept: kept,
      blocked,
      days,
    };
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

  /**
   * Whether the day about to be decided is the decider's own, and if so whether
   * anyone else could decide it instead (nobody decides their own day while
   * someone else may).
   */
  private async ownVerdict(
    user: AuthenticatedUser,
    subjectEmployeeId: string | null,
    departmentId: string | null,
  ) {
    if (subjectEmployeeId === null || subjectEmployeeId !== user.employeeId) return 'NOT_OWN';
    return judgeOwnRecord({
      subjectEmployeeId,
      actorEmployeeId: user.employeeId,
      anotherHolderExists: await this.duty.anotherHolderExists(
        user.organizationId,
        Permission.ATTENDANCE_MANAGE,
        user.userId,
        departmentId,
      ),
    });
  }

  /** What the review page needs to know about the asker's own days, worked out once. */
  private async ownContext(
    user: AuthenticatedUser,
    employeeIds: Array<string | null>,
  ): Promise<{ employeeId: string; canDecide: boolean } | null> {
    if (!user.employeeId || !employeeIds.includes(user.employeeId)) return null;
    const own = await this.prisma.employee.findFirst({
      where: { id: user.employeeId, organizationId: user.organizationId },
      select: { departmentId: true },
    });
    const verdict = await this.ownVerdict(user, user.employeeId, own?.departmentId ?? null);
    return { employeeId: user.employeeId, canDecide: verdict !== 'LEAVE_TO_ANOTHER' };
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
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstNameTh: true,
            lastNameTh: true,
            departmentId: true,
          },
        },
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
    locked: LockedDays,
    own: { employeeId: string; canDecide: boolean } | null,
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
      ownDay: own && row.employeeId === own.employeeId ? { canDecide: own.canDecide } : null,
    };
  }

  /**
   * Every day payroll has used, as `employeeId|yyyy-mm-dd`: a day whose
   * attendance record was locked, and any day inside a period an employee was
   * paid for. The second is what keeps a day that had no record when the run
   * was paid (a day HR had not yet decided) from being decided afterwards and
   * adding punches to a paid month (#94). It follows markPaid: a paid run
   * with a payslip for the employee covers the whole period.
   */
  private async lockedSet(
    organizationId: string,
    employeeIds: string[],
    from: string,
    to: string,
  ): Promise<LockedDays> {
    if (employeeIds.length === 0) return new LockedDays(new Set(), new Map());
    const unique = [...new Set(employeeIds)];
    const [records, payslips] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: {
          organizationId,
          employeeId: { in: unique },
          workDate: { gte: toDateOnly(from), lte: toDateOnly(to) },
          lockedAt: { not: null },
        },
        select: { employeeId: true, workDate: true },
      }),
      this.prisma.payslip.findMany({
        where: {
          employeeId: { in: unique },
          run: {
            organizationId,
            status: PayrollRunStatus.PAID,
            period: {
              periodStart: { lte: toDateOnly(to) },
              periodEnd: { gte: toDateOnly(from) },
            },
          },
        },
        select: {
          employeeId: true,
          run: { select: { period: { select: { periodStart: true, periodEnd: true } } } },
        },
      }),
    ]);
    const paid = new Map<string, Array<[string, string]>>();
    for (const slip of payslips) {
      const spans = paid.get(slip.employeeId) ?? [];
      spans.push([
        formatDateOnly(slip.run.period.periodStart),
        formatDateOnly(slip.run.period.periodEnd),
      ]);
      paid.set(slip.employeeId, spans);
    }
    return new LockedDays(
      new Set(records.map((r) => `${r.employeeId}|${formatDateOnly(r.workDate)}`)),
      paid,
    );
  }

  /** What the file would do, against what Cwork already holds. */
  private async plan(
    organizationId: string,
    lines: ScannerLine[],
  ): Promise<{ entries: PlanEntry[] }> {
    const numbers = [...new Set(lines.map((l) => l.scannerNumber))];
    const [bound, existing] = await Promise.all([
      this.bindings.forNumbers(organizationId, numbers),
      this.loadDays(organizationId, lines),
    ]);
    const known = new Map(
      existing.map((d) => [dayKey(d.scannerNumber, formatDateOnly(d.workDate)), d]),
    );

    const entries = lines.map((line): PlanEntry => {
      const found = known.get(dayKey(line.scannerNumber, line.workDate)) ?? null;
      // A later export of a day can only add times, never take one away.
      const times = found ? [...new Set([...found.times, ...line.times])].sort() : line.times;
      // A day outside every period of its number is no one's; a day already counted
      // stays with whom it was counted for.
      const employeeId =
        ownerOn(bound, line.scannerNumber, line.workDate) ?? found?.employeeId ?? null;
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
    let singleScanDays = 0;
    for (const e of plan.entries) {
      byStatus[e.verdict.status] += 1;
      if (e.times.length === 1) singleScanDays += 1;
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
      singleScanDays,
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

  /** Days of the file a payroll run has used, by the rule the review page applies. */
  private async countLockedDays(
    organizationId: string,
    entries: Array<Pick<PlanEntry, 'employeeId'> & { line: Pick<ScannerLine, 'workDate'> }>,
  ): Promise<number> {
    const mapped = entries.filter((e) => e.employeeId !== null);
    if (mapped.length === 0) return 0;
    const dates = mapped.map((e) => e.line.workDate).sort();
    const locked = await this.lockedSet(
      organizationId,
      mapped.map((e) => e.employeeId!),
      dates[0]!,
      dates[dates.length - 1]!,
    );
    return mapped.filter((e) => locked.has(`${e.employeeId}|${e.line.workDate}`)).length;
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
  ): Promise<number> {
    const mapped = days.filter((d) => d.employeeId !== null);
    const dates = mapped.map((d) => formatDateOnly(d.workDate)).sort();
    const locked = mapped.length
      ? await this.lockedSet(
          organizationId,
          mapped.map((d) => d.employeeId!),
          dates[0]!,
          dates[dates.length - 1]!,
        )
      : new LockedDays(new Set(), new Map());

    // What each day needs written, worked out before anything is.
    const work: Array<{
      day: LoadedDay;
      employeeId: string;
      wanted: Map<string, { time: string; type: 'CLOCK_IN' | 'CLOCK_OUT' }>;
      decisionId: string | null;
    }> = [];
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
      // Only the punches of the day's own employee count as the day's: a punch of
      // someone the day once belonged to is history, not part of what it needs.
      const activeLinks = day.punches.filter((l) => l.supersededAt === null);
      const active = new Set(
        activeLinks
          .filter((l) => l.punch.clientPunchId && l.punch.employeeId === employeeId)
          .map((l) => l.punch.clientPunchId!),
      );
      const right =
        wanted.size === active.size &&
        activeLinks.every((l) => l.punch.employeeId === employeeId) &&
        [...wanted.keys()].every((k) => active.has(k));
      if (right) continue;
      if (locked.has(`${employeeId}|${date}`)) continue;
      work.push({
        day,
        employeeId,
        wanted,
        decisionId: inForce(day, day.times) ? (day.decisions[0]?.id ?? null) : null,
      });
    }

    // The writes go in groups of days, a group in one transaction, so a failure
    // leaves whole days as they were rather than half-written ones.
    let added = 0;
    for (let i = 0; i < work.length; i += PUNCH_WRITE_DAYS_AT_A_TIME) {
      const group = work.slice(i, i + PUNCH_WRITE_DAYS_AT_A_TIME);
      added += await this.prisma.$transaction(
        async (tx) => {
          const links = await tx.scannerPunchLink.findMany({
            where: { scannerDayId: { in: group.map((w) => w.day.id) } },
            select: {
              scannerDayId: true,
              punchId: true,
              supersededAt: true,
              punch: { select: { clientPunchId: true, employeeId: true } },
            },
          });
          const linksOf = new Map<string, typeof links>();
          for (const link of links) {
            linksOf.set(link.scannerDayId, [...(linksOf.get(link.scannerDayId) ?? []), link]);
          }

          const setAside: string[] = [];
          const punchRows: Prisma.AttendancePunchCreateManyInput[] = [];
          const linkRows: Prisma.ScannerPunchLinkCreateManyInput[] = [];
          for (const { day, employeeId, wanted, decisionId } of group) {
            const all = linksOf.get(day.id) ?? [];
            // Set aside what the day no longer should have, and any punch of someone
            // else that is still in force on it.
            for (const l of all) {
              if (
                l.supersededAt === null &&
                (l.punch.employeeId !== employeeId || !wanted.has(l.punch.clientPunchId ?? ''))
              ) {
                setAside.push(l.punchId);
              }
            }
            // A set-aside link is taken up again only for the punch of the same
            // employee; the day's new holder gets punches of their own.
            const own = all.filter((l) => l.punch.employeeId === employeeId);
            for (const [key, punch] of wanted) {
              const link = own.find((l) => l.punch.clientPunchId === key);
              if (link) {
                if (link.supersededAt !== null) {
                  await tx.scannerPunchLink.update({
                    where: { punchId: link.punchId },
                    data: { supersededAt: null, decisionId },
                  });
                }
                continue;
              }
              const id = randomUUID();
              punchRows.push({
                id,
                organizationId,
                employeeId,
                type: punch.type === 'CLOCK_IN' ? PunchType.CLOCK_IN : PunchType.CLOCK_OUT,
                method: PunchMethod.BIOMETRIC,
                punchedAt: zonedInstant(day.workDate, punch.time, timezone),
                workDate: day.workDate,
                clientPunchId: key,
                note: 'Fingerprint scanner export',
              });
              linkRows.push({ punchId: id, scannerDayId: day.id, decisionId });
            }
          }
          if (setAside.length > 0) {
            await tx.scannerPunchLink.updateMany({
              where: { punchId: { in: setAside } },
              data: { supersededAt: new Date() },
            });
          }
          if (punchRows.length > 0) await tx.attendancePunch.createMany({ data: punchRows });
          if (linkRows.length > 0) await tx.scannerPunchLink.createMany({ data: linkRows });
          return punchRows.length;
        },
        { timeout: 120_000 },
      );
    }

    await this.attendance.recalculateDays(
      organizationId,
      work.map((w) => ({ employeeId: w.employeeId, workDate: w.day.workDate })),
      timezone,
    );
    void userId;
    return added;
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
      select: { id: true, scannerNumber: true, workDate: true },
    });
    if (orphans.length === 0) return { daysMatched: 0, punchesAdded: 0 };
    // Each day goes to whoever holds its number on that day (CW-109); a day
    // outside every period stays unowned.
    const bound = await this.bindings.forNumbers(organizationId, [
      ...new Set(orphans.map((o) => o.scannerNumber)),
    ]);
    const byOwner = new Map<string, string[]>();
    for (const day of orphans) {
      const owner = ownerOn(bound, day.scannerNumber, formatDateOnly(day.workDate));
      if (owner) byOwner.set(owner, [...(byOwner.get(owner) ?? []), day.id]);
    }
    let daysMatched = 0;
    const ids: string[] = [];
    for (const [employeeId, dayIds] of byOwner) {
      await this.prisma.scannerDay.updateMany({
        where: { id: { in: dayIds } },
        data: { employeeId },
      });
      daysMatched += dayIds.length;
      ids.push(...dayIds);
    }
    if (ids.length === 0) return { daysMatched: 0, punchesAdded: 0 };
    const days = await this.loadDaysByIds(organizationId, ids);
    const punchesAdded = await this.syncPunches(organizationId, timezone, userId, days);
    return { daysMatched, punchesAdded };
  }
}
