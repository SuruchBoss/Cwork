// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  eachDateInRange,
  formatDateOnly,
  isoWeekday,
  toDateOnly,
} from '../../core/utils/date.util';
import { resolveWorkCalendar, type WorkDay } from './domain/work-calendar';

/** How far either side of the asked-for days to look for a holiday's substitute. */
const SUBSTITUTE_SEARCH_DAYS = 31;

/** The weekdays worked by someone with no schedule assigned. */
const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * The one answer to "what is this day for this employee" (CW-081), from their
 * schedule, any day-by-day roster change, and the holidays of the whole
 * organisation and of their work location. Attendance, leave, overtime and
 * payroll all use it, so a holiday's substitute day is the same day to each.
 */
@Injectable()
export class WorkCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Each day from `from` to `to`, keyed by ISO date.
   *
   * `wholePeriod` resolves the days as if the employee were employed on all of
   * them, which is what the month's working days are for prorating a joiner or
   * a leaver (CW-082): a holiday before they joined still takes its substitute
   * day out of the month, though it owed them nothing.
   */
  async daysFor(
    organizationId: string,
    employeeId: string,
    from: Date,
    to: Date,
    options: { wholePeriod?: boolean } = {},
  ): Promise<Map<string, WorkDay>> {
    const first = toDateOnly(from);
    const last = toDateOnly(to);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { hireDate: true, lastWorkingDate: true, workLocationId: true },
    });
    if (!employee) throw new NotFoundError('Employee', employeeId);

    // A substitute can come from a holiday before the asked-for days, and a
    // holiday among them can be taken after.
    const windowFrom = addUtcDays(first, -SUBSTITUTE_SEARCH_DAYS);
    const windowTo = addUtcDays(last, SUBSTITUTE_SEARCH_DAYS);

    const [assignments, overrides, holidays] = await Promise.all([
      this.prisma.scheduleAssignment.findMany({
        where: {
          employeeId,
          effectiveFrom: { lte: windowTo },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: windowFrom } }],
        },
        orderBy: { effectiveFrom: 'desc' },
        select: {
          effectiveFrom: true,
          effectiveTo: true,
          schedule: { select: { workingDays: true } },
        },
      }),
      this.prisma.shiftAssignment.findMany({
        where: { employeeId, date: { gte: windowFrom, lte: windowTo } },
        select: { date: true, isDayOff: true },
      }),
      this.prisma.holiday.findMany({
        where: {
          organizationId,
          date: { gte: windowFrom, lte: windowTo },
          OR: [
            { workLocationId: null },
            ...(employee.workLocationId ? [{ workLocationId: employee.workLocationId }] : []),
          ],
        },
        select: { date: true, isPaid: true, substituteFor: { select: { date: true } } },
      }),
    ]);

    const rostered = new Map(overrides.map((o) => [formatDateOnly(o.date), !o.isDayOff]));
    const employed = (date: Date) =>
      options.wholePeriod === true ||
      (date >= employee.hireDate &&
        (employee.lastWorkingDate === null || date <= employee.lastWorkingDate));
    const scheduled = (date: Date) => {
      const roster = rostered.get(formatDateOnly(date));
      if (roster !== undefined) return roster;
      const assignment = assignments.find(
        (a) => a.effectiveFrom <= date && (a.effectiveTo === null || a.effectiveTo >= date),
      );
      const workingDays = assignment?.schedule.workingDays ?? DEFAULT_WORKING_WEEKDAYS;
      return workingDays.includes(isoWeekday(date));
    };

    const resolved = resolveWorkCalendar(
      eachDateInRange(windowFrom, windowTo).map((date) => ({
        date: formatDateOnly(date),
        scheduled: scheduled(date),
        employed: employed(date),
      })),
      holidays.map((h) => ({
        date: formatDateOnly(h.date),
        isPaid: h.isPaid,
        substituteFor: h.substituteFor ? formatDateOnly(h.substituteFor.date) : null,
      })),
    );

    const firstKey = formatDateOnly(first);
    const lastKey = formatDateOnly(last);
    return new Map(
      resolved.filter((d) => d.date >= firstKey && d.date <= lastKey).map((d) => [d.date, d]),
    );
  }

  /** One day. */
  async dayFor(organizationId: string, employeeId: string, date: Date): Promise<WorkDay> {
    const days = await this.daysFor(organizationId, employeeId, date, date);
    return days.get(formatDateOnly(toDateOnly(date)))!;
  }
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}
