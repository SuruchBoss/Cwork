import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from './permissions';

export const IS_PUBLIC_KEY = 'cwork:isPublic';
export const PERMISSIONS_KEY = 'cwork:permissions';
export const PERMISSIONS_MODE_KEY = 'cwork:permissionsMode';

/** Opts a route out of authentication entirely (login, health, careers page). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Caller must hold **every** listed permission. */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Caller must hold **at least one** listed permission. Used where the same
 * endpoint serves an employee (`*:self`) and an HR user (`*:read`), with the
 * service narrowing the result set accordingly.
 */
export const RequireAnyPermission = (...permissions: PermissionKey[]) => {
  const set = SetMetadata(PERMISSIONS_KEY, permissions);
  const mode = SetMetadata(PERMISSIONS_MODE_KEY, 'any');
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    set(target, key as string, descriptor as PropertyDescriptor);
    mode(target, key as string, descriptor as PropertyDescriptor);
  };
};
