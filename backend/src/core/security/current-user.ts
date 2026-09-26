// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PermissionKey } from './permissions';

/**
 * The authenticated principal, attached to `request.user` by JwtStrategy.
 * `employeeId` is null for accounts that are not on payroll (integrations,
 * auditors), which is why every self-service service checks it explicitly.
 */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  employeeId: string | null;
  email: string;
  roles: string[];
  permissions: PermissionKey[];
  /** Departments this user has a scoped role over; empty means org-wide. */
  scopedDepartmentIds: string[];
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
