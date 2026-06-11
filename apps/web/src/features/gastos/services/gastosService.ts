import { type Result, success, failure, AppError } from '@logiscore/core';
import { getDb, type DexieExpense } from '../../../services/dexie/db';
import { preciseRound, generateId, toSnake } from '@logiscore/shared';
import type { Gasto } from '../types';
import { CreateGastoInputSchema, UpdateGastoInputSchema } from '../../../specs/gastos/index';
import { GASTOS_ERRORS } from '../../../specs/gastos/errors';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { emitWithAudit, logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { requireRole } from '../../auth/services/roleGuard';
import { useAuthStore } from '../../auth/stores/authStore';
import { logger } from '../../../lib/logger';

const GASTOS_MODULE = 'gastos';

function mapExpense(e: DexieExpense): Gasto {
  return {
    id: e.id,
    tenantId: e.tenantId,
    createdByUserId: e.createdByUserId,
    category: e.category as Gasto['category'],
    amountUsd: e.amountUsd,
    exchangeRate: e.exchangeRate,
    amountBs: e.amountBs,
    description: e.description,
    date: e.date,
    isRecurring: e.isRecurring,
    recurrenceType: e.recurrenceType,
    nextDueDate: e.nextDueDate,
    parentExpenseId: e.parentExpenseId,
    status: e.status,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    deletedAt: e.deletedAt,
  };
}

export const gastosService = {
  async getAll(tenantId: string, options?: {
    startDate?: string;
    endDate?: string;
    status?: string;
    category?: string;
  }): Promise<Result<Gasto[], AppError>> {
    try {
      const db = getDb();
      let collection = db.expenses
        .where('tenantId')
        .equals(tenantId)
        .filter((e) => !e.deletedAt && !e.parentExpenseId && !e.isRecurring);

      if (options?.status && options.status !== 'all') {
        collection = collection.filter((e) => e.status === options.status);
      }

      if (options?.category && options.category !== 'all') {
        collection = collection.filter((e) => e.category === options.category);
      }

      if (options?.startDate) {
        collection = collection.filter((e) => e.date >= options.startDate!);
      }

      if (options?.endDate) {
        collection = collection.filter((e) => e.date <= options.endDate!);
      }

      const expenses = await collection.sortBy('date');
      const mapped = expenses.reverse().map(mapExpense);
      return success(mapped);
    } catch (err) {
      console.error('[gastosService.getAll]', err);
      return failure(new AppError(GASTOS_ERRORS.GASTOS_FETCH_FAILED.code, GASTOS_ERRORS.GASTOS_FETCH_FAILED.message));
    }
  },

  async getById(tenantId: string, id: string): Promise<Result<Gasto | null, AppError>> {
    try {
      const db = getDb();
      const expense = await db.expenses.get(id);
      if (!expense || expense.deletedAt || expense.tenantId !== tenantId) return success(null);
      return success(mapExpense(expense));
    } catch (err) {
      console.error('[gastosService.getById]', err);
      return failure(new AppError(GASTOS_ERRORS.GASTOS_FETCH_FAILED.code, GASTOS_ERRORS.GASTOS_FETCH_FAILED.message));
    }
  },

  async create(tenantId: string, userId: string, input: unknown): Promise<Result<Gasto, AppError>> {
    requireRole('owner', 'admin');
    // AUDIT-CRUD-006: requireNetwork para consistencia con resto del codebase
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const parsed = CreateGastoInputSchema.safeParse(input);
    if (!parsed.success) {
      return failure(new AppError(GASTOS_ERRORS.GASTOS_INVALID_CATEGORY.code, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }
    // PLAN-113 (C3): defense-in-depth — COMPRA_INVENTARIO es auto-generado por receiveOrder.
    // UI la filtra, pero un cliente API, test o integracion puede bypasear.
    if (parsed.data.category === 'COMPRA_INVENTARIO') {
      return failure(new AppError(
        'GASTOS_MANUAL_COMPRA_NOT_ALLOWED',
        'COMPRA_INVENTARIO es auto-generado al recibir ordenes de compra.',
      ));
    }
    try {
      const db = getDb();
      const now = new Date().toISOString();
      const data = parsed.data;
      const amountBs = preciseRound(data.amountUsd * data.exchangeRate, 2);

      const expense: DexieExpense = {
        id: generateId(),
        tenantId,
        createdByUserId: userId,
        category: data.category,
        amountUsd: data.amountUsd,
        exchangeRate: data.exchangeRate,
        amountBs,
        description: data.description,
        date: data.date,
        isRecurring: data.isRecurring,
        recurrenceType: data.isRecurring ? data.recurrenceType ?? 'monthly' : undefined,
        nextDueDate: data.isRecurring ? data.date : undefined,
        status: data.status ?? 'paid',
        createdAt: now,
        updatedAt: now,
      };

      // AUDIT-007: Transactional outbox (Regla 17 compliance)
      await db.transaction('rw', [db.expenses, db.syncQueue, db.outbox], async () => {
        await db.expenses.add(expense);
        await syncQueue.enqueue('expenses', 'CREATE', expense.id, toSnake(expense as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('EXPENSES.CREATED', 'gastos', { expenseId: expense.id, category: expense.category });
      });
      // AUDIT-CRUD-006: audit post-tx (outbox único emisor per Regla #17)
      await logAuditEventOnly({
        eventName: 'EXPENSES.CREATED',
        module: 'gastos',
        payload: { expenseId: expense.id, category: expense.category },
        context: { userId, tenantId },
      });
      return success(mapExpense(expense));
    } catch (err) {
      console.error('[gastosService.create]', err);
      return failure(new AppError(GASTOS_ERRORS.GASTOS_CREATE_FAILED.code, GASTOS_ERRORS.GASTOS_CREATE_FAILED.message));
    }
  },

  async update(tenantId: string, id: string, input: unknown, currentRate?: number): Promise<Result<Gasto, AppError>> {
    requireRole('owner', 'admin');
    // AUDIT-CRUD-007: requireNetwork para consistencia
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const parsed = UpdateGastoInputSchema.safeParse(input);
    if (!parsed.success) {
      return failure(new AppError(GASTOS_ERRORS.GASTOS_UPDATE_FAILED.code, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }
    try {
      const db = getDb();
      const existing = await db.expenses.get(id);
      if (!existing || existing.deletedAt || existing.tenantId !== tenantId) {
        return failure(new AppError(GASTOS_ERRORS.GASTOS_NOT_FOUND.code, GASTOS_ERRORS.GASTOS_NOT_FOUND.message));
      }

      const data = parsed.data;
      const now = new Date().toISOString();
      const isPayingPending = existing.status === 'pending' && data.status === 'paid';
      const effectiveRate = isPayingPending ? currentRate : undefined;
      const effectiveAmountUsd = data.amountUsd ?? existing.amountUsd;

      const updated: Partial<DexieExpense> = {
        ...data,
        exchangeRate: isPayingPending && effectiveRate ? effectiveRate : data.exchangeRate,
        amountBs: isPayingPending && effectiveRate
          ? preciseRound(effectiveAmountUsd * effectiveRate, 2)
          : data.amountUsd !== undefined && data.exchangeRate !== undefined
            ? preciseRound(data.amountUsd * data.exchangeRate, 2)
            : data.amountBs ?? existing.amountBs,
        updatedAt: now,
      };

      // AUDIT-CRUD-007: update + syncQueue + outbox DENTRO de la MISMA tx (Regla #17)
      await db.transaction('rw', [db.expenses, db.syncQueue, db.outbox], async () => {
        await db.expenses.update(id, updated);
        await syncQueue.enqueue('expenses', 'UPDATE', id, { id, ...toSnake(updated as unknown as Record<string, unknown>) }, tenantId);
        await outboxService.enqueue('EXPENSES.UPDATED', 'gastos', { expenseId: id, changes: Object.keys(data) });
      });
      // AUDIT-CRUD-007: audit post-tx
      await logAuditEventOnly({
        eventName: 'EXPENSES.UPDATED',
        module: 'gastos',
        payload: { expenseId: id, changes: Object.keys(data) },
        context: { userId: undefined, tenantId },
      });
      const result = await db.expenses.get(id);
      return success(mapExpense(result!));
    } catch (err) {
      console.error('[gastosService.update]', err);
      return failure(new AppError(GASTOS_ERRORS.GASTOS_UPDATE_FAILED.code, GASTOS_ERRORS.GASTOS_UPDATE_FAILED.message));
    }
  },

  async remove(tenantId: string, id: string): Promise<Result<void, AppError>> {
    requireRole('owner', 'admin');
    // AUDIT-CRUD-008: requireNetwork para consistencia
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    try {
      const db = getDb();
      const existing = await db.expenses.get(id);
      if (!existing || existing.deletedAt || existing.tenantId !== tenantId) {
        return failure(new AppError(GASTOS_ERRORS.GASTOS_NOT_FOUND.code, GASTOS_ERRORS.GASTOS_NOT_FOUND.message));
      }
      // PLAN-113 (C4): si es un template recurrente con instances vivas, bloquear soft-delete
      // para evitar gastos huerfanos en getAll (instances aparecen sin contexto).
      if (existing.isRecurring && !existing.parentExpenseId) {
        const liveInstances = await db.expenses
          .where('parentExpenseId').equals(id)
          .filter((e) => !e.deletedAt)
          .count();
        if (liveInstances > 0) {
          return failure(new AppError(
            'GASTOS_RECURRING_HAS_INSTANCES',
            `Este template tiene ${liveInstances} occurrences activas. Borra o cancela cada una antes de eliminar el template.`,
          ));
        }
      }
      const now = new Date().toISOString();
      // AUDIT-CRUD-008: update + syncQueue + outbox DENTRO de la MISMA tx (Regla #17)
      await db.transaction('rw', [db.expenses, db.syncQueue, db.outbox], async () => {
        await db.expenses.update(id, { deletedAt: now, updatedAt: now });
        await syncQueue.enqueue('expenses', 'DELETE', id, { id, deleted_at: now }, tenantId);
        await outboxService.enqueue('EXPENSES.DELETED', 'gastos', { expenseId: id });
      });
      // AUDIT-CRUD-008: audit post-tx
      await logAuditEventOnly({
        eventName: 'EXPENSES.DELETED',
        module: 'gastos',
        payload: { expenseId: id },
        context: { userId: undefined, tenantId },
      });
      return success(undefined);
    } catch (err) {
      console.error('[gastosService.remove]', err);
      return failure(new AppError(GASTOS_ERRORS.GASTOS_DELETE_FAILED.code, GASTOS_ERRORS.GASTOS_DELETE_FAILED.message));
    }
  },

  async getRecurringTemplates(tenantId: string): Promise<Result<Gasto[], AppError>> {
    try {
      const db = getDb();
      const templates = await db.expenses
        .where('tenantId')
        .equals(tenantId)
        .filter((e) => !e.deletedAt && e.isRecurring && !e.parentExpenseId)
        .toArray();
      const sorted = templates
        .sort((a, b) => (a.nextDueDate ?? '').localeCompare(b.nextDueDate ?? ''))
        .map(mapExpense);
      return success(sorted);
    } catch (err) {
      console.error('[gastosService.getRecurringTemplates]', err);
      return failure(new AppError(GASTOS_ERRORS.GASTOS_FETCH_FAILED.code, GASTOS_ERRORS.GASTOS_FETCH_FAILED.message));
    }
  },

  async checkAndGenerateRecurring(tenantId: string): Promise<Result<{ generated: Gasto[]; upcoming: { category: string; description?: string; id: string; date: string }[] }, AppError>> {
    // AUDIT-CRUD-010: requireNetwork para consistencia
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    try {
      const db = getDb();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

      const dueTemplates = await db.expenses
        .where('tenantId')
        .equals(tenantId)
        .filter((e) =>
          !e.deletedAt && e.isRecurring
          && !!e.nextDueDate && e.nextDueDate! <= today && e.status !== 'cancelled'
        )
        .toArray();

      const generated: Gasto[] = [];

      // PLAN-113 (M3): una sola tx batch atomica para todos los templates.
      // PLAN-113 (C6): try/catch en add() para ConstraintError de unique [parent+date] (race condition).
      await db.transaction('rw', [db.expenses, db.syncQueue, db.outbox], async () => {
        for (const tpl of dueTemplates) {
          const now = new Date().toISOString();
          const currentRate = tpl.exchangeRate;

          const instance: DexieExpense = {
            id: generateId(),
            tenantId,
            createdByUserId: useAuthStore.getState().session?.userId ?? tpl.createdByUserId ?? 'unknown',
            category: tpl.category,
            amountUsd: tpl.amountUsd,
            exchangeRate: currentRate,
            amountBs: preciseRound(tpl.amountUsd * currentRate, 2),
            description: tpl.description,
            date: today,
            isRecurring: false,
            parentExpenseId: tpl.id,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          };

          try {
            await db.expenses.add(instance);
          } catch (err) {
            // PLAN-113 (C6): ConstraintError del unique [parentExpenseId+date] significa que otra
            // llamada concurrente ya genero la instance para este (template, date). Skip.
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg.includes('parentExpenseId') || errMsg.includes('ConstraintError')) {
              logger.warn(GASTOS_MODULE, 'C6: recurring instance already exists (race), skipping', { tplId: tpl.id, date: today });
              continue;
            }
            throw err; // otro error: propaga
          }
          await syncQueue.enqueue('expenses', 'CREATE', instance.id, toSnake(instance as unknown as Record<string, unknown>), tenantId);
          generated.push(mapExpense(instance));

          const nextDate = new Date(tpl.nextDueDate!);
          if (tpl.recurrenceType === 'monthly') {
            nextDate.setMonth(nextDate.getMonth() + 1);
          } else if (tpl.recurrenceType === 'yearly') {
            nextDate.setFullYear(nextDate.getFullYear() + 1);
          }

          const nextDateStr = nextDate.toISOString().slice(0, 10);
          await db.expenses.update(tpl.id, {
            nextDueDate: nextDateStr,
            updatedAt: now,
          });
          await syncQueue.enqueue('expenses', 'UPDATE', tpl.id, { id: tpl.id, next_due_date: nextDateStr, updated_at: now }, tenantId);
        }
      });

      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const remindingTemplates = await db.expenses
        .where('tenantId')
        .equals(tenantId)
        .filter((e) =>
          !e.deletedAt && e.isRecurring
          && !!e.nextDueDate && e.nextDueDate === tomorrow && e.status !== 'cancelled'
        )
        .toArray();

      const upcoming = remindingTemplates.map((tpl) => ({
        category: tpl.category,
        description: tpl.description,
        id: tpl.id,
        date: tomorrow,
      }));

      // AUDIT-CRUD-010: audit post-tx
      if (generated.length > 0) {
        await emitWithAudit({
          eventName: 'EXPENSES.RECURRING_GENERATED',
          module: 'gastos',
          payload: { count: generated.length, date: today },
          context: { userId: undefined, tenantId },
        });
      }

      return success({ generated, upcoming });
    } catch (err) {
      console.error('[gastosService.checkAndGenerateRecurring]', err);
      return failure(new AppError(GASTOS_ERRORS.GASTOS_RECURRING_FAILED.code, GASTOS_ERRORS.GASTOS_RECURRING_FAILED.message));
    }
  },

  async cancelOccurrence(tenantId: string, templateId: string, occurrenceDate: string): Promise<Result<void, AppError>> {
    // AUDIT-CRUD-009: requireNetwork para consistencia
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    try {
      const db = getDb();
      const instances = await db.expenses
        .where('parentExpenseId')
        .equals(templateId)
        .filter((e) => e.date === occurrenceDate && e.status === 'pending' && e.tenantId === tenantId)
        .toArray();

      if (instances.length === 0) {
        return success(undefined);
      }

      const now = new Date().toISOString();
      // AUDIT-CRUD-009: UNA sola tx que cubre todas las updates de instancias (Regla #17)
      await db.transaction('rw', [db.expenses, db.syncQueue, db.outbox], async () => {
        for (const inst of instances) {
          await db.expenses.update(inst.id, { status: 'cancelled', updatedAt: now });
          await syncQueue.enqueue('expenses', 'UPDATE', inst.id, { id: inst.id, status: 'cancelled', updated_at: now }, tenantId);
          await outboxService.enqueue('EXPENSES.CANCELLED', 'gastos', { expenseId: inst.id, parentExpenseId: templateId });
        }
      });
      // AUDIT-CRUD-009: audit post-tx
      await logAuditEventOnly({
        eventName: 'EXPENSES.CANCELLED',
        module: 'gastos',
        payload: { templateId, occurrenceDate, cancelledCount: instances.length },
        context: { userId: undefined, tenantId },
      });

      return success(undefined);
    } catch (err) {
      console.error('[gastosService.cancelOccurrence]', err);
      return failure(new AppError(GASTOS_ERRORS.GASTOS_CANCEL_FAILED.code, GASTOS_ERRORS.GASTOS_CANCEL_FAILED.message));
    }
  },
};
