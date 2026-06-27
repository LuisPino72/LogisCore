import { type Result, success, failure, AppError } from '@logiscore/core';
import { logger } from '../../../lib/logger';
import { SaleSchema, SaleItemSchema, CashRegisterSchema } from '../../../specs/pos';
import { PosErrors } from '../../../specs/pos/errors';
import type { Sale, SaleItem, CashRegister } from '../types';

/**
 * Mappers snake→camel con Zod validation (POS-002 / M-1).
 *
 * Inventory ya tiene `inventory/services/mappers.ts` con el mismo patrón.
 * Aquí replicamos para POS: parse con Zod schema en vez de casts `as`.
 *
 * Beneficios:
 * - Type-safety real (Zod valida tipos primitivos)
 * - Validación temprana (si Supabase devuelve algo raro, falla aquí)
 * - Reduce ~80 líneas de boilerplate
 *
 * Retornan Result<T, AppError> para mantener el patrón del proyecto.
 */

type SupabaseSale = Record<string, unknown> & { id: string; tenant_id: string };
type SupabaseSaleItem = Record<string, unknown> & { id: string; sale_id: string };
type SupabaseCashRegister = Record<string, unknown> & { id: string; tenant_id: string };

function toFailureFromZod(err: unknown, label: string): AppError {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error('pos-mappers', `${label} validation failed:`, msg);
  return new AppError(PosErrors.SALE_TOTALS_MISMATCH, `${label} invalido desde Supabase: ${msg}`);
}

export function saleFromSupabase(raw: SupabaseSale, tenantId: string): Result<Sale, AppError> {
  try {
    return success(SaleSchema.parse({
      id: raw.id,
      tenantId,
      userId: raw.user_id,
      paymentMethod: raw.payment_method,
      subtotalBs: raw.subtotal_bs,
      igtfBs: raw.igtf_bs,
      ivaBs: raw.iva_bs,
      totalBs: raw.total_bs,
      exchangeRate: raw.exchange_rate,
      status: raw.status,
      voidedAt: raw.voided_at ?? undefined,
      createdAt: raw.created_at,
      deletedAt: raw.deleted_at ?? undefined,
      discountType: raw.discount_type ?? undefined,
      discountValue: raw.discount_value ?? undefined,
      discountBs: raw.discount_bs ?? undefined,
      customerId: raw.customer_id ?? undefined,
      // POS-002 (C-6): USD persistidos
      subtotalUsd: raw.subtotal_usd,
      ivaUsd: raw.iva_usd,
      igtfUsd: raw.igtf_usd,
      totalUsd: raw.total_usd,
      discountUsd: raw.discount_usd,
      cashRegisterId: raw.cash_register_id ?? undefined,
      isCreditSale: raw.is_credit_sale ?? false,
      creditCollected: raw.credit_collected ?? false,
      collectedAt: raw.collected_at ?? undefined,
      // Delivery/Order fields
      orderType: raw.order_type ?? undefined,
      needsKitchen: raw.needs_kitchen ?? undefined,
      isUrgent: raw.is_urgent ?? undefined,
      kitchenNotes: raw.kitchen_notes ?? undefined,
      orderNumber: raw.order_number ?? undefined,
      deliveryPersonName: raw.delivery_person_name ?? undefined,
      deliveryFee: raw.delivery_fee ?? undefined,
      deliveryAddress: raw.delivery_address ?? undefined,
      deliveryLat: raw.delivery_lat ?? undefined,
      deliveryLng: raw.delivery_lng ?? undefined,
      deliveryNotes: raw.delivery_notes ?? undefined,
      paidAt: raw.paid_at ?? undefined,
      preparedAt: raw.prepared_at ?? undefined,
      dispatchedAt: raw.dispatched_at ?? undefined,
      deliveredAt: raw.delivered_at ?? undefined,
      modifiedAt: raw.modified_at ?? undefined,
      modificationCount: raw.modification_count ?? undefined,
    }));
  } catch (err) {
    return failure(toFailureFromZod(err, 'Sale'));
  }
}

export function saleItemFromSupabase(raw: SupabaseSaleItem, tenantId: string): Result<SaleItem, AppError> {
  try {
    return success(SaleItemSchema.parse({
      id: raw.id,
      tenantId,
      saleId: raw.sale_id,
      productId: raw.product_id,
      productName: raw.product_name,
      productSku: raw.product_sku,
      quantity: raw.quantity,
      unitPriceUsd: raw.unit_price_usd,
      totalPriceUsd: raw.total_price_usd,
      costUsdPerUnit: raw.cost_usd_per_unit,
      isWeighted: raw.is_weighted,
      unit: raw.unit,
      presentationId: raw.presentation_id,
      presentationName: raw.presentation_name,
      unitMultiplier: raw.unit_multiplier ?? 1,
      createdAt: raw.created_at,
      consumedLots: raw.consumed_lots,
    }));
  } catch (err) {
    return failure(toFailureFromZod(err, 'SaleItem'));
  }
}

export function cashRegisterFromSupabase(raw: SupabaseCashRegister, tenantId: string): Result<CashRegister, AppError> {
  try {
    const parsed = CashRegisterSchema.parse({
      id: raw.id,
      tenantId,
      isOpen: raw.is_open,
      openedBy: raw.opened_by,
      openedAt: raw.opened_at,
      openingBalanceBs: raw.opening_balance_bs,
      openingRate: raw.opening_rate,
      closedBy: raw.closed_by,
      closedAt: raw.closed_at,
      closingBalanceBs: raw.closing_balance_bs,
      closingRate: raw.closing_rate,
      expectedClosingBs: raw.expected_closing_bs,
      differenceBs: raw.difference_bs,
      totalSalesCount: raw.total_sales_count,
      totalSalesBs: raw.total_sales_bs,
      totalIgtfBs: raw.total_igtf_bs,
      collectedDebtBs: raw.collected_debt_bs ?? 0, // FUGA-1
      registerId: raw.register_id ?? undefined,
      operatorId: raw.operator_id ?? undefined,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      deletedAt: raw.deleted_at,
    });
    // POS-002 (M-1): Dexie espera string | undefined, no string | null
    const normalized: CashRegister = { ...parsed, deletedAt: parsed.deletedAt ?? undefined };
    return success(normalized);
  } catch (err) {
    return failure(toFailureFromZod(err, 'CashRegister'));
  }
}
