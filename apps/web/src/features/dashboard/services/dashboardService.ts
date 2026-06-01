import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { getDb, isDbReady, type DexieTenantRef } from '../../../services/dexie/db';
import { DashboardErrors } from '../../../specs/dashboard/errors';
import { ValidateDashboardTenantSchema, TenantInfoSchema, SubscriptionInfoSchema } from '../../../specs/dashboard/index';
import type { TenantInfoResponse, SubscriptionResponse } from '../types';
import { startOfDayVzla, startOfNextDayVzla } from '../../../lib/date';
import type { Product } from '../../../specs/inventory';
import { inventoryService } from '../../inventory/services/inventoryService';

const CACHE_SUB_KEY = 'logiscore_cached_subscription';
const CACHE_EMP_KEY = 'logiscore_cached_employee_count';

function calcItemCost(quantity: number, costUsdPerUnit: number | undefined): number {
  if (!costUsdPerUnit || costUsdPerUnit <= 0) return 0;
  return quantity * costUsdPerUnit;
}

async function cacheTenantInfo(tenantId: string, info: TenantInfoResponse): Promise<void> {
  if (!isDbReady()) return;
  try {
    const db = getDb();
    const existing = await db.tenantRefs.get(tenantId);
    const ref: DexieTenantRef = {
      id: tenantId,
      slug: info.slug,
      name: info.name,
      rif: info.rif,
    };
    if (existing?.name) ref.name = existing.name;
    await db.tenantRefs.put(ref);
  } catch { /* best-effort */ }
}

async function readCachedTenantInfo(tenantId: string): Promise<TenantInfoResponse | null> {
  if (!isDbReady()) return null;
  try {
    const db = getDb();
    const ref = await db.tenantRefs.get(tenantId);
    if (ref) {
      return { name: ref.name, slug: ref.slug, rif: ref.rif ?? '' };
    }
  } catch { /* best-effort */ }
  return null;
}

function readCachedSubscription(): SubscriptionResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_SUB_KEY);
    if (raw) return JSON.parse(raw) as SubscriptionResponse;
  } catch { /* ignore */ }
  return null;
}

function readCachedEmployeeCount(): number | null {
  try {
    const raw = localStorage.getItem(CACHE_EMP_KEY);
    if (raw !== null) return Number(raw);
  } catch { /* ignore */ }
  return null;
}

export const dashboardService = {
  async getTenantInfo(tenantId: string): Promise<Result<TenantInfoResponse | null, AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.TENANT_INFO_FAILED, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const { data, error } = await supabase
      .from('tenants')
      .select('name, slug, rif')
      .eq('id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!error && data) {
      const parsed = TenantInfoSchema.safeParse(data);
      if (parsed.success) {
        await cacheTenantInfo(tenantId, parsed.data);
        return success(parsed.data);
      }
      await cacheTenantInfo(tenantId, data);
      return success(data);
    }

    const cached = await readCachedTenantInfo(tenantId);
    if (cached) return success(cached);

    if (!navigator.onLine) return success(null);
    return failure(new AppError(DashboardErrors.TENANT_INFO_FAILED, 'Error al cargar información del negocio'));
  },

  async getSubscriptionInfo(tenantId: string): Promise<Result<SubscriptionResponse | null, AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.SUBSCRIPTION_INFO_FAILED, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('tenant_id', tenantId)
      .single();

    if (!error && data) {
      const parsed = SubscriptionInfoSchema.safeParse(data);
      if (parsed.success) {
        localStorage.setItem(CACHE_SUB_KEY, JSON.stringify(parsed.data));
        return success(parsed.data);
      }
      localStorage.setItem(CACHE_SUB_KEY, JSON.stringify(data));
      return success(data);
    }

    const cached = readCachedSubscription();
    if (cached) return success(cached);

    if (!navigator.onLine) return success(null);
    return failure(new AppError(DashboardErrors.SUBSCRIPTION_INFO_FAILED, 'Error al cargar suscripción'));
  },

  async getEmployeeCount(tenantId: string): Promise<Result<number, AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.EMPLOYEES_LOAD_FAILED, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const { count, error } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'employee')
      .is('deleted_at', null);

    if (!error) {
      localStorage.setItem(CACHE_EMP_KEY, String(count ?? 0));
      return success(count ?? 0);
    }

    const cached = readCachedEmployeeCount();
    if (cached !== null) return success(cached);

    if (!navigator.onLine) return success(0);
    return failure(new AppError(DashboardErrors.EMPLOYEES_LOAD_FAILED, 'Error al cargar empleados'));
  },

  async getLowStockProducts(tenantId: string): Promise<Result<Product[], AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.DASHBOARD_LOAD_FAILED, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    return inventoryService.getLowStockProducts(tenantId);
  },

  async getTopProducts(tenantId: string, limit = 5): Promise<Result<{ productId: string; name: string; totalQty: number }[], AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.DASHBOARD_LOAD_FAILED, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    if (!navigator.onLine) return success([]);
    try {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

      const { data, error } = await supabase
        .from('sale_items')
        .select('product_id, product_name, quantity')
        .eq('tenant_id', tenantUuid)
        .is('deleted_at', null)
        .limit(10000);

      if (error) {
        return failure(new AppError('DASHBOARD_TOP_PRODUCTS_FAILED', 'Error al cargar productos más vendidos'));
      }

      if (!data || data.length === 0) {
        return success([]);
      }

      const agg = new Map<string, { name: string; totalQty: number }>();
      for (const row of data) {
        const id = row.product_id as string;
        const existing = agg.get(id);
        if (existing) {
          existing.totalQty += Number(row.quantity);
        } else {
          agg.set(id, { name: row.product_name as string, totalQty: Number(row.quantity) });
        }
      }

      const sorted = Array.from(agg.entries())
        .map(([productId, { name, totalQty }]) => ({ productId, name, totalQty }))
        .sort((a, b) => b.totalQty - a.totalQty)
        .slice(0, limit);

      return success(sorted);
    } catch (err) {
      logger.error('Dashboard', 'Error en getTopProducts:', err);
      return failure(new AppError('DASHBOARD_TOP_PRODUCTS_FAILED', 'Error al cargar productos más vendidos'));
    }
  },

  async getTodayEarnings(tenantId: string): Promise<Result<number, AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.DASHBOARD_LOAD_FAILED, tenantCheck.error.issues[0]?.message || 'Tenant inválido.'));
    }
    try {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const startOfDay = startOfDayVzla();
      const endOfDay = startOfNextDayVzla();

      // Intentamos primero Dexie para rapidez offline
      const db = getDb();
      const localSales = await db.sales
        .where('[tenantId+createdAt]')
        .between([tenantId, startOfDay], [tenantId, endOfDay])
        .filter((s) => !s.deletedAt && s.status === 'completed' && !s.voidedAt)
        .toArray();

      if (localSales.length > 0) {
        const saleIds = [...new Set(localSales.map((s) => s.id))];
        const items = saleIds.length > 0
          ? await db.saleItems.where('saleId').anyOf(saleIds).toArray()
          : [];

        let totalEarnings = 0;
        for (const item of items) {
          const revenue = item.totalPriceUsd;
          const cost = calcItemCost(item.quantity, item.costUsdPerUnit);
          totalEarnings += revenue - cost;
        }
        return success(preciseRound(totalEarnings, 2));
      }

      // Fallback a Supabase si Dexie está vacío (recuperar datos de sesión anterior)
      const { data: cloudSales, error: cloudError } = await supabase
        .from('sales')
        .select('id, total_bs, igtf_bs, exchange_rate, created_at')
        .eq('tenant_id', tenantUuid)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .gte('created_at', startOfDay)
        .lt('created_at', endOfDay);

      if (cloudError || !cloudSales || cloudSales.length === 0) return success(0);

      const saleIdsCloud = cloudSales.map((s) => s.id);
      const { data: cloudItems, error: itemsError } = await supabase
        .from('sale_items')
        .select('sale_id, quantity, unit_price_usd, cost_usd_per_unit')
        .eq('tenant_id', tenantUuid)
        .in('sale_id', saleIdsCloud);

      if (itemsError || !cloudItems) return success(0);

      interface CloudSaleItem { sale_id: string; quantity: number; unit_price_usd: number; cost_usd_per_unit: number | null }
      const itemsMap = new Map<string, CloudSaleItem[]>();
      for (const item of cloudItems) {
        const sId = item.sale_id;
        if (!itemsMap.has(sId)) itemsMap.set(sId, []);
        itemsMap.get(sId)!.push(item);
      }

      let totalEarningsCloud = 0;
      for (const sale of cloudSales) {
        const items = itemsMap.get(sale.id) ?? [];
        for (const item of items) {
          const revenue = item.unit_price_usd * item.quantity;
          const cost = (item.cost_usd_per_unit ?? 0) * item.quantity;
          totalEarningsCloud += (revenue - cost);
        }
      }

      return success(preciseRound(totalEarningsCloud, 2));
    } catch (err) {
      logger.error('Dashboard', 'Error en getTodayEarnings:', err);
      return failure(new AppError('DASHBOARD_TODAY_EARNINGS_FAILED', 'Error al calcular ganancias del día'));
    }
  },
};
