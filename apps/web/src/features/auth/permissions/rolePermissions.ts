import type { UserSession as CoreUserSession } from '@logiscore/core';
import type { UserPermissionOverride } from '../../../specs/roles';

type SessionLike = { role?: string | null; permissions?: string[]; userId?: string } | CoreUserSession | null | undefined;

export function hasPermission(session: SessionLike, module: string): boolean {
  if (!session) return false;
  if (session.role === 'admin' || session.role === 'owner') return true;
  if (!session.permissions || session.permissions.length === 0) return false;
  return session.permissions.some((p) => p.startsWith(`${module}:`));
}

export function hasActionPermission(
  session: SessionLike,
  module: string,
  action: string,
  overrides?: UserPermissionOverride[],
): boolean {
  if (!session) return false;
  if (session.role === 'admin' || session.role === 'owner') return true;

  const permission = `${module}:${action}`;
  const hasBase = session.permissions?.includes(permission) ?? false;

  if (!overrides || overrides.length === 0) return hasBase;

  const denyOverride = overrides.find((o) => o.permission === permission && o.effect === 'deny');
  if (denyOverride) return false;

  const allowOverride = overrides.find((o) => o.permission === permission && o.effect === 'allow');
  if (allowOverride) return true;

  return hasBase;
}
