import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { logger } from '../../../lib/logger';
import { createVolatileCache } from '../../../lib/cache';
import { startOfDayVzla, endOfDayVzla } from '../../../lib/date';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import type { ReportFilters } from '../types';

export const PAYMENT_LABELS: Record<string, string> = {
  efectivo_bs: 'Efectivo Bs',
  pago_movil: 'Pago Móvil',
  tarjeta_bs: 'Tarjeta Bs',
  efectivo_usd: 'Efectivo USD',
};

export function getDateRange(filters: ReportFilters): { start: string; end: string } {
  switch (filters.timeRange) {
    case 'today':
      return { start: startOfDayVzla(), end: endOfDayVzla() };
    case 'yesterday': {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const d = new Date(y.getFullYear(), y.getMonth(), y.getDate());
      return { start: startOfDayVzla(d), end: endOfDayVzla(d) };
    }
    case 'last7days': {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { start: startOfDayVzla(d), end: endOfDayVzla() };
    }
    case 'thisMonth': {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDayVzla(firstDay), end: endOfDayVzla() };
    }
    case 'lastMonth': {
      const now = new Date();
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDayVzla(lm), end: endOfDayVzla(lmEnd) };
    }
    case 'custom':
      return {
        start: filters.startDate ? startOfDayVzla(new Date(filters.startDate)) : startOfDayVzla(),
        end: filters.endDate ? endOfDayVzla(new Date(filters.endDate)) : endOfDayVzla(),
      };
    default:
      return { start: startOfDayVzla(), end: endOfDayVzla() };
  }
}

export interface SaleWithItems {
  sale: {
    id: string;
    totalBs: number;
    igtfBs: number;
    ivaBs?: number;
    exchangeRate: number;
    paymentMethod: string;
    createdAt: string;
    discountBs?: number;
    isCreditSale?: boolean;
    creditCollected?: boolean;
    customerId?: string;
  };
  items: {
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitMultiplier?: number;
    unitPriceUsd: number;
    costUsdPerUnit?: number;
  }[];
}

export const salesCache = createVolatileCache<SaleWithItems[]>({ ttlMs: 500 });
function salesCacheKey(tenantId: string, start: string, end: string): string {
  return `${tenantId}:${start}:${end}`;
}

export async function fetchSalesWithItems(tenantId: string, start: string, end: string): Promise<SaleWithItems[]> {
  const key = salesCacheKey(tenantId, start, end);
  const cached = salesCache.get(key);
  if (cached) return cached;

  const db = getDb();
  const sales = await db.sales
    .where('[tenantId+createdAt]')
    .between([tenantId, start], [tenantId, end])
    .filter((s) => !s.deletedAt && (s.status === 'completed' || s.status === 'entregada'))
    .toArray();

  if (sales.length > 0) {
    const saleIds = sales.map((s) => s.id);
    const allItems = await db.saleItems
      .where('saleId')
      .anyOf(saleIds)
      .filter((i) => !i.deletedAt)
      .toArray();

    if (allItems.length > 0) {
      const itemsBySaleId = new Map<string, typeof allItems>();
      for (const item of allItems) {
        const group = itemsBySaleId.get(item.saleId);
        if (group) group.push(item);
        else itemsBySaleId.set(item.saleId, [item]);
      }

      const result = sales.map((sale) => ({
        sale: {
          id: sale.id,
          totalBs: sale.totalBs,
          igtfBs: sale.igtfBs,
          ivaBs: sale.ivaBs,
          exchangeRate: sale.exchangeRate,
          paymentMethod: sale.paymentMethod,
          createdAt: sale.createdAt,
          discountBs: sale.discountBs,
          isCreditSale: sale.isCreditSale,
          creditCollected: sale.creditCollected,
          customerId: sale.customerId,
        },
        items: (itemsBySaleId.get(sale.id) ?? []).map((i) => ({
          productId: i.productId,
          productName: i.productName,
          productSku: i.productSku,
          quantity: i.quantity,
          unitMultiplier: i.unitMultiplier,
          unitPriceUsd: i.unitPriceUsd,
          costUsdPerUnit: i.costUsdPerUnit,
        })),
      }));
      salesCache.set(key, result);
      return result;
    }

    try {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const { data: cloudItems, error: itemsError } = await supabase
        .from('sale_items')
        .select('sale_id, product_id, product_name, product_sku, quantity, unit_price_usd, cost_usd_per_unit, unit_multiplier')
        .eq('tenant_id', tenantUuid)
        .in('sale_id', saleIds)
        .is('deleted_at', null);

      if (!itemsError && cloudItems && cloudItems.length > 0) {
        const itemsBySaleId = new Map<string, typeof cloudItems>();
        for (const item of cloudItems) {
          const sId = item.sale_id;
          if (!itemsBySaleId.has(sId)) itemsBySaleId.set(sId, []);
          itemsBySaleId.get(sId)!.push(item);
        }

        const result = sales.map((sale) => ({
          sale: {
            id: sale.id,
            totalBs: sale.totalBs,
            igtfBs: sale.igtfBs,
            ivaBs: sale.ivaBs,
            exchangeRate: sale.exchangeRate,
            paymentMethod: sale.paymentMethod,
            createdAt: sale.createdAt,
            discountBs: sale.discountBs,
            isCreditSale: sale.isCreditSale,
            creditCollected: sale.creditCollected,
            customerId: sale.customerId,
          },
          items: (itemsBySaleId.get(sale.id) ?? []).map((i) => ({
            productId: i.product_id,
            productName: i.product_name || '',
            productSku: i.product_sku || '',
            quantity: Number(i.quantity),
            unitMultiplier: i.unit_multiplier ? Number(i.unit_multiplier) : 1,
            unitPriceUsd: Number(i.unit_price_usd) || 0,
            costUsdPerUnit: i.cost_usd_per_unit ? Number(i.cost_usd_per_unit) : undefined,
          })),
        }));
        salesCache.set(key, result);
        return result;
      }
    } catch {
      // Supabase fetch failed — fall through to full Supabase fallback
    }
  }

  // Fallback a Supabase si Dexie está vacío o hay race condition de sync
  try {
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const { data: cloudSales, error: salesError } = await supabase
      .from('sales')
      .select('id, total_bs, igtf_bs, iva_bs, exchange_rate, payment_method, created_at, discount_bs, is_credit_sale, credit_collected, customer_id')
      .eq('tenant_id', tenantUuid)
      .in('status', ['completed', 'entregada'])
      .is('deleted_at', null)
      .gte('created_at', start)
      .lt('created_at', end);

    if (salesError || !cloudSales || cloudSales.length === 0) return [];

    const saleIds = cloudSales.map((s) => s.id);
    const { data: cloudItems, error: itemsError } = await supabase
      .from('sale_items')
      .select('sale_id, product_id, product_name, product_sku, quantity, unit_price_usd, cost_usd_per_unit, unit_multiplier')
      .eq('tenant_id', tenantUuid)
      .in('sale_id', saleIds)
      .is('deleted_at', null);

    if (itemsError || !cloudItems) return [];

    const itemsBySaleId = new Map<string, typeof cloudItems>();
    for (const item of cloudItems) {
      const sId = item.sale_id;
      if (!itemsBySaleId.has(sId)) itemsBySaleId.set(sId, []);
      itemsBySaleId.get(sId)!.push(item);
    }

    const cloudResult = cloudSales.map((sale) => ({
      sale: {
        id: sale.id,
        totalBs: Number(sale.total_bs) || 0,
        igtfBs: Number(sale.igtf_bs) || 0,
        ivaBs: sale.iva_bs ? Number(sale.iva_bs) : undefined,
        exchangeRate: Number(sale.exchange_rate) || 1,
        paymentMethod: sale.payment_method || 'efectivo_bs',
        createdAt: sale.created_at,
        discountBs: sale.discount_bs ? Number(sale.discount_bs) : undefined,
        isCreditSale: sale.is_credit_sale ?? false,
        creditCollected: sale.credit_collected ?? false,
        customerId: sale.customer_id,
      },
      items: (itemsBySaleId.get(sale.id) ?? []).map((i) => ({
        productId: i.product_id,
        productName: i.product_name || '',
        productSku: i.product_sku || '',
        quantity: Number(i.quantity),
        unitMultiplier: i.unit_multiplier ? Number(i.unit_multiplier) : 1,
        unitPriceUsd: Number(i.unit_price_usd) || 0,
        costUsdPerUnit: i.cost_usd_per_unit ? Number(i.cost_usd_per_unit) : undefined,
      })),
    }));
    salesCache.set(key, cloudResult);
    return cloudResult;
  } catch {
    logger.warn('Reports', 'fetchSalesWithItems fallback returned empty');
    return [];
  }
}

export function effectiveItemQuantity(item: { quantity: number; unitMultiplier?: number }): number {
  return item.quantity * (item.unitMultiplier ?? 1);
}

export function calcItemCostBs(quantity: number, costUsdPerUnit: number | undefined, exchangeRate: number, unitMultiplier: number = 1): number {
  if (!costUsdPerUnit || costUsdPerUnit <= 0) return 0;
  const effectiveQuantity = quantity * unitMultiplier;
  return preciseRound(effectiveQuantity * costUsdPerUnit * exchangeRate, 2);
}

/** Busca la tasa de cambio activa más cercana a una fecha dada */
async function getRateForDate(tenantId: string, date: string): Promise<number> {
  const db = getDb();
  const rates = await db.exchangeRates
    .where('tenantId')
    .equals(tenantId)
    .filter((r) => r.createdAt <= date)
    .toArray();

  if (rates.length > 0) {
    rates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rates[0].rate;
  }

  // Fallback: la tasa más reciente disponible en Dexie
  const allRates = await db.exchangeRates
    .where('tenantId')
    .equals(tenantId)
    .toArray();

  if (allRates.length > 0) {
    allRates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return allRates[0].rate;
  }

  // Fallback a Supabase
  try {
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const { data } = await supabase
      .from('exchange_rates')
      .select('rate, created_at')
      .eq('tenant_id', tenantUuid)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const cloudRate = Number(data.rate) || 0;
      if (cloudRate > 0) {
        await db.exchangeRates.put({
          id: crypto.randomUUID(),
          tenantId,
          rate: cloudRate,
          source: 'bcv_api',
          fetchedAt: null,
          createdAt: data.created_at,
        });
        return cloudRate;
      }
    }
  } catch {
    // Silencioso: no hay conexión o no existe el tenant en la nube
  }

  // MED-2: fallback al último rate conocido en el store antes de rendirse
  const storeRate = useExchangeRateStore.getState().rate;
  if (storeRate && storeRate > 0) return storeRate;

  console.warn(`[MED-2] getRateForDate: sin tasa para tenant=${tenantId} date=${date}`);
  return 0;
}

// Module-level cache for exchange rates to avoid N+1 queries
const rateCache = createVolatileCache<number>({ maxSize: 500 });

export async function getRateForDateCached(tenantId: string, date: string, skipZeroCache: boolean = true): Promise<number> {
  const key = `${tenantId}:${date}`;
  const cached = rateCache.get(key);
  if (cached !== undefined) return cached;
  const rate = await getRateForDate(tenantId, date);
  // MED-2: no cachear rate=0 para que próximas llamadas reintenten
  if (!skipZeroCache || rate > 0) {
    rateCache.set(key, rate);
  }
  return rate;
}
