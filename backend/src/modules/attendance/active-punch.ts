// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { Prisma } from '@prisma/client';

/**
 * Punches that still count (CW-061).
 *
 * `attendance_punches` is append-only, so a punch imported from a fingerprint
 * scanner cannot be removed when HR later decides the day another way. It is
 * marked on its `ScannerPunchLink` instead, and every reader of the punch stream
 * that works out a day leaves such a punch out. A punch with no link, which is
 * every punch that did not come from a scanner, always counts.
 */
export const ACTIVE_PUNCH: Prisma.AttendancePunchWhereInput = {
  NOT: { scannerLink: { supersededAt: { not: null } } },
};
