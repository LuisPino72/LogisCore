import { type UserSession, AppError, Result, success, failure } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { initDb, destroyDb } from '../../../services/dexie/db';
import { syncEngine } from '../../../services/sync/syncEngine';
import { EventBus, SystemEvents } from '@logiscore/core';
import { emitWithAudit } from '../../../lib/emitWithAudit';
import { useNavigationStore } from '../../../stores/navigationStore';
import { usePermissionStore } from '../../../stores/permissionStore';
import { useAuthStore } from '../stores/authStore';

function decodeJWTPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function extractRole(session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']): string | null {
  if (!session) return null;
  // Session.app_metadata es raw_app_meta_data de auth.users (NO tiene role del hook)
  // El hook inyecta role en el JWT claims.app_metadata
  const decoded = decodeJWTPayload(session.access_token);
  const jwtAppMeta = decoded.app_metadata as Record<string, unknown> | undefined;
  const jwtRole = jwtAppMeta?.role as string | undefined;
  if (jwtRole) return jwtRole;
  return (decoded.role as string) ?? null;
}

function extractTenantId(session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']): string | null {
  if (!session) return null;
  const decoded = decodeJWTPayload(session.access_token);
  const jwtAppMeta = decoded.app_metadata as Record<string, unknown> | undefined;
  const jwtTenantId = jwtAppMeta?.tenant_id as string | undefined;
  if (jwtTenantId) return jwtTenantId;
  return (decoded.tenant_id as string) ?? null;
}

type RawSession = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

async function buildUserSession(session: NonNullable<RawSession>): Promise<UserSession> {
  const role = extractRole(session);
  const tenantUuid = extractTenantId(session);
  let tenantSlug: string | null = null;

  if (tenantUuid) {
    tenantSlug = await TenantTranslator.uuidToSlug(tenantUuid);
    initDb(tenantSlug);
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    role: role as UserSession['role'],
    tenantId: tenantUuid,
    tenantSlug,
    accessToken: session.access_token,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
  };
}

function mapSupabaseAuthError(error: { message: string; status?: number }): AppError {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) {
    return new AppError('AUTH_INVALID_CREDENTIALS', 'Credenciales incorrectas. Verifica tu email y contraseña.');
  }
  if (msg.includes('email not confirmed')) {
    return new AppError('AUTH_EMAIL_NOT_CONFIRMED', 'Este email no ha sido confirmado.');
  }
  if (msg.includes('user not found')) {
    return new AppError('AUTH_USER_NOT_FOUND', 'Este email no está registrado.');
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return new AppError('AUTH_RATE_LIMITED', 'Demasiados intentos. Espera un momento e intenta de nuevo.');
  }
  return new AppError('AUTH_LOGIN_FAILED', 'Error al iniciar sesión. Verifica tu conexión e intenta de nuevo.');
}

export const authService = {
  async bootstrapSession(): Promise<UserSession | null> {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return null;
    }

    const role = extractRole(session);

    if (!role) {
      throw new AppError(
        'AUTH_NO_ROLE',
        'No se encontró rol asignado. Contacta al administrador.',
        { details: { code: 'FORBIDDEN_NO_ROLE' } },
      );
    }

    const userSession = buildUserSession(session);
    return userSession;
  },

  async login(email: string, password: string): Promise<Result<UserSession, AppError>> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return failure(mapSupabaseAuthError(error));
    }

    if (!data.session) {
      return failure(new AppError('AUTH_NO_SESSION', 'No se pudo iniciar sesión.'));
    }

    const role = extractRole(data.session);

    if (!role) {
      return failure(
        new AppError('AUTH_NO_ROLE', 'No se encontró rol asignado. Contacta al administrador.'),
      );
    }

    const userSession = await buildUserSession(data.session);

    EventBus.emit(SystemEvents.USER_LOGIN, { email, role: userSession.role, tenantSlug: userSession.tenantSlug });
    await emitWithAudit('USER.LOGIN', 'AUTH', { email, role: userSession.role, tenantSlug: userSession.tenantSlug }, {
      userId: userSession.userId,
      tenantUuid: userSession.tenantId ?? null,
    });

    return success(userSession);
  },

  startSync(): void {
    syncEngine.start();
  },

  stopSync(): void {
    syncEngine.stop();
  },

  async signOut(): Promise<void> {
    const currentSession = await this.bootstrapSession();

    // Emitir auditoría ANTES de limpiar la sesión (necesita JWT válido para audit_trail)
    if (currentSession) {
      EventBus.emit(SystemEvents.USER_LOGOUT, { email: currentSession.email });
      await emitWithAudit('USER.LOGOUT', 'AUTH', { email: currentSession.email }, {
        userId: currentSession.userId,
        tenantUuid: currentSession.tenantId ?? null,
      }).catch(() => {});
    }

    this.stopSync();
    destroyDb();
    TenantTranslator.clearCache();
    useNavigationStore.getState().setView('login');
    usePermissionStore.getState().clear();
    useAuthStore.getState().clearSession();
    await supabase.auth.signOut();
  },

  async refreshSession(): Promise<UserSession | null> {
    const { data: { session }, error } = await supabase.auth.refreshSession();

    if (error || !session) {
      return null;
    }

    return this.bootstrapSession();
  },
};
