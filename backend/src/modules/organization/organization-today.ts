// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { PrismaService } from '../../core/prisma/prisma.service';
import { workDateFor } from '../../core/utils/date.util';

/**
 * Today's calendar day where the organisation is (CW-074): by its timezone,
 * the rule `workDateFor` applies to a punch. The UTC date is a day behind in
 * Bangkok until 07:00, which dated certificates and counted leave notice from
 * yesterday. A plain function, so a service can ask without depending on the
 * organisation module.
 */
export async function organizationToday(
  prisma: Pick<PrismaService, 'organization'>,
  organizationId: string,
  now: Date = new Date(),
): Promise<Date> {
  const { timezone } = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return workDateFor(now, timezone);
}
