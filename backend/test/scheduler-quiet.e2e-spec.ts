// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { ScheduledTasksService } from 'src/modules/jobs/scheduled-tasks.service';
import { resolveDatabaseUrl } from './utils/database';
import { createTestApp, type TestContext } from './utils/test-app';

/**
 * A spec runs for minutes at any hour of the day. If the app under it left its
 * nightly jobs running, one would fire in the middle of a spec once a day (the
 * attendance close-out at 01:00 in Bangkok marked a working day absent inside
 * a payroll test), and the failure would depend on the clock.
 */
describe('The app under test (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('registers its nightly jobs but leaves none of them running', () => {
    const jobs = [...ctx.app.get(SchedulerRegistry).getCronJobs().entries()];

    expect(jobs.map(([name]) => name)).toContain('attendance-close-out');
    expect(jobs.filter(([, job]) => job.isActive).map(([name]) => name)).toEqual([]);
  });

  it('closes the Bangkok day that has just ended, when it runs at one in the morning there (CW-111)', async () => {
    // A far-off week of its own, with the clock set, so nothing here reads today's date.
    // 18:00 UTC on Thursday 10 June 2038 is 01:00 on Friday the 11th in Bangkok.
    const prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
    try {
      await ctx.app.get(ScheduledTasksService).closeOutAttendance(new Date('2038-06-10T18:00:00Z'));

      const closed = async (day: string) =>
        prisma.attendanceRecord.count({ where: { workDate: new Date(`${day}T00:00:00Z`) } });
      // The 10th just ended in Bangkok (a Thursday, a working day): it is closed.
      expect(await closed('2038-06-10')).toBeGreaterThan(0);
      // The 9th is not: it was closed the night before, and not by this run.
      expect(await closed('2038-06-09')).toBe(0);
      expect(await closed('2038-06-11')).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });
});
