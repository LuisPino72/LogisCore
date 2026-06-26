import { type Result, success, failure, AppError } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { DashboardErrors } from '../../../specs/dashboard/errors';
import { ValidateDashboardTenantSchema } from '../../../specs/dashboard/index';
import type { ActivityEntry } from '../types';

const EVENT_MAP: Record<string, { type: ActivityEntry['type']; icon: string; getMessage: (p: Record<string, unknown>) => string; route?: string }> = {
  'SALE.COMPLETED': { type: 'sale_completed', icon: 'ShoppingCart', getMessage: (p) => {
    const payload = typeof p === 'string' ? JSON.parse(p) : p;
    return `Venta — $${Number(payload.totalUsd ?? 0).toFixed(2)}`;
  }, route: '/pos' },
  'SALE.VOIDED': { type: 'sale_voided', icon: 'RotateCcw', getMessage: () => `Venta anulada`, route: '/pos' },
  'EXPENSES.CREATED': { type: 'expense_created', icon: 'Receipt', getMessage: (p) => `Gasto ${p.category ?? ''} $${Number(p.amountUsd ?? 0).toFixed(2)}`, route: '/gastos' },
  'EXPENSES.CANCELLED': { type: 'expense_created', icon: 'Receipt', getMessage: (p) => `Gasto ${p.category ?? ''} cancelado`, route: '/gastos' },
  'PURCHASE.RECEIVED': { type: 'purchase_received', icon: 'Package', getMessage: () => `Orden recibida`, route: '/purchases' },
  'PURCHASE.SUPPLIER_PAID': { type: 'supplier_paid', icon: 'DollarSign', getMessage: (p) => `Pago a ${p.supplierName ?? 'proveedor'} $${Number(p.amount ?? 0).toFixed(2)}`, route: '/purchases' },
  'SUPPLIER.PAYMENT_CREATED': { type: 'supplier_paid', icon: 'DollarSign', getMessage: (p) => `Pago a proveedor $${Number(p.amountUsd ?? 0).toFixed(2)}`, route: '/purchases' },
  'CUSTOMER.CREATED': { type: 'debt_collected', icon: 'UserPlus', getMessage: (p) => `Cliente ${p.customerName ?? ''} registrado`, route: '/customers' },
};

interface AuditTrailRow {
  id: string;
  event_name: string;
  payload: Record<string, unknown>;
  created_at: string;
}

function getEntityId(eventName: string, payload: Record<string, unknown>): string | undefined {
  if (eventName.startsWith('SALE.')) return String(payload.saleId ?? '');
  if (eventName.startsWith('EXPENSES.')) return String(payload.expenseId ?? '');
  if (eventName.startsWith('PURCHASE.') || eventName === 'SUPPLIER.PAYMENT_CREATED') return String(payload.purchaseOrderId ?? payload.orderId ?? '');
  if (eventName.startsWith('CUSTOMER.')) return String(payload.customerId ?? '');
  return undefined;
}

function mapAuditEvent(row: AuditTrailRow): ActivityEntry | null {
  const config = EVENT_MAP[row.event_name];
  if (!config) return null;
  const payload = row.payload ?? {};
  return {
    id: row.id,
    type: config.type,
    message: config.getMessage(payload),
    timestamp: row.created_at,
    icon: config.icon,
    route: config.route,
    entityId: getEntityId(row.event_name, payload),
  };
}

export const activityService = {
  async getRecentActivity(tenantId: string): Promise<Result<ActivityEntry[], AppError>> {
    const tenantCheck = ValidateDashboardTenantSchema.safeParse(tenantId);
    if (!tenantCheck.success) {
      return failure(new AppError(DashboardErrors.DASHBOARD_ACTIVITY_FAILED, tenantCheck.error.issues[0]?.message || 'Negocio no válido.'));
    }
    if (!navigator.onLine) return success([]);

    try {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

      const { data, error } = await supabase
        .rpc('get_recent_activity', { p_tenant_id: tenantUuid });

      if (error) {
        logger.error('ActivityService', 'Error fetching recent activity:', error);
        return failure(new AppError(DashboardErrors.DASHBOARD_ACTIVITY_FAILED, 'Error al cargar actividad reciente'));
      }

      const finalData = data as AuditTrailRow[] | null;

      if (!finalData || finalData.length === 0) return success([]);

      const activity: ActivityEntry[] = [];
      for (const row of finalData) {
        const mapped = mapAuditEvent(row);
        if (mapped) activity.push(mapped);
      }

      return success(activity);
    } catch (err) {
      logger.error('ActivityService', 'Error en getRecentActivity:', err);
      return failure(new AppError(DashboardErrors.DASHBOARD_ACTIVITY_FAILED, 'Error al cargar actividad reciente'));
    }
  },
};
