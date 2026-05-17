import { type Result, success, failure, AppError } from '@logiscore/core';
import { preciseRound } from '@logiscore/shared';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { DashboardErrors } from '../../../specs/dashboard/errors';
import type { TenantInfoResponse, SubscriptionResponse } from '../types';
import type { Product } from '../../../specs/inventory';
import { inventoryService } from '../../inventory/services/inventoryService';
import { getDb } from '../../../services/dexie/db';

function calcItemCost(quantity: number, costUsdPerUnit: number | undefined): number {
  if (!costUsdPerUnit || costUsdPerUnit <= 0) return 0;
  return quantity * costUsdPerUnit;
}

export const dashboardService = {
  async getTenantInfo(tenantId: string): Promise<Result<TenantInfoResponse, AppError>> {
    const { data, error } = await supabase
      .from('tenants')
      .select('name, slug, rif')
      .eq('id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error) {
      return failure(new AppError(DashboardErrors.TENANT_INFO_FAILED, 'Error al cargar información del negocio'));
    }

    return success(data);
  },

  async getSubscriptionInfo(tenantId: string): Promise<Result<SubscriptionResponse, AppError>> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      return failure(new AppError(DashboardErrors.SUBSCRIPTION_INFO_FAILED, 'Error al cargar suscripción'));
    }

    return success(data);
  },

  async getEmployeeCount(tenantId: string): Promise<Result<number, AppError>> {
    const { count, error } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'employee')
      .is('deleted_at', null);

    if (error) {
      return failure(new AppError(DashboardErrors.EMPLOYEES_LOAD_FAILED, 'Error al cargar empleados'));
    }

    return success(count ?? 0);
  },

  async getLowStockProducts(tenantId: string): Promise<Result<Product[], AppError>> {
    return inventoryService.getLowStockProducts(tenantId);
  },

  async getTopProducts(tenantId: string, limit = 5): Promise<Result<{ productId: string; name: string; totalQty: number }[], AppError>> {
    try {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

      const { data, error } = await supabase
        .from('sale_items')
        .select('product_id, product_name, quantity')
        .eq('tenant_id', tenantUuid)
        .order('created_at', { ascending: false })
        .limit(100);

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
    try {
      const db = getDb();
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      const sales = await db.sales
        .where('[tenantId+createdAt]')
        .between([tenantId, startOfDay], [tenantId, endOfDay])
        .filter((s) => !s.deletedAt && s.status === 'completed' && !s.voidedAt)
        .toArray();

      if (sales.length === 0) return success(0);

      const saleIds = new Set(sales.map((s) => s.id));
      const items = await db.saleItems.toArray();
      const todayItems = items.filter((i) => saleIds.has(i.saleId));

      let totalEarnings = 0;
      for (const item of todayItems) {
        const revenue = item.totalPriceUsd;
        const cost = calcItemCost(item.quantity, item.costUsdPerUnit);
        totalEarnings += revenue - cost;
      }

      return success(preciseRound(totalEarnings, 2));
    } catch (err) {
      logger.error('Dashboard', 'Error en getTodayEarnings:', err);
      return failure(new AppError('DASHBOARD_TODAY_EARNINGS_FAILED', 'Error al calcular ganancias del día'));
    }
  },
};
