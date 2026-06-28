import type { UserSession as CoreUserSession } from '@logiscore/core';
import type { UserPermissionOverride } from '../../../specs/roles';
import { useAuthStore } from '../stores/authStore';

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

  const effectiveOverrides = overrides ?? useAuthStore.getState().userPermissionOverrides ?? [];

  const permission = `${module}:${action}`;
  const hasBase = session.permissions?.includes(permission) ?? false;

  if (effectiveOverrides.length === 0) return hasBase;

  const denyOverride = effectiveOverrides.find((o) => o.permission === permission && o.effect === 'deny' && !o.deletedAt);
  if (denyOverride) return false;

  const allowOverride = effectiveOverrides.find((o) => o.permission === permission && o.effect === 'allow' && !o.deletedAt);
  if (allowOverride) return true;

  return hasBase;
}
