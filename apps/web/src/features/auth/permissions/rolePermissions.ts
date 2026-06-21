import type { UserSession as CoreUserSession } from '@logiscore/core';

type SessionLike = { role?: string | null; permissions?: string[] } | CoreUserSession | null | undefined;

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
): boolean {
  if (!session) return false;
  if (session.role === 'admin' || session.role === 'owner') return true;
  if (!session.permissions || session.permissions.length === 0) return false;
  return session.permissions.includes(`${module}:${action}`);
}
