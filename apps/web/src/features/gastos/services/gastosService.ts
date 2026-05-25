import { type Result, success, failure, AppError } from '@logiscore/core';
import { getDb, type DexieExpense } from '../../../services/dexie/db';
import { preciseRound, generateId } from '@logiscore/shared';
import type { Gasto, CreateGastoInput, UpdateGastoInput } from '../types';

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
        .filter((e) => !e.deletedAt);

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
      return failure(new AppError('GASTOS_FETCH_FAILED', 'Error al obtener gastos.'));
    }
  },

  async getById(_tenantId: string, id: string): Promise<Result<Gasto | null, AppError>> {
    try {
      const db = getDb();
      const expense = await db.expenses.get(id);
      if (!expense || expense.deletedAt) return success(null);
      return success(mapExpense(expense));
    } catch (err) {
      console.error('[gastosService.getById]', err);
      return failure(new AppError('GASTOS_FETCH_FAILED', 'Error al obtener el gasto.'));
    }
  },

  async create(tenantId: string, userId: string, input: CreateGastoInput): Promise<Result<Gasto, AppError>> {
    try {
      const db = getDb();
      const now = new Date().toISOString();
      const amountBs = preciseRound(input.amountUsd * input.exchangeRate, 2);

      const expense: DexieExpense = {
        id: generateId(),
        tenantId,
        createdByUserId: userId,
        category: input.category,
        amountUsd: input.amountUsd,
        exchangeRate: input.exchangeRate,
        amountBs,
        description: input.description,
        date: input.date,
        isRecurring: input.isRecurring,
        recurrenceType: input.isRecurring ? input.recurrenceType ?? 'monthly' : undefined,
        nextDueDate: input.isRecurring ? input.date : undefined,
        status: input.status ?? 'paid',
        createdAt: now,
        updatedAt: now,
      };

      await db.expenses.add(expense);
      return success(mapExpense(expense));
    } catch (err) {
      console.error('[gastosService.create]', err);
      return failure(new AppError('GASTOS_CREATE_FAILED', 'Error al crear el gasto.'));
    }
  },

  async update(tenantId: string, id: string, input: UpdateGastoInput): Promise<Result<Gasto, AppError>> {
    try {
      const db = getDb();
      const existing = await db.expenses.get(id);
      if (!existing || existing.deletedAt || existing.tenantId !== tenantId) {
        return failure(new AppError('GASTOS_NOT_FOUND', 'Gasto no encontrado.'));
      }

      const now = new Date().toISOString();
      const updated: Partial<DexieExpense> = {
        ...input,
        amountBs: input.amountUsd !== undefined && input.exchangeRate !== undefined
          ? preciseRound(input.amountUsd * input.exchangeRate, 2)
          : input.amountBs ?? existing.amountBs,
        updatedAt: now,
      };

      await db.expenses.update(id, updated);
      const result = await db.expenses.get(id);
      return success(mapExpense(result!));
    } catch (err) {
      console.error('[gastosService.update]', err);
      return failure(new AppError('GASTOS_UPDATE_FAILED', 'Error al actualizar el gasto.'));
    }
  },

  async remove(tenantId: string, id: string): Promise<Result<void, AppError>> {
    try {
      const db = getDb();
      const existing = await db.expenses.get(id);
      if (!existing || existing.deletedAt || existing.tenantId !== tenantId) {
        return failure(new AppError('GASTOS_NOT_FOUND', 'Gasto no encontrado.'));
      }
      const now = new Date().toISOString();
      await db.expenses.update(id, { deletedAt: now, updatedAt: now });
      return success(undefined);
    } catch (err) {
      console.error('[gastosService.remove]', err);
      return failure(new AppError('GASTOS_DELETE_FAILED', 'Error al eliminar el gasto.'));
    }
  },

  async getRecurringTemplates(tenantId: string): Promise<Result<Gasto[], AppError>> {
    try {
      const db = getDb();
      const templates = await db.expenses
        .where('tenantId')
        .equals(tenantId)
        .filter((e) => !e.deletedAt && e.isRecurring)
        .toArray();
      const sorted = templates
        .sort((a, b) => (a.nextDueDate ?? '').localeCompare(b.nextDueDate ?? ''))
        .map(mapExpense);
      return success(sorted);
    } catch (err) {
      console.error('[gastosService.getRecurringTemplates]', err);
      return failure(new AppError('GASTOS_FETCH_FAILED', 'Error al obtener gastos recurrentes.'));
    }
  },

  async checkAndGenerateRecurring(tenantId: string): Promise<Result<Gasto[], AppError>> {
    try {
      const db = getDb();
      const today = new Date().toISOString().slice(0, 10);

      const dueTemplates = await db.expenses
        .where('tenantId')
        .equals(tenantId)
        .filter((e) =>
          !e.deletedAt && e.isRecurring
          && !!e.nextDueDate && e.nextDueDate! <= today && e.status !== 'cancelled'
        )
        .toArray();

      const generated: Gasto[] = [];

      for (const tpl of dueTemplates) {
        const now = new Date().toISOString();
        const currentRate = tpl.exchangeRate;

        const instance: DexieExpense = {
          id: generateId(),
          tenantId,
          createdByUserId: tpl.createdByUserId,
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

        await db.expenses.add(instance);
        generated.push(mapExpense(instance));

        const nextDate = new Date(tpl.nextDueDate!);
        if (tpl.recurrenceType === 'monthly') {
          nextDate.setMonth(nextDate.getMonth() + 1);
        } else if (tpl.recurrenceType === 'yearly') {
          nextDate.setFullYear(nextDate.getFullYear() + 1);
        }

        await db.expenses.update(tpl.id, {
          nextDueDate: nextDate.toISOString().slice(0, 10),
          updatedAt: now,
        });
      }

      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const remindingTemplates = await db.expenses
        .where('tenantId')
        .equals(tenantId)
        .filter((e) =>
          !e.deletedAt && e.isRecurring
          && !!e.nextDueDate && e.nextDueDate === tomorrow && e.status !== 'cancelled'
        )
        .toArray();

      for (const tpl of remindingTemplates) {
        const { useNotificationStore } = await import('../../../stores/notificationStore');
        useNotificationStore.getState().addNotification({
          type: 'recurring_expense_reminder',
          title: 'Gasto recurrente próximo',
          message: `${tpl.category} - ${tpl.description || 'Sin descripción'} vence mañana`,
          actionLabel: 'Cancelar ocurrencia',
          actionPayload: { expenseId: tpl.id, date: tomorrow },
        });
      }

      return success(generated);
    } catch (err) {
      console.error('[gastosService.checkAndGenerateRecurring]', err);
      return failure(new AppError('GASTOS_RECURRING_FAILED', 'Error al generar gastos recurrentes.'));
    }
  },

  async getMonthlyOperatingExpenses(tenantId: string, startDate: string, endDate: string): Promise<Result<{ totalUsd: number; totalBs: number }, AppError>> {
    try {
      const db = getDb();
      const expenses = await db.expenses
        .where('[tenantId+date]')
        .between([tenantId, startDate], [tenantId, endDate])
        .filter((e) => !e.deletedAt && !e.isRecurring && e.status === 'paid')
        .toArray();

      const totalUsd = expenses.reduce((s, e) => s + e.amountUsd, 0);
      const totalBs = expenses.reduce((s, e) => s + e.amountBs, 0);

      return success({ totalUsd: preciseRound(totalUsd, 2), totalBs: preciseRound(totalBs, 2) });
    } catch (err) {
      console.error('[gastosService.getMonthlyOperatingExpenses]', err);
      return failure(new AppError('GASTOS_FETCH_FAILED', 'Error al obtener gastos operativos.'));
    }
  },

  async cancelOccurrence(_tenantId: string, templateId: string, occurrenceDate: string): Promise<Result<void, AppError>> {
    try {
      const db = getDb();
      const instances = await db.expenses
        .where('parentExpenseId')
        .equals(templateId)
        .filter((e) => e.date === occurrenceDate && e.status === 'pending')
        .toArray();

      for (const inst of instances) {
        await db.expenses.update(inst.id, { status: 'cancelled', updatedAt: new Date().toISOString() });
      }

      return success(undefined);
    } catch (err) {
      console.error('[gastosService.cancelOccurrence]', err);
      return failure(new AppError('GASTOS_CANCEL_FAILED', 'Error al cancelar la ocurrencia.'));
    }
  },
};
