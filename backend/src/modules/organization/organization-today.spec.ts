// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { organizationToday } from './organization-today';

describe("An organisation's today (CW-074)", () => {
  const prisma = (timezone: string) =>
    ({
      organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone }) },
    }) as unknown as Parameters<typeof organizationToday>[0];

  it('is the Bangkok day at 06:30 Bangkok time, while UTC is still on the day before', async () => {
    const today = await organizationToday(
      prisma('Asia/Bangkok'),
      'org-1',
      new Date('2026-09-30T23:30:00.000Z'),
    );
    expect(today.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it("follows the organisation's own timezone", async () => {
    const today = await organizationToday(
      prisma('America/New_York'),
      'org-1',
      new Date('2026-10-01T02:00:00.000Z'),
    );
    expect(today.toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });
});
