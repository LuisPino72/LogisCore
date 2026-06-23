import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { getDb, isDbReady, type DexieTenantRef } from '../../../services/dexie/db';
import { DashboardErrors } from '../../../specs/dashboard/errors';
import { ValidateDashboardTenantSchema, TenantInfoSchema, SubscriptionInfoSchema } from '../../../specs/dashboard/index';
import type { TenantInfoResponse, SubscriptionResponse, PendingTask } from '../types';
import { startOfDayVzla, startOfNextDayVzla } from '../../../lib/date';
import type { Product } from '../../../specs/inventory';
import { inventoryService } from '../../inventory/services/inventoryService';
import { createPersistentCache } from '../../../lib/cache';

const CACHE_SUB_KEY = (tenantId: string) => `logiscore_cached_subscription:${tenantId}`;
const CACHE_EMP_KEY = (tenantId: string) => `logiscore_cached_employee_count:${tenantId}`;

function calcItemCost(quantity: number, costUsdPerUnit: number | undefined, unitMultiplier: number = 1): number {
  if (!costUsdPerUnit || costUsdPerUnit <= 0) return 0;
  return quantity * unitMultiplier * costUsdPerUnit;
}

const tenantInfoCache = createPersistentCache<DexieTenantRef>({ tableName: 'tenantRefs' });

async function cacheTenantInfo(tenantId: string, info: TenantInfoResponse): Promise<void> {
  const ref: DexieTenantRef = {
    id: tenantId,
    slug: info.slug,
    name: info.name,
    rif: info.rif,
    direccion: info.direccion,
    telefono: info.telefono,
    logoUrl: info.logoUrl,
  };
  await tenantInfoCache.set(tenantId, ref);
}

async function readCachedTenantInfo(tenantId: string): Promise<TenantInfoResponse | null> {
  const ref = await tenantInfoCache.get(tenantId);
  if (ref) {
    return {
      name: ref.name,
      slug: ref.slug,
      rif: ref.rif ?? '',
      direccion: ref.direccion,
      telefono: ref.telefono,
      logoUrl: ref.logoUrl,
    };
  }
  return null;
}

function readCachedSubscription(tenantId: string): SubscriptionResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_SUB_KEY(tenantId));
    if (raw) return JSON.parse(raw) as SubscriptionResponse;
  } catch {
    console.debug('[DashboardService] localStorage read failed — non-critical');
  }
  return null;
}

function readCachedEmployeeCount(tenantId: string): number | null {
  try {
    const raw = localStorage.getItem(CACHE_EMP_KEY(tenantId));
    if (raw !== null) return Number(raw);
  } catch {
    console.debug('[DashboardService] localStorage read failed — non-critical');
  }
  return null;
}

export const dashboardService = {
  async getTenantInfo(tenantId: string): Promise<Result<TenantInfoResponse | null, AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.TENANT_INFO_FAILED, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
    }
    const { data, error } = await supabase
      .from('tenants')
      .select('name, slug, rif, direccion, telefono, logo_url')
      .eq('id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!error && data) {
      const mapped = {
        ...data,
        logoUrl: data.logo_url ?? undefined,
      };
      const parsed = TenantInfoSchema.safeParse(mapped);
      if (parsed.success) {
        await cacheTenantInfo(tenantId, mapped);
        return success(mapped);
      }
      await cacheTenantInfo(tenantId, mapped);
      return success(mapped);
    }

    const cached = await readCachedTenantInfo(tenantId);
    if (cached) return success(cached);

    if (!navigator.onLine) return success(null);
    return failure(new AppError(DashboardErrors.TENANT_INFO_FAILED, 'Error al cargar información del negocio'));
  },

  async getSubscriptionInfo(tenantId: string): Promise<Result<SubscriptionResponse | null, AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.SUBSCRIPTION_INFO_FAILED, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
    }
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('tenant_id', tenantId)
      .single();

    if (!error && data) {
      const parsed = SubscriptionInfoSchema.safeParse(data);
      if (parsed.success) {
        try {
          localStorage.setItem(CACHE_SUB_KEY(tenantId), JSON.stringify(parsed.data));
        } catch {
          console.debug('[DashboardService] localStorage cache write failed — non-critical');
        }
        return success(parsed.data);
      }
      try {
        localStorage.setItem(CACHE_SUB_KEY(tenantId), JSON.stringify(data));
      } catch {
        console.debug('[DashboardService] localStorage cache write failed — non-critical');
      }
      return success(data);
    }

    const cached = readCachedSubscription(tenantId);
    if (cached) return success(cached);

    if (!navigator.onLine) return success(null);
    return failure(new AppError(DashboardErrors.SUBSCRIPTION_INFO_FAILED, 'Error al cargar suscripción'));
  },

  async getEmployeeCount(tenantId: string): Promise<Result<number, AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.EMPLOYEES_LOAD_FAILED, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
    }
    const { count, error } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'employee')
      .is('deleted_at', null);

    if (!error) {
      try {
        localStorage.setItem(CACHE_EMP_KEY(tenantId), String(count ?? 0));
      } catch {
        console.debug('[DashboardService] localStorage cache write failed — non-critical');
      }
      return success(count ?? 0);
    }

    const cached = readCachedEmployeeCount(tenantId);
    if (cached !== null) return success(cached);

    if (!navigator.onLine) return success(0);
    return failure(new AppError(DashboardErrors.EMPLOYEES_LOAD_FAILED, 'Error al cargar empleados'));
  },

  async getLowStockProducts(tenantId: string): Promise<Result<Product[], AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.DASHBOARD_LOAD_FAILED, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
    }
    return inventoryService.getLowStockProducts(tenantId);
  },

  async getTopProducts(tenantId: string, limit = 5): Promise<Result<{ productId: string; name: string; totalQty: number; isWeighted: boolean }[], AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.DASHBOARD_LOAD_FAILED, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
    }
    if (!navigator.onLine) return success([]);
    try {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

      const { data, error } = await supabase
        .from('sale_items')
        .select('product_id, product_name, quantity, is_weighted')
        .eq('tenant_id', tenantUuid)
        .is('deleted_at', null);

      if (error) {
        return failure(new AppError(DashboardErrors.DASHBOARD_TOP_PRODUCTS_FAILED, 'Error al cargar productos más vendidos'));
      }

      if (!data || data.length === 0) {
        return success([]);
      }

      const agg = new Map<string, { name: string; totalQty: number; isWeighted: boolean }>();
      for (const row of data) {
        const id = row.product_id as string;
        const isWeighted = (row.is_weighted as boolean) ?? false;
        const existing = agg.get(id);
        if (existing) {
          existing.totalQty += Number(row.quantity);
        } else {
          agg.set(id, { name: row.product_name as string, totalQty: Number(row.quantity), isWeighted });
        }
      }

      const sorted = Array.from(agg.entries())
        .map(([productId, { name, totalQty, isWeighted }]) => ({ productId, name, totalQty, isWeighted }))
        .sort((a, b) => b.totalQty - a.totalQty)
        .slice(0, limit);

      return success(sorted);
    } catch (err) {
      logger.error('Dashboard', 'Error en getTopProducts:', err);
      return failure(new AppError(DashboardErrors.DASHBOARD_TOP_PRODUCTS_FAILED, 'Error al cargar productos más vendidos'));
    }
  },

  async getTodayEarnings(tenantId: string): Promise<Result<number, AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.DASHBOARD_LOAD_FAILED, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
    }
    try {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const startOfDay = startOfDayVzla();
      const endOfDay = startOfNextDayVzla();

      if (isDbReady()) {
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
            const cost = calcItemCost(item.quantity, item.costUsdPerUnit, item.unitMultiplier);
            totalEarnings += revenue - cost;
          }
          return success(preciseRound(totalEarnings, 2));
        }
      }

      // Fallback a Supabase si Dexie no está listo o está vacío
      const { data: cloudSales, error: cloudError } = await supabase
        .from('sales')
        .select('id, discount_type, discount_value, discount_bs, created_at')
        .eq('tenant_id', tenantUuid)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .gte('created_at', startOfDay)
        .lt('created_at', endOfDay);

      if (cloudError || !cloudSales || cloudSales.length === 0) return success(0);

      const saleIdsCloud = cloudSales.map((s) => s.id);
      const { data: cloudItems, error: itemsError } = await supabase
        .from('sale_items')
        .select('sale_id, quantity, total_price_usd, cost_usd_per_unit, unit_multiplier')
        .eq('tenant_id', tenantUuid)
        .in('sale_id', saleIdsCloud);

      if (itemsError || !cloudItems) return success(0);

      interface CloudSaleItem { sale_id: string; quantity: number; total_price_usd: number; cost_usd_per_unit: number | null; unit_multiplier: number | null }
      const itemsMap = new Map<string, CloudSaleItem[]>();
      for (const item of cloudItems) {
        const sId = item.sale_id;
        const list = itemsMap.get(sId) ?? [];
        list.push(item);
        itemsMap.set(sId, list);
      }

      let totalEarningsCloud = 0;
      for (const sale of cloudSales) {
        const items = itemsMap.get(sale.id) ?? [];
        for (const item of items) {
          const revenue = item.total_price_usd;
          const cost = calcItemCost(item.quantity, item.cost_usd_per_unit ?? 0, item.unit_multiplier ?? 1);
          totalEarningsCloud += (revenue - cost);
        }
      }

      return success(preciseRound(totalEarningsCloud, 2));
    } catch (err) {
      logger.error('Dashboard', 'Error en getTodayEarnings:', err);
      return failure(new AppError(DashboardErrors.DASHBOARD_TODAY_EARNINGS_FAILED, 'Error al calcular ganancias del día'));
    }
  },

  async getPendingTasks(tenantId: string): Promise<Result<PendingTask[], AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.DASHBOARD_LOAD_FAILED, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
    }
    if (!isDbReady()) return success([]);
    try {
      const db = getDb();
      const tasks: PendingTask[] = [];

      const pendingExpenses = await db.expenses
        .where({ tenantId })
        .filter((e) => !e.deletedAt && e.status === 'pending' && !e.isRecurring)
        .toArray();
      for (const exp of pendingExpenses) {
        tasks.push({
          id: exp.id,
          type: 'expense',
          title: exp.category,
          subtitle: exp.description || `${exp.amountUsd.toFixed(2)} USD`,
          amount: exp.amountUsd,
          route: '/gastos',
          totalCount: pendingExpenses.length,
        });
      }

      const orders = await db.purchaseOrders
        .where({ tenantId })
        .filter((o) => !o.deletedAt && (o.status === 'confirmed' || o.status === 'partially_received'))
        .toArray();
      const supplierRows = await db.suppliers.where({ tenantId }).filter((s) => !s.deletedAt).toArray();
      const supplierMap = new Map(supplierRows.map((s) => [s.id, s.name]));
      for (const ord of orders) {
        tasks.push({
          id: ord.id,
          type: 'order',
          title: `Orden #${ord.id.slice(0, 8)}`,
          subtitle: supplierMap.get(ord.supplierId) || 'Proveedor',
          amount: ord.totalUsd,
          route: '/purchases',
          totalCount: orders.length,
        });
      }

      const customers = await db.customers
        .where({ tenantId })
        .filter((c) => !c.deletedAt && c.balance > 0)
        .toArray();
      for (const cust of customers) {
        tasks.push({
          id: cust.id,
          type: 'credit',
          title: cust.name,
          subtitle: `Deuda: ${cust.balance.toFixed(2)} USD`,
          amount: cust.balance,
          route: '/customers',
          totalCount: customers.length,
        });
      }

      return success(tasks);
    } catch (err) {
      logger.error('Dashboard', 'Error en getPendingTasks:', err);
      return failure(new AppError(DashboardErrors.DASHBOARD_LOAD_FAILED, 'Error al cargar tareas pendientes'));
    }
  },
};
