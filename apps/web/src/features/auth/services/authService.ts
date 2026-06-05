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

import { extractRole, extractTenantId, isJWTExpired } from '../../../lib/jwt';
export { extractRole, extractTenantId, decodeJWTPayload, isJWTExpired } from '../../../lib/jwt';

function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
        role: role as UserSession['role'],
        tenantId: tenantUuid,
        tenantSlug,
        accessToken: session.access_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
        // BACKLOG-106 [AUTH-002]: Migración retroactiva — employees preexistentes reciben POS-only.
        permissions: role === 'employee' ? ['pos'] : undefined,
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

    // BACKLOG-106 [AUTH-002]: Migración retroactiva — employees preexistentes sin permissions
    // asignadas reciben POS-only al primer login post-migración.
    if (userSession.role === 'employee' && !userSession.permissions) {
      return success({ ...userSession, permissions: ['pos'] });
    }

    return success(userSession);
  },

  async login(email: string, password: string): Promise<Result<UserSession, AppError>> {
    const sanitizedEmail = sanitizeEmail(email);
    const { data, error } = await supabase.auth.signInWithPassword({ email: sanitizedEmail, password });

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
      let claimResult = await sessionGuard.claim(false);
      // BUGFIX-LOGOUT-004: Si el claim falla con SESSION_ALREADY_ACTIVE,
      // es probable que haya una fila zombie en active_sessions del signOut
      // anterior (cuando el RPC release falló o no completó). Forzamos un
      // release y reintentamos el claim una vez antes de abortar.
      if (!claimResult.ok && claimResult.error.code === 'AUTH_SESSION_ACTIVE') {
        await sessionGuard.release();
        sessionGuard.generateSessionToken();
        claimResult = await sessionGuard.claim(false);
      }
      if (!claimResult.ok) {
        // BUGFIX-LOGOUT-005: signOut con scope 'global' explícito para
        // limpiar tokens en servidor, no solo cookies locales.
        await supabase.auth.signOut({ scope: 'global' });
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

    // 5. Detener sync y Realtime PRIMERO (antes de cerrar DB)
    this.stopSync();

    // 6. Flush de sync antes de cerrar DB local
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

    // 8. Persistir favoritos a localStorage antes de cerrar DB
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

    // 9. Señalizar que la DB se cerrará (DESPUÉS de detener sync/Realtime)
    setDbClosing(true);

    // 10. Cerrar DB local SIN destruir — preservar datos offline para próximo login
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
    // BUGFIX-LOGOUT-002: scope 'global' en vez de 'local' para invalidar
    // el refresh token en el servidor. Con 'local', el token zombie queda
    // vivo en Supabase y el próximo login rebota con "esa cuenta está
    // iniciada". Con 'global' se cierran TODAS las sesiones del usuario.
    await supabase.auth.signOut({ scope: 'global' });
    // BUGFIX-LOGOUT-001: emitir USER_LOGOUT al EventBus directamente.
    // El emitWithAudit de arriba encola en outbox, pero stopSync() ya mató
    // el outboxProcessor que lo procesa. Sin esta emisión, el listener de
    // App.tsx:389 nunca dispara clearSession() y la UI queda zombie.
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

  async checkSubscriptionActive(tenantId: string): Promise<Result<void, AppError>> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, expires_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      return failure(new AppError('AUTH_SUBSCRIPTION_CHECK_FAILED', 'Error al verificar suscripción.'));
    }
    if (!data) {
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
