// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import type { PermissionKey } from '../../core/security/permissions';
import { readScopeDepartments } from '../organization/role-grants';

interface CacheEntry {
  value: Omit<AuthenticatedUser, 'sessionId'>;
  expiresAt: number;
}

interface SessionEntry {
  userId: string;
  live: boolean;
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
  private static readonly SESSION_CACHE_LIMIT = 10_000;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly sessions = new Map<string, SessionEntry>();

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

    for (const grant of user.roles) {
      roles.push(grant.role.key);
      for (const permission of grant.role.permissions) {
        permissions.add(permission as PermissionKey);
      }
    }
    const scopedDepartmentIds = readScopeDepartments(
      user.roles.map((grant) => ({
        departmentId: grant.departmentId,
        permissions: grant.role.permissions,
      })),
    );

    const value: Omit<AuthenticatedUser, 'sessionId'> = {
      userId: user.id,
      organizationId: user.organizationId,
      employeeId: user.employee?.id ?? null,
      email: user.email,
      roles,
      permissions: [...permissions],
      scopedDepartmentIds,
    };

    this.cache.set(userId, { value, expiresAt: Date.now() + UserContextService.CACHE_TTL_MS });
    return value;
  }

  /**
   * Whether the session an access token was issued under is still in force.
   *
   * A session signed out, revoked from another device or ended by a password
   * change is not in force, and its access token stops working with it. A
   * session that moved on to a fresh refresh token (`ROTATED`) is still the same
   * sign-in, so the access token it issued keeps working for as long as that
   * sign-in does: while some session of the same family has not been ended.
   *
   * The answer is cached like the principal is, so a request does not add a
   * query. Whatever ends sessions calls `invalidate` for the user straight after,
   * so the next request reads the rows again.
   */
  async sessionIsLive(sessionId: string, userId: string): Promise<boolean> {
    const cached = this.sessions.get(sessionId);
    if (cached && cached.expiresAt > Date.now()) return cached.live;

    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { familyId: true, revokedAt: true, revokedReason: true },
    });
    let live = false;
    if (session && !session.revokedAt) {
      live = true;
    } else if (session?.revokedReason === 'ROTATED') {
      const current = await this.prisma.session.findFirst({
        where: { familyId: session.familyId, userId, revokedAt: null },
        select: { id: true },
      });
      live = current !== null;
    }

    if (this.sessions.size >= UserContextService.SESSION_CACHE_LIMIT) this.dropExpiredSessions();
    this.sessions.set(sessionId, {
      userId,
      live,
      expiresAt: Date.now() + UserContextService.CACHE_TTL_MS,
    });
    return live;
  }

  /** Call after any role/permission change, or any change to the user's sessions, so the next request sees it. */
  invalidate(userId: string): void {
    this.cache.delete(userId);
    for (const [sessionId, entry] of this.sessions) {
      if (entry.userId === userId) this.sessions.delete(sessionId);
    }
  }

  invalidateAll(): void {
    this.cache.clear();
    this.sessions.clear();
  }

  private dropExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, entry] of this.sessions) {
      if (entry.expiresAt <= now) this.sessions.delete(sessionId);
    }
    if (this.sessions.size >= UserContextService.SESSION_CACHE_LIMIT) this.sessions.clear();
  }
}
