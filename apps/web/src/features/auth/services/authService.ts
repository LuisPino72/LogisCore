import { type UserSession, AppError, Result, success, failure, EventBus, SystemEvents } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { initDb, setDbClosing, getDb, isDbReady, resetDbInstance } from '../../../services/dexie/db';
import { syncEngine } from '../../../services/sync/syncEngine';
import { syncQueue } from '../../../services/sync/syncQueue';
import type { SyncTableConfig } from '../../../services/sync/types';
import { logAuditEvent } from '../../../services/audit/auditService';
import { outboxProcessor } from '../../../services/outbox/outboxProcessor';
import { sessionGuard } from './sessionGuardService';
import { offlineGrace } from './offlineGraceService';

import { isValidRole } from '../types';
import { extractRole, extractRoleName, extractTenantId, extractPermissions, isJWTExpired } from '../../../lib/jwt';
export { extractRole, extractRoleName, extractTenantId, extractPermissions, decodeJWTPayload, isJWTExpired } from '../../../lib/jwt';

function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type RawSession = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

async function buildUserSession(
  session: NonNullable<RawSession>,
  opts: { signal?: AbortSignal } = {},
): Promise<UserSession> {
  const { signal } = opts;

  if (signal?.aborted) {
    throw new DOMException('buildUserSession aborted before start', 'AbortError');
  }

  const role = extractRole(session);
  const roleName = extractRoleName(session);
  const tenantUuid = extractTenantId(session);
  const permissions = extractPermissions(session);
  let tenantSlug: string | null = null;

  if (tenantUuid) {
    tenantSlug = await TenantTranslator.uuidToSlug(tenantUuid);
    if (signal?.aborted) {
      throw new DOMException('buildUserSession aborted after tenant slug resolve', 'AbortError');
    }
    initDb(tenantSlug);
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    role: role && isValidRole(role) ? role : 'employee',
    roleName,
    tenantId: tenantUuid,
    tenantSlug,
    accessToken: session.access_token,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    permissions,
  };
}

function mapSupabaseAuthError(error: { message: string; status?: number }): AppError {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) {
    return new AppError('AUTH_INVALID_CREDENTIALS', 'Credenciales inválidas. Verifica tu email y contraseña.');
  }
  if (msg.includes('email not confirmed')) {
    return new AppError('AUTH_EMAIL_NOT_CONFIRMED', 'Tu email no ha sido confirmado. Revisa tu bandeja de entrada.');
  }
  if (msg.includes('user not found')) {
    return new AppError('AUTH_USER_NOT_FOUND', 'No se encontró una cuenta con este email.');
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return new AppError('AUTH_RATE_LIMITED', 'Demasiados intentos. Espera un momento e intenta de nuevo.');
  }
  return new AppError('AUTH_LOGIN_FAILED', 'Credenciales inválidas. Verifica tu email y contraseña.');
}

export const authService = {
  buildUserSession,

  async bootstrapSession(): Promise<Result<UserSession | null, AppError>> {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return success(null);
    }

    if (isJWTExpired(session.access_token)) {
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
    // DISEÑO: Offline bypass session claim intencionalmente.
    // En offline no podemos verificar sesiones remotas. El usuario
    // opera con datos locales y la gracia offline (6h) limita el riesgo.
    // Al reconectarse, sessionGuard.claim() validará duplicados.
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
    role: role && isValidRole(role) ? role : 'employee',
        tenantId: tenantUuid,
        tenantSlug,
        accessToken: session.access_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
        permissions: extractPermissions(session) ?? (role === 'employee' ? ['pos:create', 'pos:read', 'customers:create', 'customers:read'] : undefined),
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

    const tenantUuidBootstrap = extractTenantId(session);
    if (tenantUuidBootstrap) {
      const tenantCheck = await authService.checkTenantActive(tenantUuidBootstrap);
      if (!tenantCheck.ok) {
        await supabase.auth.signOut();
        return tenantCheck;
      }
      const subCheck = await authService.checkSubscriptionActive(tenantUuidBootstrap);
      if (!subCheck.ok) return subCheck;
    }

    const userSession = await buildUserSession(session);

    if (userSession.tenantSlug) {
      offlineGrace.extend(userSession.tenantSlug);
    }

    // BACKLOG-106 [AUTH-002]: Migración retroactiva — employees preexistentes sin permissions
    // asignadas reciben permisos acotados al primer login post-migración.
    if (userSession.role === 'employee' && (!userSession.permissions || userSession.permissions.length === 0)) {
      return success({ ...userSession, permissions: ['pos:create', 'pos:read', 'customers:create', 'customers:read'] });
    }

    return success(userSession);
  },

  async login(email: string, password: string): Promise<Result<UserSession, AppError>> {
    const sanitizedEmail = sanitizeEmail(email);
    const { data, error } = await supabase.auth.signInWithPassword({ email: sanitizedEmail, password });

    if (error) {
      const authError = mapSupabaseAuthError(error);
      const reason = (
        authError.code === 'AUTH_INVALID_CREDENTIALS' ? 'invalid_credentials' :
        authError.code === 'AUTH_EMAIL_NOT_CONFIRMED' ? 'email_not_confirmed' :
        authError.code === 'AUTH_RATE_LIMITED' ? 'rate_limited' :
        'unknown'
      );
      await logAuditEvent({
        eventName: 'USER.LOGIN_FAILED',
        module: 'AUTH',
        userId: undefined,
        tenantUuid: null,
        payload: { email: sanitizedEmail, reason },
      });
      return failure(authError);
    }

    if (!data.session) {
      return failure(new AppError('AUTH_NO_SESSION', 'No se pudo iniciar sesión. Intenta de nuevo o contacta al administrador.'));
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
      let claimResult = await sessionGuard.claim(false);
      if (!claimResult.ok && claimResult.error.code === 'AUTH_SESSION_ACTIVE') {
        await sessionGuard.release();
        sessionGuard.generateSessionToken();
        claimResult = await sessionGuard.claim(false);
      }
      if (!claimResult.ok) {
        await supabase.auth.signOut({ scope: 'global' });
        return claimResult;
      }
    }

    const tenantUuidLogin = extractTenantId(data.session);
    if (tenantUuidLogin) {
      const tenantCheck = await authService.checkTenantActive(tenantUuidLogin);
      if (!tenantCheck.ok) {
        await supabase.auth.signOut({ scope: 'global' });
        return tenantCheck;
      }
      const subCheck = await authService.checkSubscriptionActive(tenantUuidLogin);
      if (!subCheck.ok) return subCheck;
    }

    const userSession = await buildUserSession(data.session);

    if (userSession.tenantSlug) {
      offlineGrace.extend(userSession.tenantSlug);
    }

    await logAuditEvent({
      eventName: 'USER.LOGIN',
      module: 'AUTH',
      userId: userSession.userId,
      tenantUuid: userSession.tenantId ?? null,
      payload: { email: sanitizedEmail, role: userSession.role, tenantSlug: userSession.tenantSlug },
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
      { name: 'expenses', type: 'transactional', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'product_presentations', type: 'catalog', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'purchase_order_items', type: 'transactional', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'recipes', type: 'catalog', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'recipe_lines', type: 'catalog', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'production_orders', type: 'transactional', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
      { name: 'customers', type: 'catalog', conflictStrategy: 'LWW', localIdField: 'id', remoteIdField: 'id' },
    ];
    allTables.forEach((cfg) => syncEngine.registerTable(cfg));
    syncEngine.start();
    // AUDIT-005: Start outbox processor (was dead code)
    outboxProcessor.start();
  },

  stopSync(): void {
    // AUDIT-005: Stop outbox processor alongside sync engine
    outboxProcessor.stop();
    syncEngine.stop();
  },

  async signOut(): Promise<Result<void, AppError>> {
    const { data: { session } } = await supabase.auth.getSession();
    const auditRole = session ? extractRole(session) : null;
    const isAdmin = auditRole === 'admin';

    if (session) {
      await logAuditEvent({
        eventName: 'USER.LOGOUT',
        module: 'AUTH',
        userId: session.user.id,
        tenantUuid: extractTenantId(session) ?? null,
        payload: { email: session.user.email ?? '' },
      });
    }

    if (!isAdmin) {
      await sessionGuard.release();
    }

    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch (err) {
      console.debug('[AuthService] signOut failed, retrying once after 500ms', err);
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (retryErr) {
        console.debug('[AuthService] signOut retry also failed, continuing best-effort', retryErr);
      }
    }

    this.stopSync();

    // 7. Flush de sync antes de cerrar DB local
    try {
      const pendingCount = await syncQueue.getPendingCount();
      if (pendingCount > 0) {
        await syncEngine.push();
      }
    } catch {
      // Si el flush falla, continuar con logout de todos modos
    }

    // 8. Pequeña pausa para que operaciones en vuelo terminen
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 9. Persistir favoritos a localStorage antes de cerrar DB
    try {
      const db = getDb();
      const favs = await db.productFavorites.toArray();
      const byTenant = new Map<string, string[]>();
      for (const f of favs) {
        const list = byTenant.get(f.tenantId) ?? [];
        list.push(f.productId);
        byTenant.set(f.tenantId, list);
      }
      for (const [tid, pids] of byTenant) {
        localStorage.setItem(`sasa-favorites-${tid}`, JSON.stringify(pids));
      }
    } catch {
      // Si la DB ya se está cerrando, ignoramos
    }

    // 10. Señalizar que la DB se cerrará (DESPUÉS de detener sync/Realtime)
    setDbClosing(true);

    // 11. Cerrar DB local SIN destruir — preservar datos offline para próximo login
    offlineGrace.clear();
    try {
      // Si el admin nunca entró a un tenant, Dexie no se inicializó.
      // isDbReady() evita el throw de getDb() en ese caso.
      if (isDbReady()) {
        const db = getDb();
        db.close();
      }
    } catch {
      // DB no inicializada o ya cerrándose — ignorar
    }
    // Resetear referencia para que initDb() cree una nueva instancia en el próximo login
    resetDbInstance();
    TenantTranslator.clearCache();
    EventBus.emit(SystemEvents.USER_LOGOUT);
    return success(undefined);
  },

  async refreshSession(): Promise<Result<UserSession | null, AppError>> {
    const { data: { session }, error } = await supabase.auth.refreshSession();

    if (error || !session) {
      return success(null);
    }

    const role = extractRole(session);
    if (!role) return success(null);

    const isAdmin = role === 'admin';

    if (!isAdmin) {
      sessionGuard.restoreSessionToken();
      const claimResult = await sessionGuard.claim(false);
      if (!claimResult.ok) {
        await supabase.auth.signOut();
        return success(null);
      }
    }

    const tenantUuidRefresh = extractTenantId(session);
    if (tenantUuidRefresh) {
      const tenantCheck = await authService.checkTenantActive(tenantUuidRefresh);
      if (!tenantCheck.ok) {
        await supabase.auth.signOut();
        return tenantCheck;
      }
      const subCheck = await authService.checkSubscriptionActive(tenantUuidRefresh);
      if (!subCheck.ok) return subCheck;
    }

    const userSession = await buildUserSession(session);

    if (userSession.tenantSlug) {
      offlineGrace.extend(userSession.tenantSlug);
    }

    return success(userSession);
  },

  async checkSubscriptionActive(tenantId: string): Promise<Result<void, AppError>> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, expires_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      return failure(new AppError('AUTH_SUBSCRIPTION_CHECK_FAILED', 'Error al verificar la suscripción. Intenta de nuevo.'));
    }
    if (!data) {
      return success(undefined);
    }

    if (data.status !== 'active' || new Date(data.expires_at) < new Date()) {
      return failure(new AppError(
        'AUTH_SUBSCRIPTION_EXPIRED',
        'Suscripción vencida. Llama al 0414-518-0265 para renovar.',
      ));
    }

    return success(undefined);
  },

  async checkTenantActive(tenantId: string): Promise<Result<void, AppError>> {
    const { data, error } = await supabase
      .from('tenants')
      .select('deleted_at')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      return failure(new AppError('AUTH_TENANT_CHECK_FAILED', 'Error al verificar el local. Intenta de nuevo.'));
    }
    if (!data) {
      return failure(new AppError('AUTH_TENANT_NOT_FOUND', 'Local no encontrado. Contacta al administrador.'));
    }
    if (data.deleted_at) {
      return failure(new AppError('AUTH_TENANT_DEACTIVATED', 'Este local ha sido desactivado. Contacta al administrador.'));
    }

    return success(undefined);
  },
};
