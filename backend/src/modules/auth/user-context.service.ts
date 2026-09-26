// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import type { PermissionKey } from '../../core/security/permissions';

interface CacheEntry {
  value: Omit<AuthenticatedUser, 'sessionId'>;
  expiresAt: number;
}

/**
 * Resolves the principal for a request.
 *
 * Roles and permissions are read from the database rather than embedded in the
 * access token, so revoking a role takes effect within `CACHE_TTL_MS` instead of
 * waiting for the token to expire. A tiny in-process cache keeps this off the
 * hot path; it is intentionally short-lived and per-instance.
 */
@Injectable()
export class UserContextService {
  private static readonly CACHE_TTL_MS = 30_000;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string): Promise<Omit<AuthenticatedUser, 'sessionId'>> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        employee: { select: { id: true } },
        roles: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          include: { role: { select: { key: true, permissions: true } } },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Account no longer exists');
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    const permissions = new Set<PermissionKey>();
    const roles: string[] = [];
    const scopedDepartmentIds = new Set<string>();

    for (const grant of user.roles) {
      roles.push(grant.role.key);
      for (const permission of grant.role.permissions) {
        permissions.add(permission as PermissionKey);
      }
      if (grant.departmentId) scopedDepartmentIds.add(grant.departmentId);
    }

    const value: Omit<AuthenticatedUser, 'sessionId'> = {
      userId: user.id,
      organizationId: user.organizationId,
      employeeId: user.employee?.id ?? null,
      email: user.email,
      roles,
      permissions: [...permissions],
      scopedDepartmentIds: [...scopedDepartmentIds],
    };

    this.cache.set(userId, { value, expiresAt: Date.now() + UserContextService.CACHE_TTL_MS });
    return value;
  }

  /** Call after any role/permission change so the next request sees it. */
  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
