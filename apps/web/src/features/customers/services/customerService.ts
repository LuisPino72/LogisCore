import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import type { DexieCustomer } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { requireRole } from '../../auth/services/roleGuard';
import { useAuthStore } from '../../auth/stores/authStore';
import {
  CreateCustomerInputSchema,
  UpdateCustomerInputSchema,
} from '../../../specs/customers';
import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerHistoryQuery,
} from '../../../specs/customers';
import { CustomerErrors } from '../../../specs/customers/errors';
import { PaymentMethodSchema } from '../../../specs/pos';
import type { PaymentMethod } from '../../../specs/pos';
import type { Sale } from '../../pos/types';

const MODULE_NAME = 'CUSTOMERS';

function toCustomer(raw: Record<string, unknown>): Customer {
  return {
    id: raw.id as string,
    name: raw.name as string,
    phone: raw.phone != null ? String(raw.phone) : undefined,
    cedula: (raw.cedula as string | undefined)?.toUpperCase() || undefined, // PLAN-112 (NEW-2): normalizar lectura
    address: (raw.address as string | undefined) || undefined,
    creditLimit: (raw.creditLimit as number) ?? 0,
    balance: (raw.balance as number) ?? 0,
    notes: (raw.notes as string | undefined) || undefined,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: raw.deletedAt as string | undefined,
  };
}

export interface CustomerStats {
  totalSpentUsd: number;
  totalSpentBs: number;
  purchaseCount: number;
  averageTicketUsd: number;
  lastPurchaseAt: string | null;
  firstPurchaseAt: string | null;
}

export const customerService = {
  async createCustomer(
    tenantId: string,
    _userId: string,
    input: CreateCustomerInput,
  ): Promise<Result<Customer, AppError>> {
    try {
      requireRole('owner', 'admin');

      const networkCheck = requireNetwork();
      if (!networkCheck.ok) return failure(networkCheck.error);
      const db = getDb();
      const id = generateId();
      const now = new Date().toISOString();

      const parsed = CreateCustomerInputSchema.safeParse(input);
      if (!parsed.success) {
        return failure(
          new AppError(
            CustomerErrors.CUSTOMER_INVALID_INPUT,
            parsed.error.issues[0]?.message ?? 'Datos inválidos.',
          ),
        );
      }

      const cedulaNormalized = parsed.data.cedula?.trim().toUpperCase() || undefined;

      const customer: Customer = {
        id,
        name: parsed.data.name.trim(),
        phone: parsed.data.phone?.trim() || undefined,
        cedula: cedulaNormalized,
        address: parsed.data.address?.trim() || undefined,
        creditLimit: parsed.data.creditLimit ?? 0,
        balance: 0,
        notes: parsed.data.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };

      // PLAN-112 (M2): check de cedula duplicada DENTRO de la tx (Dexie serializa races).
      // El check pre-tx era vulnerable a TOCTOU: dos requests concurrentes con la misma
      // cedula pasaban el check, ambos ejecutaban add() y Dexie no rechazaba (el campo
      // no es unique en Dexie). Ahora usamos `tx.customers` y la tx garantiza que la
      // lectura y el add son atómicos. El índice `cedula` (v21) acelera el lookup.
      await db.transaction('rw', [db.customers, db.syncQueue, db.outbox], async (tx) => {
        if (cedulaNormalized) {
          const duplicate = await tx.customers
            .where({ tenantId, cedula: cedulaNormalized })
            .filter((c) => !c.deletedAt)
            .first();
          if (duplicate) {
            throw new AppError(CustomerErrors.CUSTOMER_DUPLICATE_CEDULA, 'Ya existe un cliente con esta cédula.');
          }
        }
        await tx.customers.add({ ...customer, tenantId });
        await syncQueue.enqueue(
          'customers',
          'CREATE',
          id,
          toSnake({ ...customer, tenantId } as unknown as Record<string, unknown>),
          tenantId,
        );
        await outboxService.enqueue('CUSTOMER.CREATED', MODULE_NAME, {
          customerId: id,
          name: customer.name,
        });
      });

      await logAuditEventOnly({
        eventName: 'CUSTOMER.CREATED',
        module: MODULE_NAME,
        payload: { customerId: id, name: customer.name },
        context: { tenantId, userId: useAuthStore.getState().session?.userId },
      });
      return success(customer);
    } catch (err) {
      // PLAN-112 (M1): preservar el código de AppError (e.g. AUTH_SCOPE_DENIED) cuando
      // requireRole() lanza. Si no es AppError, genérico CUSTOMER_CREATE_ERROR.
      if (err instanceof AppError) return failure(err);
      logger.error(MODULE_NAME, 'Error en createCustomer:', err);
      return failure(new AppError('CUSTOMER_CREATE_ERROR', 'Error al crear cliente.'));
    }
  },

  async updateCustomer(
    id: string,
    input: UpdateCustomerInput,
    tenantId: string,
  ): Promise<Result<Customer, AppError>> {
    try {
      requireRole('owner', 'admin');

      const networkCheck = requireNetwork();
      if (!networkCheck.ok) return failure(networkCheck.error);
      const db = getDb();

      if (Object.keys(input).length > 0) {
        const partial = UpdateCustomerInputSchema.safeParse(input);
        if (!partial.success) {
          return failure(
            new AppError(
              CustomerErrors.CUSTOMER_INVALID_INPUT,
              partial.error.issues[0]?.message ?? 'Datos inválidos.',
            ),
          );
        }
      }

      const cedulaNormalized = input.cedula?.trim().toUpperCase() || undefined;

      const existing = await db.customers
        .where({ id })
        .filter((c) => c.tenantId === tenantId && !c.deletedAt)
        .first();
      if (!existing) {
        return failure(
          new AppError(CustomerErrors.CUSTOMER_NOT_FOUND, 'Cliente no encontrado.'),
        );
      }

      const updated: DexieCustomer = {
        ...existing,
        ...input,
        phone: input.phone?.trim() || undefined,
        cedula: cedulaNormalized, // AUDIT-017: normalizar a mayúsculas
        address: input.address?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };

      // PLAN-112 (M2): check de cedula duplicada DENTRO de la tx (mismo patrón que
      // createCustomer). Permite exclude-self vía filtro en memoria post-where() ya
      // que `cedula` no es unique en Dexie. Para queries pequeñas por tenant, el
      // set de resultados es tipicamente 0-1.
      await db.transaction('rw', [db.customers, db.syncQueue, db.outbox], async (tx) => {
        if (cedulaNormalized) {
          const duplicate = await tx.customers
            .where({ tenantId, cedula: cedulaNormalized })
            .filter((c) => c.id !== id && !c.deletedAt)
            .first();
          if (duplicate) {
            throw new AppError(CustomerErrors.CUSTOMER_DUPLICATE_CEDULA, 'Ya existe otro cliente con esta cédula.');
          }
        }
        await tx.customers.put(updated);
        await syncQueue.enqueue(
          'customers',
          'UPDATE',
          id,
          toSnake(updated as unknown as Record<string, unknown>),
          tenantId,
        );
        await outboxService.enqueue('CUSTOMER.UPDATED', MODULE_NAME, { customerId: id });
      });

      await logAuditEventOnly({
        eventName: 'CUSTOMER.UPDATED',
        module: MODULE_NAME,
        payload: { customerId: id, name: updated.name },
        context: { tenantId, userId: useAuthStore.getState().session?.userId },
      });
      return success(toCustomer(updated as unknown as Record<string, unknown>));
    } catch (err) {
      if (err instanceof AppError) return failure(err); // PLAN-112 (M1)
      logger.error(MODULE_NAME, 'Error en updateCustomer:', err);
      return failure(new AppError('CUSTOMER_UPDATE_ERROR', 'Error al actualizar cliente.'));
    }
  },

  async softDeleteCustomer(id: string, tenantId: string): Promise<Result<void, AppError>> {
    try {
      requireRole('owner', 'admin');

      const networkCheck = requireNetwork();
      if (!networkCheck.ok) return failure(networkCheck.error);
      const db = getDb();
      const customer = await db.customers
        .where({ id })
        .filter((c) => c.tenantId === tenantId && !c.deletedAt)
        .first();
      if (!customer) {
        return failure(
          new AppError(CustomerErrors.CUSTOMER_NOT_FOUND, 'Cliente no encontrado.'),
        );
      }

      const salesWithCustomer = await db.sales
        .where({ tenantId, customerId: id })
        .filter((s) => !s.deletedAt)
        .count();

      if (salesWithCustomer > 0) {
        return failure(
          new AppError(
            CustomerErrors.CUSTOMER_HAS_SALES,
            `No se puede eliminar: el cliente tiene ${salesWithCustomer} venta(s) asociada(s).`,
          ),
        );
      }

      // Verificar que no tenga deuda pendiente
      if (customer.balance && customer.balance > 0) {
        return failure(
          new AppError(
            CustomerErrors.CUSTOMER_HAS_BALANCE,
            `No se puede eliminar: el cliente tiene una deuda pendiente de $${customer.balance.toFixed(2)} USD.`,
          ),
        );
      }

      const deletedAt = new Date().toISOString();
      await db.transaction('rw', [db.customers, db.syncQueue, db.outbox], async () => {
        await db.customers.update(id, { deletedAt });
        await syncQueue.enqueue(
          'customers',
          'DELETE',
          id,
          { id, deleted_at: deletedAt },
          tenantId,
        );
        await outboxService.enqueue('CUSTOMER.DELETED', MODULE_NAME, { customerId: id });
      });

      await logAuditEventOnly({
        eventName: 'CUSTOMER.DELETED',
        module: MODULE_NAME,
        payload: { customerId: id, name: customer.name },
        context: { tenantId, userId: useAuthStore.getState().session?.userId },
      });
      return success(undefined);
    } catch (err) {
      if (err instanceof AppError) return failure(err); // PLAN-112 (M1)
      logger.error(MODULE_NAME, 'Error en softDeleteCustomer:', err);
      return failure(new AppError('CUSTOMER_DELETE_ERROR', 'Error al eliminar cliente.'));
    }
  },

  async getCustomers(tenantId: string): Promise<Result<Customer[], AppError>> {
    try {
      const db = getDb();
      let rows = await db.customers
        .where({ tenantId })
        .filter((c) => !c.deletedAt)
        .toArray();

      if (rows.length === 0) {
        const networkCheck = requireNetwork();
        if (!networkCheck.ok) return success([]);
        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('tenant_id', tenantUuid)
          .is('deleted_at', null);

        if (error) {
          logger.warn(MODULE_NAME, 'Pull customers failed:', error.message);
        } else if (data && data.length > 0) {
          // PLAN-112 (M3): envolver todos los puts en una sola tx. Si algo falla a la
          // mitad, Dexie hace rollback del batch completo. Antes cada put estaba
          // fuera de tx: un fallo en el customer 47 de 100 dejaba 46 sucios en Dexie
          // que el proximo sync no limpiaba.
          await db.transaction('rw', db.customers, async (tx) => {
            for (const c of data) {
              const existing = await tx.customers.get(c.id as string);
              if (existing?.deletedAt) {
                continue;
              }
              await tx.customers.put({
                id: c.id as string,
                tenantId,
                name: c.name as string,
                phone: c.phone != null ? String(c.phone) : undefined,
                cedula: (c.cedula as string | null)?.toUpperCase() ?? undefined, // PLAN-112 (NEW-2): normalizar lectura
                address: (c.address as string | null) ?? undefined,
                creditLimit: (c.credit_limit as number) ?? 0,
                balance: (c.balance as number) ?? 0,
                notes: (c.notes as string | null) ?? undefined,
                createdAt: c.created_at as string,
                updatedAt: c.updated_at as string,
              });
            }
          });
          rows = await db.customers
            .where({ tenantId })
            .filter((c) => !c.deletedAt)
            .toArray();
        }
      }

      // CUST-006: batch lastPurchaseAt — una sola query de ventas para todos los clientes
      const sales = await db.sales
        .where({ tenantId })
        .filter((s) => !s.deletedAt && s.status === 'completed' && !!s.customerId)
        .toArray();
      const lastPurchaseMap = new Map<string, string>();
      for (const s of sales) {
        const cid = s.customerId!;
        const prev = lastPurchaseMap.get(cid);
        if (!prev || s.createdAt > prev) {
          lastPurchaseMap.set(cid, s.createdAt);
        }
      }

      return success(rows.map((r) => {
        const customer = toCustomer(r as unknown as Record<string, unknown>);
        const lastPurchase = lastPurchaseMap.get(customer.id);
        return lastPurchase ? { ...customer, lastPurchaseAt: lastPurchase } : customer;
      }));
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getCustomers:', err);
      return failure(
        new AppError(CustomerErrors.CUSTOMER_FETCH_FAILED, 'Error al cargar clientes.'),
      );
    }
  },

  async getCustomerById(
    id: string,
    tenantId: string,
  ): Promise<Result<Customer | null, AppError>> {
    try {
      const db = getDb();
      const customer = await db.customers
        .where({ id })
        .filter((c) => c.tenantId === tenantId && !c.deletedAt)
        .first();
      return success(customer ? toCustomer(customer as unknown as Record<string, unknown>) : null);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getCustomerById:', err);
      return failure(
        new AppError(CustomerErrors.CUSTOMER_FETCH_FAILED, 'Error al buscar cliente.'),
      );
    }
  },

  async getCustomerHistory(
    query: CustomerHistoryQuery,
    tenantId: string,
  ): Promise<Result<{ sales: Sale[]; total: number }, AppError>> {
    try {
      const db = getDb();
      // PLAN-112 (C1): customerId opcional. Si esta presente, filtra por el; si no,
      // retorna todas las ventas del tenant que tengan un customerId asignado
      // (excluye ventas anonimas — la UI del "historial global" lo requiere).
      const baseQuery = query.customerId
        ? db.sales.where({ tenantId, customerId: query.customerId })
        : db.sales.where({ tenantId });
      const rows = await baseQuery
        .filter((s) => {
          if (s.deletedAt || s.status !== 'completed') return false;
          if (query.customerId === undefined && !s.customerId) return false; // excluir anonimas en global
          if (query.dateFrom) {
            if (new Date(s.createdAt) < new Date(query.dateFrom)) return false;
          }
          if (query.dateTo) {
            const end = new Date(query.dateTo);
            end.setHours(23, 59, 59, 999);
            if (new Date(s.createdAt) > end) return false;
          }
          return true;
        })
        .toArray();

      const sorted = [...rows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const total = sorted.length;
      const paged = sorted.slice(query.offset, query.offset + query.limit);

      const sales: Sale[] = paged.map((r) => {
        // PLAN-112 (M7): validar runtime en vez de cast ciego. Dexie guarda paymentMethod
        // como string libre, pero el union de TS es estricto (4 valores). Si llega
        // un valor externo (sync desactualizado, dato legacy) TypeScript no lo detecta.
        // Usamos safeParse y caemos a 'efectivo_bs' (default) si no es válido, logueando
        // para auditoría.
        const pmParsed = PaymentMethodSchema.safeParse(r.paymentMethod);
        const paymentMethod = pmParsed.success
          ? pmParsed.data
          : (() => {
              logger.warn(MODULE_NAME, `paymentMethod invalido en sale ${r.id}:`, r.paymentMethod);
              return 'efectivo_bs' as const;
            })();
        return {
          id: r.id,
          tenantId: r.tenantId,
          userId: r.userId,
          paymentMethod,
          subtotalBs: r.subtotalBs,
          igtfBs: r.igtfBs,
          ivaBs: r.ivaBs ?? 0,
          totalBs: r.totalBs,
          exchangeRate: r.exchangeRate,
          status: 'completed',
          voidedAt: r.voidedAt ?? undefined,
          createdAt: r.createdAt,
          deletedAt: r.deletedAt ?? undefined,
          discountType: r.discountType,
          discountValue: r.discountValue,
          discountBs: r.discountBs,
          customerId: r.customerId,
          // POS-002 (C-6): USD persistidos
          subtotalUsd: r.subtotalUsd,
          ivaUsd: r.ivaUsd,
          igtfUsd: r.igtfUsd,
          totalUsd: r.totalUsd,
          discountUsd: r.discountUsd,
          isCreditSale: r.isCreditSale ?? false,
          creditCollected: r.creditCollected ?? false,
          collectedAt: r.collectedAt ?? undefined,
        };
      });

      return success({ sales, total });
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getCustomerHistory:', err);
      return failure(
        new AppError(CustomerErrors.CUSTOMER_FETCH_FAILED, 'Error al cargar historial.'),
      );
    }
  },

  async getCustomerStats(
    customerId: string,
    tenantId: string,
  ): Promise<Result<CustomerStats, AppError>> {
    try {
      const db = getDb();
      const sales = await db.sales
        .where({ tenantId, customerId })
        .filter((s) => !s.deletedAt && s.status === 'completed' && (!s.isCreditSale || !!s.creditCollected))
        .toArray();

      if (sales.length === 0) {
        return success({
          totalSpentUsd: 0,
          totalSpentBs: 0,
          purchaseCount: 0,
          averageTicketUsd: 0,
          lastPurchaseAt: null,
          firstPurchaseAt: null,
        });
      }

      let totalBs = 0;
      let totalUsd = 0;
      let firstAt: string | null = null;
      let lastAt: string | null = null;

      for (const s of sales) {
        totalBs += s.subtotalBs;
        if (s.exchangeRate > 0) {
          totalUsd += s.subtotalBs / s.exchangeRate;
        }
        if (!firstAt || s.createdAt < firstAt) firstAt = s.createdAt;
        if (!lastAt || s.createdAt > lastAt) lastAt = s.createdAt;
      }

      return success({
        totalSpentUsd: Math.round(totalUsd * 100) / 100,
        totalSpentBs: Math.round(totalBs * 100) / 100,
        purchaseCount: sales.length,
        averageTicketUsd: Math.round((totalUsd / sales.length) * 100) / 100,
        lastPurchaseAt: lastAt,
        firstPurchaseAt: firstAt,
      });
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getCustomerStats:', err);
      return failure(
        new AppError(CustomerErrors.CUSTOMER_FETCH_FAILED, 'Error al calcular estadísticas.'),
      );
    }
  },

  async getCustomersRanking(
    tenantId: string,
    limit: number = 10,
  ): Promise<Result<Array<{ customerId: string; customerName: string; totalSpentUsd: number; totalSpentBs: number; purchaseCount: number; averageTicketUsd: number }>, AppError>> {
    try {
      const db = getDb();
      const sales = await db.sales
        .where({ tenantId })
        .filter((s) => !s.deletedAt && s.status === 'completed' && s.customerId != null && (!s.isCreditSale || !!s.creditCollected))
        .toArray();

      const customerMap = new Map<string, { totalBs: number; totalUsd: number; count: number; lastPurchaseAt: string }>();
      for (const s of sales) {
        const cid = s.customerId!;
        const existing = customerMap.get(cid) ?? { totalBs: 0, totalUsd: 0, count: 0, lastPurchaseAt: s.createdAt };
        existing.totalBs += s.subtotalBs;
        if (s.exchangeRate > 0) {
          existing.totalUsd += s.subtotalBs / s.exchangeRate;
        }
        existing.count += 1;
        if (s.createdAt > existing.lastPurchaseAt) {
          existing.lastPurchaseAt = s.createdAt;
        }
        customerMap.set(cid, existing);
      }

      const customerIds = Array.from(customerMap.keys());
      const customers = await db.customers
        .where('id')
        .anyOf(customerIds)
        .filter((c) => !c.deletedAt)
        .toArray();
      const customerNameMap = new Map(customers.map((c) => [c.id, c.name]));

      const ranking = Array.from(customerMap.entries())
        .map(([customerId, data]) => ({
          customerId,
          customerName: customerNameMap.get(customerId) ?? 'Cliente eliminado',
          totalSpentUsd: Math.round(data.totalUsd * 100) / 100,
          totalSpentBs: Math.round(data.totalBs * 100) / 100,
          purchaseCount: data.count,
          averageTicketUsd: data.count > 0 ? Math.round((data.totalUsd / data.count) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.totalSpentUsd - a.totalSpentUsd)
        .slice(0, limit);

      return success(ranking);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getCustomersRanking:', err);
      return failure(
        new AppError(CustomerErrors.CUSTOMER_FETCH_FAILED, 'Error al obtener ranking.'),
      );
    }
  },

  async getCustomerAcquisitionStats(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<Result<{ newCustomers: number; returningCustomers: number; retentionRate: number; totalCustomers: number }, AppError>> {
    try {
      const db = getDb();
      const allCustomers = await db.customers
        .where({ tenantId })
        .filter((c) => !c.deletedAt)
        .toArray();
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const newCustomers = allCustomers.filter((c) => {
        const created = new Date(c.createdAt);
        return created >= start && created <= end;
      }).length;

      const salesInRange = await db.sales
        .where('[tenantId+createdAt]')
        .between([tenantId, startDate], [tenantId, end.toISOString()])
        .filter((s) => !s.deletedAt && s.status === 'completed' && s.customerId != null)
        .toArray();

      const uniqueCustomersWithSales = new Set(salesInRange.map((s) => s.customerId!));
      const returningCustomers = Array.from(uniqueCustomersWithSales).filter((cid) => {
        const customer = allCustomers.find((c) => c.id === cid);
        return customer && new Date(customer.createdAt) < start;
      }).length;

      const retentionRate = uniqueCustomersWithSales.size > 0
        ? Math.round((returningCustomers / uniqueCustomersWithSales.size) * 100)
        : 0;

      return success({
        newCustomers,
        returningCustomers,
        retentionRate,
        totalCustomers: allCustomers.length,
      });
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getCustomerAcquisitionStats:', err);
      return failure(
        new AppError(CustomerErrors.CUSTOMER_FETCH_FAILED, 'Error al calcular estadísticas de adquisición.'),
      );
    }
  },

  // ===== SISTEMA DE CRÉDITO (FIADO) =====

  /**
   * Registra un pago contra la deuda de un cliente.
   * Puede ser pago total o parcial.
   */
  async collectDebt(
    customerId: string,
    saleId: string,
    amountUsd: number,
    paymentMethod: PaymentMethod,
    tenantId: string,
    exchangeRate: number,
    reference?: string,
  ): Promise<Result<{ paymentId: string; newBalance: number }, AppError>> {
    try {
      const db = getDb();
      const now = new Date().toISOString();
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

      // Validaciones
      if (amountUsd <= 0) {
        return failure(new AppError('INVALID_AMOUNT', 'El monto del pago debe ser mayor a 0.'));
      }

      const customer = await db.customers
        .where({ id: customerId })
        .filter((c) => c.tenantId === tenantId && !c.deletedAt)
        .first();
      if (!customer) {
        return failure(new AppError('CUSTOMER_NOT_FOUND', 'Cliente no encontrado.'));
      }

      if (customer.balance <= 0) {
        return failure(new AppError('CUSTOMER_NO_DEBT', 'Este cliente no tiene deuda pendiente.'));
      }

      if (amountUsd > customer.balance) {
        return failure(new AppError('AMOUNT_EXCEEDS_DEBT', `El monto ($${amountUsd.toFixed(2)}) excede la deuda pendiente ($${customer.balance.toFixed(2)}).`));
      }

      // Verificar que la venta existe y es fiada
      const session = useAuthStore.getState().session;
      const sale = await db.sales.where({ id: saleId, tenantId: session?.tenantId }).first();
      if (!sale || sale.isCreditSale !== true) {
        return failure(new AppError('SALE_NOT_CREDIT', 'La venta especificada no es una venta a crédito.'));
      }

      if (sale.creditCollected) {
        return failure(new AppError('SALE_ALREADY_COLLECTED', 'Esta venta ya fue cobrada completamente.'));
      }

      const paymentId = generateId();
      const amountBs = preciseRound(amountUsd * exchangeRate, 2);
      const newBalance = preciseRound(Math.max(0, customer.balance - amountUsd), 2);

      // Determinar si es cobro total
      const isFullPayment = newBalance <= 0.01; // Tolerancia de 1 céntimo

      await db.transaction('rw', [db.creditPayments, db.customers, db.sales, db.cashRegisters, db.syncQueue, db.outbox], async (tx) => {
        // Crear registro de pago
        await tx.creditPayments.add({
          id: paymentId,
          tenantId,
          customerId,
          saleId,
          amountUsd: preciseRound(amountUsd, 2),
          amountBs,
          paymentMethod,
          exchangeRate,
          reference: reference?.trim() || undefined,
          createdAt: now,
        });

        // Actualizar balance del cliente
        await tx.customers.update(customerId, {
          balance: isFullPayment ? 0 : newBalance,
          updatedAt: now,
        });

        // Si es pago total, marcar la venta como cobrada
        if (isFullPayment) {
          await tx.sales.update(saleId, {
            creditCollected: true,
            collectedAt: now,
          });
        }

        // Sync queue
        await syncQueue.enqueue('credit_payments', 'CREATE', paymentId, toSnake({
          id: paymentId,
          tenant_id: tenantUuid,
          customer_id: customerId,
          sale_id: saleId,
          amount_usd: preciseRound(amountUsd, 2),
          amount_bs: amountBs,
          payment_method: paymentMethod,
          exchange_rate: exchangeRate,
          reference: reference?.trim() || null,
          created_at: now,
        } as unknown as Record<string, unknown>), tenantId);

        await syncQueue.enqueue('customers', 'UPDATE', customerId, toSnake({
          id: customerId,
          balance: isFullPayment ? 0 : newBalance,
          updated_at: now,
        } as unknown as Record<string, unknown>), tenantId);

        if (isFullPayment) {
          await syncQueue.enqueue('sales', 'UPDATE', saleId, toSnake({
            id: saleId,
            credit_collected: true,
            collected_at: now,
          } as unknown as Record<string, unknown>), tenantId);
        }

        // FUGA-1: Actualizar caja con el cobro (Opción C: campo separado collectedDebtBs)
        const openReg = await tx.cashRegisters
          .where({ tenantId })
          .filter((r) => !r.deletedAt && r.isOpen)
          .first();
        if (openReg) {
          const newCollectedDebtBs = preciseRound((openReg.collectedDebtBs ?? 0) + amountBs, 2);
          await tx.cashRegisters.update(openReg.id, {
            collectedDebtBs: newCollectedDebtBs,
            updatedAt: now,
          });
          await syncQueue.enqueue('cash_registers', 'UPDATE', openReg.id, toSnake({
            id: openReg.id,
            tenant_id: tenantUuid,
            collected_debt_bs: newCollectedDebtBs,
            updated_at: now,
          } as unknown as Record<string, unknown>), tenantId);
        }

        await outboxService.enqueue('DEBT.COLLECTED', MODULE_NAME, {
          customerId,
          saleId,
          paymentId,
          amountUsd: preciseRound(amountUsd, 2),
          tenantSlug: tenantId,
        }, tx);
      });

      await logAuditEventOnly({
        eventName: 'DEBT.COLLECTED',
        module: MODULE_NAME,
        payload: { customerId, saleId, paymentId, amountUsd: preciseRound(amountUsd, 2) },
        context: { tenantId, userId: useAuthStore.getState().session?.userId },
      });

      return success({ paymentId, newBalance: isFullPayment ? 0 : newBalance });
    } catch (err) {
      if (err instanceof AppError) return failure(err);
      logger.error(MODULE_NAME, 'Error en collectDebt:', err);
      return failure(new AppError('DEBT_COLLECT_ERROR', 'Error al registrar el cobro de deuda.'));
    }
  },

  /**
   * Obtiene las ventas fiadas pendientes de cobro de un cliente.
   */
  async getCustomerPendingCreditSales(
    customerId: string,
    tenantId: string,
  ): Promise<Result<Array<Sale & { payments: Array<{ id: string; amountUsd: number; createdAt: string }> }>, AppError>> {
    try {
      const db = getDb();
      const sales = await db.sales
        .where({ tenantId, customerId })
        .filter((s) => !s.deletedAt && s.status === 'completed' && s.isCreditSale === true && s.creditCollected === false)
        .toArray();

      const result = await Promise.all(sales.map(async (s) => {
        const payments = await db.creditPayments
          .where({ saleId: s.id })
          .filter((p) => !p.deletedAt)
          .toArray();

        return {
          id: s.id,
          tenantId: s.tenantId,
          userId: s.userId,
          paymentMethod: s.paymentMethod as PaymentMethod,
          subtotalBs: s.subtotalBs,
          igtfBs: s.igtfBs,
          ivaBs: s.ivaBs,
          totalBs: s.totalBs,
          exchangeRate: s.exchangeRate,
          status: s.status as 'completed' | 'voided',
          voidedAt: s.voidedAt,
          createdAt: s.createdAt,
          deletedAt: s.deletedAt,
          discountType: s.discountType as 'percentage' | 'fixed' | undefined,
          discountValue: s.discountValue,
          discountBs: s.discountBs,
          customerId: s.customerId,
          subtotalUsd: s.subtotalUsd,
          ivaUsd: s.ivaUsd,
          igtfUsd: s.igtfUsd,
          totalUsd: s.totalUsd,
          discountUsd: s.discountUsd,
          isCreditSale: true as const,
          creditCollected: false as const,
          collectedAt: undefined,
          payments: payments.map((p) => ({
            id: p.id,
            amountUsd: p.amountUsd,
            createdAt: p.createdAt,
          })),
        };
      }));

      return success(result);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getCustomerPendingCreditSales:', err);
      return failure(new AppError('CREDIT_SALES_FETCH_FAILED', 'Error al cargar ventas pendientes.'));
    }
  },

  /**
   * Obtiene todos los clientes con deuda pendiente.
   */
  async getCustomersWithDebt(
    tenantId: string,
  ): Promise<Result<Array<{ customerId: string; customerName: string; balance: number; creditLimit: number; pendingSalesCount: number }>, AppError>> {
    try {
      const db = getDb();
      const customersWithDebt = await db.customers
        .where({ tenantId })
        .filter((c) => !c.deletedAt && c.balance > 0)
        .toArray();

      const result = await Promise.all(customersWithDebt.map(async (c) => {
        const pendingSales = await db.sales
          .where({ tenantId, customerId: c.id })
          .filter((s) => !s.deletedAt && s.status === 'completed' && s.isCreditSale === true && s.creditCollected === false)
          .count();

        return {
          customerId: c.id,
          customerName: c.name,
          balance: c.balance,
          creditLimit: c.creditLimit,
          pendingSalesCount: pendingSales,
        };
      }));

      return success(result.sort((a, b) => b.balance - a.balance));
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en getCustomersWithDebt:', err);
      return failure(new AppError('DEBT_CUSTOMERS_FETCH_FAILED', 'Error al cargar clientes con deuda.'));
    }
  },
};
