import { type Result, success, failure, AppError } from '@logiscore/core';
import { IVA_RATE, IGTF_RATE } from '@logiscore/shared';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { getDb, isDbReady } from '../../../services/dexie/db';
import type { DexieTenantSettings } from '../../../services/dexie/db';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';
import { isSameDayVzla } from '../../../lib/date';
import { SettingsErrors } from '../types/errors';
import type { FiscalSettings, OperationSettings, BusinessInfo, ChangePasswordInput } from '../types';
import { FiscalSettingsSchema, OperationSettingsSchema, UpdateBusinessInfoSchema, ChangePasswordSchema } from '../types';
import { useSettingsStore } from '../stores/settingsStore';

function toFiscalSettings(row: DexieTenantSettings): FiscalSettings {
  return {
    ivaRate: row.ivaRate,
    igtfRate: row.igtfRate,
    igtfEnabled: row.igtfEnabled,
  };
}

function toOperationSettings(row: DexieTenantSettings): OperationSettings {
  return {
    maxDiscountPct: row.maxDiscountPct,
    defaultMinStock: row.defaultMinStock,
    defaultCreditLimit: row.defaultCreditLimit,
    mandatoryCustomerId: row.mandatoryCustomerId,
    lowStockThreshold: row.lowStockThreshold,
    ticketFooterMessage: row.ticketFooterMessage,
  };
}

async function buildSettingsRow(tenantId: string, fiscal?: FiscalSettings, operations?: OperationSettings): Promise<DexieTenantSettings> {
  // Read existing row from Dexie first to avoid overwriting with stale store data
  let existing: DexieTenantSettings | undefined;
  if (isDbReady()) {
    try {
      const db = getDb();
      existing = await db.tenantSettings.get(tenantId);
    } catch { /* fall through */ }
  }
  const store = useSettingsStore.getState();
  return {
    tenantId,
    ivaRate: fiscal?.ivaRate ?? existing?.ivaRate ?? store.ivaRate,
    igtfRate: fiscal?.igtfRate ?? existing?.igtfRate ?? store.igtfRate,
    igtfEnabled: fiscal?.igtfEnabled ?? existing?.igtfEnabled ?? store.igtfEnabled,
    maxDiscountPct: operations?.maxDiscountPct ?? existing?.maxDiscountPct ?? store.maxDiscountPct,
    defaultMinStock: operations?.defaultMinStock ?? existing?.defaultMinStock ?? store.defaultMinStock,
    defaultCreditLimit: operations?.defaultCreditLimit ?? existing?.defaultCreditLimit ?? store.defaultCreditLimit,
    mandatoryCustomerId: operations?.mandatoryCustomerId ?? existing?.mandatoryCustomerId ?? store.mandatoryCustomerId,
    lowStockThreshold: operations?.lowStockThreshold ?? existing?.lowStockThreshold ?? store.lowStockThreshold,
    ticketFooterMessage: operations?.ticketFooterMessage ?? existing?.ticketFooterMessage ?? store.ticketFooterMessage,
    updatedAt: new Date().toISOString(),
  };
}

const MODULE_NAME = 'SETTINGS';

async function cacheSettings(data: DexieTenantSettings): Promise<void> {
  if (!isDbReady()) return;
  try {
    const db = getDb();
    await db.tenantSettings.put(data);
  } catch (err) {
    logger.warn(MODULE_NAME, 'cacheSettings: error escribiendo a Dexie (best-effort)', err);
  }
}

export const settingsService = {
  async getFiscalSettings(tenantId: string): Promise<Result<FiscalSettings, AppError>> {
    if (isDbReady()) {
      try {
        const db = getDb();
        const cached = await db.tenantSettings.get(tenantId);
        if (cached) return success(toFiscalSettings(cached));
      } catch { /* fall through */ }
    }

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('tenant_settings')
          .select('iva_rate, igtf_rate, igtf_enabled')
          .eq('tenant_id', tenantId)
          .single();

        if (!error && data) {
          const settings: FiscalSettings = {
            ivaRate: data.iva_rate as number,
            igtfRate: data.igtf_rate as number,
            igtfEnabled: data.igtf_enabled as boolean,
          };
          // Cache Supabase result in Dexie for offline use
          await cacheSettings({
            tenantId,
            ivaRate: settings.ivaRate,
            igtfRate: settings.igtfRate,
            igtfEnabled: settings.igtfEnabled,
            maxDiscountPct: 100,
            defaultMinStock: 5,
            defaultCreditLimit: 100,
            mandatoryCustomerId: false,
            lowStockThreshold: 5,
            ticketFooterMessage: '¡Gracias por su compra!',
            updatedAt: new Date().toISOString(),
          });
          return success(settings);
        }
      } catch { /* fall through */ }
    }

    return success({
      ivaRate: IVA_RATE,
      igtfRate: IGTF_RATE,
      igtfEnabled: IGTF_RATE > 0,
    });
  },

  async updateFiscalSettings(
    tenantId: string, userId: string, data: FiscalSettings,
  ): Promise<Result<void, AppError>> {
    const parsed = FiscalSettingsSchema.safeParse(data);
    if (!parsed.success) {
      return failure(new AppError('SETTINGS_VALIDATION_FAILED', parsed.error.issues[0]?.message || 'Datos fiscales inválidos'));
    }

    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'settings', 'manage')) {
      return failure(new AppError('SETTINGS_SCOPE_DENIED', SettingsErrors.SETTINGS_SCOPE_DENIED));
    }

    if (isDbReady()) {
      const db = getDb();
      const openSessionsToday = await db.cashRegisters
        .where({ tenantId, isOpen: true })
        .filter((r) => r.openedAt ? isSameDayVzla(new Date(r.openedAt), new Date()) : false)
        .count();

      if (openSessionsToday > 0) {
        return failure(new AppError('SETTINGS_FISCAL_BLOCKED', SettingsErrors.SETTINGS_FISCAL_BLOCKED));
      }
    }

    try {
      const db = getDb();
      const row = await buildSettingsRow(tenantId, parsed.data);

      await db.transaction('rw', [db.tenantSettings, db.outbox], async (tx) => {
        await db.tenantSettings.put(row);
        await outboxService.enqueue('SETTINGS.FISCAL.UPDATED', MODULE_NAME, {
          tenantId,
          ivaRate: parsed.data.ivaRate,
          igtfRate: parsed.data.igtfRate,
          igtfEnabled: parsed.data.igtfEnabled,
        }, tx);
      });

      useSettingsStore.getState().setFiscalSettings(parsed.data);
      useSettingsStore.getState().setLastUpdatedAt(Date.now());

      const tenantUuid = await TenantTranslator.slugToUuid(tenantId).catch(() => null);
      await logAuditEventOnly({
        eventName: 'SETTINGS.FISCAL.UPDATED',
        module: MODULE_NAME,
        payload: { tenantId, ivaRate: parsed.data.ivaRate, igtfRate: parsed.data.igtfRate, igtfEnabled: parsed.data.igtfEnabled },
        context: { userId, tenantId, tenantUuid: tenantUuid ?? undefined },
      });

      return success(undefined);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en updateFiscalSettings:', err);
      return failure(new AppError('SETTINGS_UPDATE_FAILED', SettingsErrors.SETTINGS_UPDATE_FAILED));
    }
  },

  async getOperationSettings(tenantId: string): Promise<Result<OperationSettings, AppError>> {
    if (isDbReady()) {
      try {
        const db = getDb();
        const cached = await db.tenantSettings.get(tenantId);
        if (cached) return success(toOperationSettings(cached));
      } catch { /* fall through */ }
    }

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('tenant_settings')
          .select('max_discount_pct, default_min_stock, default_credit_limit, mandatory_customer_id, low_stock_threshold, ticket_footer_message')
          .eq('tenant_id', tenantId)
          .single();

        if (!error && data) {
          const settings: OperationSettings = {
            maxDiscountPct: data.max_discount_pct as number,
            defaultMinStock: data.default_min_stock as number,
            defaultCreditLimit: data.default_credit_limit as number,
            mandatoryCustomerId: data.mandatory_customer_id as boolean,
            lowStockThreshold: data.low_stock_threshold as number,
            ticketFooterMessage: data.ticket_footer_message as string,
          };
          // Cache Supabase result in Dexie for offline use
          await cacheSettings({
            tenantId,
            ivaRate: IVA_RATE,
            igtfRate: IGTF_RATE,
            igtfEnabled: IGTF_RATE > 0,
            maxDiscountPct: settings.maxDiscountPct,
            defaultMinStock: settings.defaultMinStock,
            defaultCreditLimit: settings.defaultCreditLimit,
            mandatoryCustomerId: settings.mandatoryCustomerId,
            lowStockThreshold: settings.lowStockThreshold,
            ticketFooterMessage: settings.ticketFooterMessage,
            updatedAt: new Date().toISOString(),
          });
          return success(settings);
        }
      } catch { /* fall through */ }
    }

    return success({
      maxDiscountPct: 100,
      defaultMinStock: 5,
      defaultCreditLimit: 100,
      mandatoryCustomerId: false,
      lowStockThreshold: 5,
      ticketFooterMessage: '¡Gracias por su compra!',
    });
  },

  async updateOperationSettings(
    tenantId: string, userId: string, data: OperationSettings,
  ): Promise<Result<void, AppError>> {
    const parsed = OperationSettingsSchema.safeParse(data);
    if (!parsed.success) {
      return failure(new AppError('SETTINGS_VALIDATION_FAILED', parsed.error.issues[0]?.message || 'Datos de operación inválidos'));
    }

    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'settings', 'manage')) {
      return failure(new AppError('SETTINGS_SCOPE_DENIED', SettingsErrors.SETTINGS_SCOPE_DENIED));
    }

    try {
      const db = getDb();
      const row = await buildSettingsRow(tenantId, undefined, parsed.data);

      await db.transaction('rw', [db.tenantSettings, db.outbox], async (tx) => {
        await db.tenantSettings.put(row);
        await outboxService.enqueue('SETTINGS.OPERATIONS.UPDATED', MODULE_NAME, {
          tenantId,
          maxDiscountPct: parsed.data.maxDiscountPct,
          defaultMinStock: parsed.data.defaultMinStock,
          defaultCreditLimit: parsed.data.defaultCreditLimit,
          mandatoryCustomerId: parsed.data.mandatoryCustomerId,
          lowStockThreshold: parsed.data.lowStockThreshold,
          ticketFooterMessage: parsed.data.ticketFooterMessage,
        }, tx);
      });

      useSettingsStore.getState().setOperationSettings(parsed.data);
      useSettingsStore.getState().setLastUpdatedAt(Date.now());

      const tenantUuid = await TenantTranslator.slugToUuid(tenantId).catch(() => null);
      await logAuditEventOnly({
        eventName: 'SETTINGS.OPERATIONS.UPDATED',
        module: MODULE_NAME,
        payload: { tenantId, ...parsed.data },
        context: { userId, tenantId, tenantUuid: tenantUuid ?? undefined },
      });

      return success(undefined);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en updateOperationSettings:', err);
      return failure(new AppError('SETTINGS_UPDATE_FAILED', SettingsErrors.SETTINGS_UPDATE_FAILED));
    }
  },

  async loadTenantSettings(tenantId: string): Promise<Result<void, AppError>> {
    useSettingsStore.getState().setLoading(true);

    try {
      let row: DexieTenantSettings | null = null;

      if (isDbReady()) {
        const db = getDb();
        row = (await db.tenantSettings.get(tenantId)) ?? null;
      }

      if (!row && navigator.onLine) {
        const { data, error } = await supabase
          .from('tenant_settings')
          .select('*')
          .eq('tenant_id', tenantId)
          .single();

        if (!error && data) {
          row = {
            tenantId,
            ivaRate: data.iva_rate as number,
            igtfRate: data.igtf_rate as number,
            igtfEnabled: data.igtf_enabled as boolean,
            maxDiscountPct: data.max_discount_pct as number,
            defaultMinStock: data.default_min_stock as number,
            defaultCreditLimit: data.default_credit_limit as number,
            mandatoryCustomerId: data.mandatory_customer_id as boolean,
            lowStockThreshold: data.low_stock_threshold as number,
            ticketFooterMessage: data.ticket_footer_message as string,
            updatedAt: (data.updated_at as string) ?? new Date().toISOString(),
          };
          await cacheSettings(row);
        }
      }

      if (row) {
        // Guard: don't overwrite if a newer update happened while we were fetching
        const lastUpdate = useSettingsStore.getState().lastUpdatedAt;
        if (lastUpdate > 0) {
          const rowTime = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
          if (rowTime < lastUpdate) {
            // The store has a more recent update than what we fetched — skip overwrite
            useSettingsStore.getState().setLoaded(true);
            useSettingsStore.getState().setLoading(false);
            return success(undefined);
          }
        }

        useSettingsStore.getState().setFiscalSettings(toFiscalSettings(row));
        useSettingsStore.getState().setOperationSettings(toOperationSettings(row));
      }

      useSettingsStore.getState().setLoaded(true);
      useSettingsStore.getState().setLoading(false);
      return success(undefined);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en loadTenantSettings:', err);
      useSettingsStore.getState().setLoading(false);
      return failure(new AppError('SETTINGS_LOAD_FAILED', SettingsErrors.SETTINGS_LOAD_FAILED));
    }
  },

  async getBusinessInfo(tenantId: string): Promise<Result<BusinessInfo, AppError>> {
    if (isDbReady()) {
      try {
        const db = getDb();
        const ref = await db.tenantRefs.get(tenantId);
        if (ref) {
          return success({
            name: ref.name,
            rif: ref.rif ?? '',
            address: ref.direccion ?? '',
            phone: ref.telefono ?? '',
            logoUrl: ref.logoUrl ?? null,
          });
        }
      } catch { /* fall through */ }
    }

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('tenants')
          .select('name, rif, direccion, telefono, logo_url')
          .eq('id', tenantId)
          .is('deleted_at', null)
          .single();

        if (!error && data) {
          const info: BusinessInfo = {
            name: data.name as string,
            rif: (data.rif as string) ?? '',
            address: (data.direccion as string) ?? '',
            phone: (data.telefono as string) ?? '',
            logoUrl: (data.logo_url as string) ?? null,
          };
          return success(info);
        }
      } catch { /* fall through */ }
    }

    return failure(new AppError('SETTINGS_LOAD_FAILED', 'No se pudo cargar la información del negocio.'));
  },

  async updateBusinessInfo(
    tenantId: string, userId: string, data: Partial<BusinessInfo>,
  ): Promise<Result<void, AppError>> {
    const parsed = UpdateBusinessInfoSchema.safeParse(data);
    if (!parsed.success) {
      return failure(new AppError('SETTINGS_VALIDATION_FAILED', parsed.error.issues[0]?.message || 'Datos del negocio inválidos'));
    }

    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'settings', 'manage')) {
      return failure(new AppError('SETTINGS_SCOPE_DENIED', SettingsErrors.SETTINGS_SCOPE_DENIED));
    }

    try {
      const payload: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) payload.name = parsed.data.name;
      if (parsed.data.rif !== undefined) payload.rif = parsed.data.rif;
      if (parsed.data.address !== undefined) payload.direccion = parsed.data.address;
      if (parsed.data.phone !== undefined) payload.telefono = parsed.data.phone;
      if (parsed.data.logoUrl !== undefined) payload.logo_url = parsed.data.logoUrl;

      if (Object.keys(payload).length > 0) {
        const { error: updateError } = await supabase
          .from('tenants')
          .update(payload)
          .eq('id', tenantId);

        if (updateError) {
          return failure(new AppError('SETTINGS_UPDATE_FAILED', SettingsErrors.SETTINGS_UPDATE_FAILED));
        }
      }

      if (isDbReady()) {
        const db = getDb();
        const existing = await db.tenantRefs.get(tenantId);
        if (existing) {
          await db.tenantRefs.put({
            ...existing,
            name: parsed.data.name ?? existing.name,
            rif: parsed.data.rif ?? existing.rif,
            direccion: parsed.data.address ?? existing.direccion,
            telefono: parsed.data.phone ?? existing.telefono,
            logoUrl: parsed.data.logoUrl ?? existing.logoUrl,
          });
        }
      }

      const tenantUuid = await TenantTranslator.slugToUuid(tenantId).catch(() => null);
      await logAuditEventOnly({
        eventName: 'SETTINGS.BUSINESS.UPDATED',
        module: MODULE_NAME,
        payload: { tenantId, ...parsed.data },
        context: { userId, tenantId, tenantUuid: tenantUuid ?? undefined },
      });

      return success(undefined);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en updateBusinessInfo:', err);
      return failure(new AppError('SETTINGS_UPDATE_FAILED', SettingsErrors.SETTINGS_UPDATE_FAILED));
    }
  },

  async changePassword(userId: string, data: ChangePasswordInput): Promise<Result<void, AppError>> {
    const parsed = ChangePasswordSchema.safeParse(data);
    if (!parsed.success) {
      return failure(new AppError('SETTINGS_VALIDATION_FAILED', SettingsErrors.SETTINGS_PASSWORD_WEAK));
    }

    const session = useAuthStore.getState().session;
    if (!session?.email) {
      return failure(new AppError('SETTINGS_UPDATE_FAILED', 'No hay sesión activa'));
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: session.email,
      password: parsed.data.currentPassword,
    });

    if (signInError) {
      return failure(new AppError('SETTINGS_PASSWORD_INVALID', SettingsErrors.SETTINGS_PASSWORD_INVALID));
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.newPassword,
    });

    if (updateError) {
      return failure(new AppError('SETTINGS_UPDATE_FAILED', 'Error al cambiar la contraseña'));
    }

    // Refresh session to invalidate old token on other devices
    await supabase.auth.refreshSession();

    let tenantUuid: string | undefined;
    try {
      tenantUuid = await TenantTranslator.slugToUuid(session.tenantId ?? '');
    } catch {
      tenantUuid = undefined;
    }
    await logAuditEventOnly({
      eventName: 'USER.PASSWORD_CHANGED',
      module: MODULE_NAME,
      payload: { userId },
      context: { userId, tenantId: session.tenantId ?? undefined, tenantUuid },
    });

    return success(undefined);
  },

  async uploadBusinessLogo(tenantId: string, file: File): Promise<Result<string, AppError>> {
    const session = useAuthStore.getState().session;
    if (!session || !hasActionPermission(session, 'settings', 'manage')) {
      return failure(new AppError('SETTINGS_SCOPE_DENIED', SettingsErrors.SETTINGS_SCOPE_DENIED));
    }

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_SIZE = 2 * 1024 * 1024;

    if (!ALLOWED_TYPES.includes(file.type)) {
      return failure(new AppError('LOGO_INVALID_FORMAT', 'Formato no válido. Usa JPG, PNG o WebP.'));
    }
    if (file.size > MAX_SIZE) {
      return failure(new AppError('LOGO_TOO_LARGE', 'El logo debe ser menor a 2MB.'));
    }

    let token: string;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token ?? '';
      if (!token) {
        return failure(new AppError('LOGO_UPLOAD_FAILED', 'No hay sesión activa.'));
      }
    } catch {
      return failure(new AppError('LOGO_UPLOAD_FAILED', 'Error de autenticación.'));
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const filePath = `logos/${tenantUuid}.${ext}`;
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const storageUrl = `${SUPABASE_URL}/storage/v1/object/Products/${filePath}`;

    try {
      const buffer = await file.arrayBuffer();
      const res = await fetch(storageUrl, {
        method: 'PUT',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'content-type': file.type,
          'cache-control': '3600',
        },
        body: buffer,
      });

      if (!res.ok) {
        if (res.status === 413) {
          return failure(new AppError('LOGO_TOO_LARGE', 'El logo debe ser menor a 2MB.'));
        }
        return failure(new AppError('LOGO_UPLOAD_FAILED', 'Error al subir el logo. Verifica tu conexión.'));
      }
    } catch {
      return failure(new AppError('LOGO_UPLOAD_FAILED', 'Error de red al subir el logo.'));
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/Products/${filePath}`;

    const { error: updateError } = await supabase
      .from('tenants')
      .update({ logo_url: publicUrl })
      .eq('id', tenantId);

    if (updateError) {
      return failure(new AppError('LOGO_UPLOAD_FAILED', 'Logo subido pero no se pudo guardar la referencia.'));
    }

    if (isDbReady()) {
      const db = getDb();
      const existing = await db.tenantRefs.get(tenantId);
      if (existing) {
        await db.tenantRefs.put({ ...existing, logoUrl: publicUrl });
      }
    }

    return success(publicUrl);
  },
};
