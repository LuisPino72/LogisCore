/**
 * BACKLOG-106 [AUTH-002]: roleGuard síncrono
 *
 * Lee `useAuthStore.getState().session?.role` (ya validado en bootstrapSession)
 * y lanza AppError(AUTH_SCOPE_DENIED) si el rol no está en los permitidos.
 *
 * Es SÍNCRONO intencionalmente: el rol ya está en el store desde bootstrap,
 * no se necesita round-trip a Supabase.auth.getSession() (que sería redundante
 * y bloquearía la UI).
 *
 * Lanza throw (no retorna Result) por consistencia con las transacciones
 * Dexie que usan throw para forzar rollback dentro de db.transaction().
 */
import { AppError } from '@logiscore/core';
import { useAuthStore } from '../stores/authStore';
import { AuthErrors } from '../../../specs/auth/errors';
import type { UserRole } from '../types';

export function requireRole(...allowedRoles: UserRole[]): void {
  const session = useAuthStore.getState().session;
  const role = session?.role;

  if (!role || !allowedRoles.includes(role)) {
    throw new AppError(
      AuthErrors.AUTH_SCOPE_DENIED,
      `Acción restringida. Roles permitidos: [${allowedRoles.join(', ')}].`,
      { details: { code: 'AUTH_SCOPE_DENIED', currentRole: role ?? null, allowedRoles } },
    );
  }
}
