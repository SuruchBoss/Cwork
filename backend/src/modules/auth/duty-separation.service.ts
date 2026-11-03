// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { PermissionKey } from '../../core/security/permissions';

/** Who else could act, for the rule that nobody decides their own record. */
@Injectable()
export class DutySeparationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whether an active account other than `actorUserId` holds `permission` over a
   * record in `departmentId`: through a role not limited to a department, or
   * limited to that department, and not expired.
   */
  async anotherHolderExists(
    organizationId: string,
    permission: PermissionKey,
    actorUserId: string,
    departmentId: string | null,
  ): Promise<boolean> {
    const now = new Date();
    const count = await this.prisma.user.count({
      where: {
        organizationId,
        id: { not: actorUserId },
        deletedAt: null,
        status: UserStatus.ACTIVE,
        roles: {
          some: {
            role: { permissions: { has: permission } },
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
              {
                OR: [{ departmentId: null }, ...(departmentId ? [{ departmentId }] : [])],
              },
            ],
          },
        },
      },
    });
    return count > 0;
  }
}
