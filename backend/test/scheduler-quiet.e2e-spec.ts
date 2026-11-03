// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { SchedulerRegistry } from '@nestjs/schedule';
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
});
