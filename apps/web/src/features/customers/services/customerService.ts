import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import type { DexieCustomer } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';
import { supabase } from '../../../services/supabase/client';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { extractRole } from '../../../lib/jwt';
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
import type { Sale } from '../../pos/types';

const MODULE_NAME = 'CUSTOMERS';
 
async function getRoleFromSession(): Promise<Result<string, AppError>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return failure(new AppError('AUTH_REQUIRED', 'Debe iniciar sesión.'));
    const role = extractRole(session);
    if (!role) return failure(new AppError('AUTH_NO_ROLE', 'No se encontró el rol del usuario.'));
    return success(role);
  } catch {
    return failure(new AppError('AUTH_ERROR', 'Error al obtener la sesión.'));
  }
}

async function requireRole(...allowedRoles: string[]): Promise<Result<string, AppError>> {
  const roleResult = await getRoleFromSession();
  if (!roleResult.ok) return failure(roleResult.error);

  if (!allowedRoles.includes(roleResult.data)) {
    return failure(new AppError('FORBIDDEN', `Solo los roles [${allowedRoles.join(', ')}] pueden realizar esta acción.`));
  }

  return roleResult;
}

function toCustomer(raw: Record<string, unknown>): Customer {
  return {
    id: raw.id as string,
    name: raw.name as string,
    phone: (raw.phone as string | undefined) || undefined,
    cedula: (raw.cedula as string | undefined) || undefined, // AUDIT-017: Cédula field V/E/J/P + 6-8 digits
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
    const roleCheck = await requireRole('owner', 'admin');
    if (!roleCheck.ok) return failure(roleCheck.error);

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

    if (parsed.data.cedula) {
      const duplicate = await db.customers
        .where({ tenantId })
        .filter(c => c.cedula === parsed.data.cedula?.trim().toUpperCase() && !c.deletedAt)
        .first();
      if (duplicate) {
        return failure(new AppError(CustomerErrors.CUSTOMER_DUPLICATE_CEDULA, 'Ya existe un cliente con esta cédula.'));
      }
    }

    const customer: Customer = {
      id,
      name: parsed.data.name.trim(),
      phone: parsed.data.phone?.trim() || undefined,
      cedula: parsed.data.cedula?.trim().toUpperCase() || undefined, // AUDIT-017: normalizar a mayúsculas
      address: parsed.data.address?.trim() || undefined,
      creditLimit: parsed.data.creditLimit ?? 0,
      balance: 0,
      notes: parsed.data.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.transaction('rw', [db.customers, db.syncQueue, db.outbox], async () => {
        await db.customers.add({ ...customer, tenantId });
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

      await emitWithAudit(
        'CUSTOMER.CREATED',
        MODULE_NAME,
        { customerId: id, name: customer.name },
        { tenantId },
      );
      return success(customer);
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en createCustomer:', err);
      return failure(new AppError('CUSTOMER_CREATE_ERROR', 'Error al crear cliente.'));
    }
  },

  async updateCustomer(
    id: string,
    input: UpdateCustomerInput,
    tenantId: string,
  ): Promise<Result<Customer, AppError>> {
    const roleCheck = await requireRole('owner', 'admin');
    if (!roleCheck.ok) return failure(roleCheck.error);

    try {
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

        if (input.cedula) {
          const duplicate = await db.customers
            .where({ tenantId })
            .filter(c => c.id !== id && c.cedula === input.cedula?.trim().toUpperCase() && !c.deletedAt)
            .first();
          if (duplicate) {
            return failure(new AppError(CustomerErrors.CUSTOMER_DUPLICATE_CEDULA, 'Ya existe otro cliente con esta cédula.'));
          }
        }
      }

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
        cedula: input.cedula?.trim().toUpperCase() || undefined, // AUDIT-017: Cédula field V/E/J/P + 6-8 digits
        address: input.address?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };

      await db.transaction('rw', [db.customers, db.syncQueue, db.outbox], async () => {
        await db.customers.put(updated);
        await syncQueue.enqueue(
          'customers',
          'UPDATE',
          id,
          toSnake(updated as unknown as Record<string, unknown>),
          tenantId,
        );
        await outboxService.enqueue('CUSTOMER.UPDATED', MODULE_NAME, { customerId: id });
      });

      await emitWithAudit(
        'CUSTOMER.UPDATED',
        MODULE_NAME,
        { customerId: id, name: updated.name },
        { tenantId },
      );
      return success(toCustomer(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(MODULE_NAME, 'Error en updateCustomer:', err);
      return failure(new AppError('CUSTOMER_UPDATE_ERROR', 'Error al actualizar cliente.'));
    }
  },

  async softDeleteCustomer(id: string, tenantId: string): Promise<Result<void, AppError>> {
    const roleCheck = await requireRole('owner', 'admin');
    if (!roleCheck.ok) return failure(roleCheck.error);

    try {
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

      await emitWithAudit(
        'CUSTOMER.DELETED',
        MODULE_NAME,
        { customerId: id, name: customer.name },
        { tenantId },
      );
      return success(undefined);
    } catch (err) {
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
          for (const c of data) {
            const existing = await db.customers.get(c.id as string);
            if (existing?.deletedAt) {
              continue;
            }
            await db.customers.put({
              id: c.id as string,
              tenantId,
              name: c.name as string,
              phone: (c.phone as string | null) ?? undefined,
              cedula: (c.cedula as string | null) ?? undefined, // AUDIT-017: Cédula field V/E/J/P + 6-8 digits
              address: (c.address as string | null) ?? undefined,
              creditLimit: (c.credit_limit as number) ?? 0,
              balance: (c.balance as number) ?? 0,
              notes: (c.notes as string | null) ?? undefined,
              createdAt: c.created_at as string,
              updatedAt: c.updated_at as string,
            });
          }
          rows = await db.customers
            .where({ tenantId })
            .filter((c) => !c.deletedAt)
            .toArray();
        }
      }

      return success(rows.map((r) => toCustomer(r as unknown as Record<string, unknown>)));
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
      const rows = await db.sales
        .where({ tenantId, customerId: query.customerId })
        .filter((s) => {
          if (s.deletedAt || s.status !== 'completed') return false;
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

      const sales: Sale[] = paged.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        userId: r.userId,
        paymentMethod: r.paymentMethod as Sale['paymentMethod'],
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
      }));

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
        .filter((s) => !s.deletedAt && s.status === 'completed')
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
        totalBs += s.totalBs;
        if (s.exchangeRate > 0) {
          totalUsd += s.totalBs / s.exchangeRate;
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
        .filter((s) => !s.deletedAt && s.status === 'completed' && s.customerId != null)
        .toArray();

      const customerMap = new Map<string, { totalBs: number; totalUsd: number; count: number; lastPurchaseAt: string }>();
      for (const s of sales) {
        const cid = s.customerId!;
        const existing = customerMap.get(cid) ?? { totalBs: 0, totalUsd: 0, count: 0, lastPurchaseAt: s.createdAt };
        existing.totalBs += s.totalBs;
        if (s.exchangeRate > 0) {
          existing.totalUsd += s.totalBs / s.exchangeRate;
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
        new AppError(CustomerErrors.CUSTOMER_FETCH_FAILED, 'Error al calcular acquisition.'),
      );
    }
  },
};
