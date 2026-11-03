// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { ScheduledTasksService } from './scheduled-tasks.service';

/**
 * Which day the nightly attendance close-out closes (CW-111). Every case sets
 * the clock; none reads the real one.
 *
 * The job runs at 18:00 UTC, which is 01:00 in Asia/Bangkok. The day it closes
 * is the organisation's day that has just ended, not the UTC date minus one.
 */
describe('The nightly attendance close-out', () => {
  // The job logs its summary; keep the output clean so counting tools can parse the run.
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  async function closedBy(now: string, timezone = 'Asia/Bangkok') {
    const closeOutDay = jest.fn(async () => ({ absent: 0, incomplete: 0 }));
    const prisma = {
      organization: {
        findMany: jest.fn(async () => [{ id: 'org-1', code: 'ORG' }]),
        findUniqueOrThrow: jest.fn(async () => ({ timezone })),
      },
    };
    const locks = {
      runExclusively: jest.fn(async (_name: string, work: () => Promise<void>) => {
        await work();
        return 'ran';
      }),
    };
    const tasks = new ScheduledTasksService(
      prisma as never,
      { closeOutDay } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      locks as never,
      {} as never,
    );

    await tasks.closeOutAttendance(new Date(now));

    expect(closeOutDay).toHaveBeenCalledTimes(1);
    const [organizationId, day] = closeOutDay.mock.calls[0] as unknown as [string, Date];
    expect(organizationId).toBe('org-1');
    return day.toISOString().slice(0, 10);
  }

  it('at one in the morning in Bangkok closes the Bangkok day that has just ended', async () => {
    // 18:00 UTC on 3 November is 01:00 on 4 November in Bangkok: the 3rd has just ended.
    expect(await closedBy('2026-11-03T18:00:00.000Z')).toBe('2026-11-03');
  });

  it('closes that same day a minute before midnight UTC, when Bangkok is nearly seven in the morning', async () => {
    expect(await closedBy('2026-11-03T23:59:00.000Z')).toBe('2026-11-03');
  });

  it('closes the day before while the day itself is still running in Bangkok', async () => {
    // 16:59 UTC on the 3rd is 23:59 on the 3rd in Bangkok: the 3rd has not ended, so the 2nd is closed.
    expect(await closedBy('2026-11-03T16:59:00.000Z')).toBe('2026-11-02');
  });

  it('follows the organisation’s own calendar, not Bangkok’s', async () => {
    // At 18:00 UTC it is still the 3rd in a UTC organisation, so the 2nd has just ended there.
    expect(await closedBy('2026-11-03T18:00:00.000Z', 'UTC')).toBe('2026-11-02');
  });

  it('crosses a month end and a year end', async () => {
    expect(await closedBy('2026-12-31T18:00:00.000Z')).toBe('2026-12-31');
    expect(await closedBy('2027-01-01T18:00:00.000Z')).toBe('2027-01-01');
    expect(await closedBy('2026-11-30T18:00:00.000Z')).toBe('2026-11-30');
  });
});
