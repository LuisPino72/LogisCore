import { type UserSession, AppError } from '@logiscore/core';
import { supabase } from './supabase/client';
import { TenantTranslator } from './tenantTranslator';
import { initDb, destroyDb } from './dexie/db';
import { syncEngine } from './sync/syncEngine';

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
  const fromMetadata = session.user?.app_metadata?.role as string | undefined;
  if (fromMetadata) return fromMetadata;
  const decoded = decodeJWTPayload(session.access_token);
  return (decoded.role as string) ?? null;
}

function extractTenantId(session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']): string | null {
  if (!session) return null;
  const fromMetadata = session.user?.app_metadata?.tenant_id as string | undefined;
  if (fromMetadata) return fromMetadata;
  const decoded = decodeJWTPayload(session.access_token);
  return (decoded.tenant_id as string) ?? null;
}

export const authService = {
  async bootstrapSession(): Promise<UserSession | null> {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return null;
    }

    const role = extractRole(session);
    const tenantUuid = extractTenantId(session);

    if (!role) {
      throw new AppError(
        'AUTH_NO_ROLE',
        'No se encontró rol asignado. Contacta al administrador.',
        { details: { code: 'FORBIDDEN_NO_ROLE' } },
      );
    }

    let tenantSlug: string | null = null;

    if (tenantUuid) {
      tenantSlug = await TenantTranslator.uuidToSlug(tenantUuid);
      initDb(tenantSlug);
    }

    const userSession: UserSession = {
      userId: session.user.id,
      email: session.user.email ?? '',
      role: role as UserSession['role'],
      tenantId: tenantUuid,
      tenantSlug,
      accessToken: session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    };

    return userSession;
  },

  startSync(): void {
    syncEngine.start();
  },

  stopSync(): void {
    syncEngine.stop();
  },

  async signOut(): Promise<void> {
    this.stopSync();
    destroyDb();
    TenantTranslator.clearCache();
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
