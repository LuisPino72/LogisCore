import { type UserSession, AppError, Result, success, failure, EventBus, SystemEvents } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { initDb, destroyDb, setDbClosing } from '../../../services/dexie/db';
import { syncEngine } from '../../../services/sync/syncEngine';
import { syncQueue } from '../../../services/sync/syncQueue';
import type { SyncTableConfig } from '../../../services/sync/types';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';
import { sessionGuard } from './sessionGuardService';
import { offlineGrace } from './offlineGraceService';

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
  async bootstrapSession(): Promise<Result<UserSession | null, AppError>> {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return success(null);
    }

    const role = extractRole(session);

    if (!role) {
      return failure(
        new AppError(
          'AUTH_NO_ROLE',
          'No se encontró rol asignado. Contacta al administrador.',
          { details: { code: 'FORBIDDEN_NO_ROLE' } },
        ),
      );
    }

    const tenantUuid = extractTenantId(session);
    const isAdmin = role === 'admin';

    // --- Offline bootstrap dentro de gracia ---
    if (!navigator.onLine) {
      if (offlineGrace.isExpired()) {
        return failure(new AppError('OFFLINE_GRACE_EXPIRED', 'Tu período sin conexión expiró. Conecta a internet para continuar.'));
      }

      const tenantSlug = offlineGrace.getTenantSlug();
      if (tenantSlug) {
        initDb(tenantSlug);
      }
      return success({
        userId: session.user.id,
        email: session.user.email ?? '',
        role: role as UserSession['role'],
        tenantId: tenantUuid,
        tenantSlug,
        accessToken: session.access_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
      });
    }

    // --- Online normal flow ---
    if (!isAdmin) {
      sessionGuard.restoreSessionToken();
      const claimResult = await sessionGuard.claim(false);
      if (!claimResult.ok) {
        await supabase.auth.signOut();
        return success(null);
      }
    }

    const userSession = await buildUserSession(session);

    if (userSession.tenantSlug) {
      offlineGrace.extend(userSession.tenantSlug);
    }

    if (userSession.tenantId) {
      const subCheck = await authService.checkSubscriptionActive(userSession.tenantId);
      if (!subCheck.ok) return subCheck;
    }

    return success(userSession);
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

    const isAdmin = role === 'admin';

    if (!isAdmin) {
      sessionGuard.generateSessionToken();
      const claimResult = await sessionGuard.claim(false);
      if (!claimResult.ok) {
        await supabase.auth.signOut();
        return claimResult;
      }
    }

    const userSession = await buildUserSession(data.session);

    if (userSession.tenantSlug) {
      offlineGrace.extend(userSession.tenantSlug);
    }

    if (userSession.tenantId) {
      const subCheck = await authService.checkSubscriptionActive(userSession.tenantId);
      if (!subCheck.ok) return subCheck;
    }

    await emitWithAudit('USER.LOGIN', 'AUTH', { email, role: userSession.role, tenantSlug: userSession.tenantSlug }, {
      userId: userSession.userId,
      tenantUuid: userSession.tenantId ?? null,
    });

    return success(userSession);
  },

  startSync(): void {
    const allTables: SyncTableConfig[] = [
      { name: 'products', type: 'catalog', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'categories', type: 'catalog', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'inventory_movements', type: 'transactional', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'inventory_lots', type: 'transactional', conflictStrategy: 'REMOTE_WINS', localIdField: 'id', remoteIdField: 'id' },
      { name: 'suppliers', type: 'catalog', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'purchase_orders', type: 'transactional', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'sales', type: 'transactional', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'sale_items', type: 'transactional', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'cash_registers', type: 'transactional', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
    ];
    allTables.forEach((cfg) => syncEngine.registerTable(cfg));
    syncEngine.start();
  },

  stopSync(): void {
    syncEngine.stop();
  },

  async signOut(): Promise<Result<void, AppError>> {
    // 1. Emitir evento de navegación para limpiar UI inmediatamente
    EventBus.emit(SystemEvents.USER_LOGOUT);

    // 2. Obtener sesión para auditoría (directo, sin bootstrap para evitar re-claim)
    const { data: { session } } = await supabase.auth.getSession();
    const auditRole = session ? extractRole(session) : null;
    const isAdmin = auditRole === 'admin';

    // 3. Audit trail
    if (session) {
      await emitWithAudit('USER.LOGOUT', 'AUTH', { email: session.user.email ?? '' }, {
        userId: session.user.id,
        tenantUuid: extractTenantId(session) ?? null,
      });
    }

    // 4. Liberar sesión activa (admin exento)
    if (!isAdmin) {
      await sessionGuard.release();
    }

    // 5. Señalizar que la DB se cerrará para que servicios dejen de escribir
    setDbClosing(true);

    // 6. Flush de sync antes de destruir DB local
    this.stopSync();
    try {
      const pendingCount = await syncQueue.getPendingCount();
      if (pendingCount > 0) {
        await syncEngine.push();
      }
    } catch {
      // Si el flush falla, continuar con logout de todos modos
    }

    // 7. Pequeña pausa para que operaciones en vuelo terminen
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 8. Limpieza de infraestructura
    offlineGrace.clear();
    await destroyDb();
    TenantTranslator.clearCache();
    await supabase.auth.signOut({ scope: 'local' });
    return success(undefined);
  },

  async refreshSession(): Promise<Result<UserSession | null, AppError>> {
    const { data: { session }, error } = await supabase.auth.refreshSession();

    if (error || !session) {
      return success(null);
    }

    return this.bootstrapSession();
  },

  async checkSubscriptionActive(tenantId: string): Promise<Result<void, AppError>> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, expires_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !data) {
      return success(undefined);
    }

    if (data.status !== 'active' || new Date(data.expires_at) < new Date()) {
      return failure(new AppError(
        'AUTH_SUBSCRIPTION_EXPIRED',
        'Suscripción vencida. Contacta al 04145180265 para renovar.',
      ));
    }

    return success(undefined);
  },
};
