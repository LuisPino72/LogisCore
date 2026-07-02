import { type Result, success, failure, AppError, SystemEvents } from '@logiscore/core';
import { preciseRound, toSnake, generateId, MAX_CENTS_DIFFERENCE } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import type { DexieCashRegister, LogisCoreDB } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { syncEngine } from '../../../services/sync/syncEngine';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { isSameDayVzla, startOfDayVzla, endOfDayVzla } from '../../../lib/date';
import { PosErrors } from '../../../specs/pos/errors';
import { cashRegisterFromSupabase } from './mappers';
import type { CashRegister, OpenCashRegisterInput, CloseCashRegisterInput } from '../types';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getPermissionMessage } from '../../auth/permissions/messages';
import { useAuthStore } from '../../auth/stores/authStore';

const MODULE_NAME = 'POS';

export async function autoCloseRegister(
  db: LogisCoreDB,
  register: DexieCashRegister,
  tenantId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
  const expectedClosingBs = preciseRound(
    (register.openingBalanceBs ?? 0) + register.totalSalesBs + (register.collectedDebtBs ?? 0), 2,
  );

  await db.transaction('rw', [db.cashRegisters, db.syncQueue, db.outbox], async (tx) => {
    await db.cashRegisters.update(register.id, {
      isOpen: false,
      closedBy: userId,
      closedAt: now,
      closingBalanceBs: expectedClosingBs,
      closingRate: register.openingRate,
      expectedClosingBs,
      differenceBs: 0,
      updatedAt: now,
    });

    const freshReg = await db.cashRegisters.get(register.id);
    if (!freshReg) throw new Error('Cash register not found after update');

    const autoClosePayload: Record<string, unknown> = {
      id: freshReg.id,
      tenant_id: tenantUuid,
      is_open: false,
      closed_by: userId,
      closed_at: now,
      closing_balance_bs: expectedClosingBs,
      closing_rate: freshReg.openingRate,
      expected_closing_bs: expectedClosingBs,
      difference_bs: 0,
      total_sales_count: freshReg.totalSalesCount,
      total_sales_bs: freshReg.totalSalesBs,
      total_igtf_bs: freshReg.totalIgtfBs,
      collected_debt_bs: freshReg.collectedDebtBs ?? 0,
      updated_at: now,
    };
    if (freshReg.registerId) autoClosePayload.register_id = freshReg.registerId;
    if (freshReg.operatorId) autoClosePayload.operator_id = freshReg.operatorId;
    await syncQueue.enqueue('cash_registers', 'UPDATE', freshReg.id, toSnake(autoClosePayload as Record<string, unknown>), tenantId);

    await outboxService.enqueue(SystemEvents.BOX_CLOSED, MODULE_NAME, {
      registerId: register.id,
      tenantSlug: tenantId,
      expectedBs: expectedClosingBs,
      declaredBs: expectedClosingBs,
      differenceBs: 0,
      autoClosed: true,
    }, tx);
  });

  await logAuditEventOnly({
    eventName: SystemEvents.BOX_CLOSED,
    module: MODULE_NAME,
    payload: {
      registerId: register.id,
      tenantSlug: tenantId,
      expectedBs: expectedClosingBs,
      declaredBs: expectedClosingBs,
      differenceBs: 0,
      autoClosed: true,
    },
    context: {
      userId,
      tenantId,
      tenantUuid,
    },
  });

  syncEngine.pushNow().catch((err) => logger.warn(MODULE_NAME, 'pushNow failed (autoClose):', err));
}

export async function getSessionById(sessionId: string): Promise<Result<CashRegister | null, AppError>> {
  try {
    const db = getDb();
    const row = await db.cashRegisters.get(sessionId);
    if (!row) return success(null);
    return success({
      id: row.id,
      tenantId: row.tenantId,
      isOpen: row.isOpen,
      openedBy: row.openedBy,
      openedAt: row.openedAt,
      openingBalanceBs: row.openingBalanceBs,
      openingRate: row.openingRate,
      closedBy: row.closedBy,
      closedAt: row.closedAt,
      closingBalanceBs: row.closingBalanceBs,
      closingRate: row.closingRate,
      expectedClosingBs: row.expectedClosingBs,
      differenceBs: row.differenceBs,
      totalSalesCount: row.totalSalesCount,
      totalSalesBs: row.totalSalesBs,
      totalIgtfBs: row.totalIgtfBs,
      collectedDebtBs: row.collectedDebtBs ?? 0,
      registerId: row.registerId ?? undefined,
      operatorId: row.operatorId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? null,
    });
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getSessionById:', err);
    return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'Error al consultar la sesión de caja.'));
  }
}

export async function getOpenCashRegister(tenantId: string): Promise<Result<CashRegister | null, AppError>> {
  try {
    const db = getDb();

    const matching = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .sortBy('openedAt');
    let row = matching.length > 0 ? matching[matching.length - 1] : null;

    if (!row) {
      if (!navigator.onLine) return success(null);

      const uuid = await TenantTranslator.slugToUuid(tenantId);
      const { data } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('tenant_id', uuid)
        .is('deleted_at', null)
        .eq('is_open', true)
        .maybeSingle();

      if (data) {
        const result = cashRegisterFromSupabase(data, tenantId);
        if (result.ok) {
          const freshRow = result.data as unknown as DexieCashRegister;
          // Re-check Dexie to avoid race with another tab/instance
          const alreadyStored = freshRow && await db.cashRegisters.get(freshRow.id);
          if (alreadyStored) {
            row = alreadyStored;
          } else {
            const pendingCount = await db.syncQueue
              .where('recordId').equals(freshRow!.id)
              .filter((i) => i.status === 'pending' || i.status === 'failed')
              .count();
            if (pendingCount === 0 && freshRow) {
              await db.cashRegisters.put(freshRow);
              row = freshRow;
            }
          }
        }
      }
    }

    if (!row) return success(null);

    return success({
      id: row.id,
      tenantId: row.tenantId,
      isOpen: row.isOpen,
      openedBy: row.openedBy,
      openedAt: row.openedAt,
      openingBalanceBs: row.openingBalanceBs,
      openingRate: row.openingRate,
      closedBy: row.closedBy,
      closedAt: row.closedAt,
      closingBalanceBs: row.closingBalanceBs,
      closingRate: row.closingRate,
      expectedClosingBs: row.expectedClosingBs,
      differenceBs: row.differenceBs,
      totalSalesCount: row.totalSalesCount,
      totalSalesBs: row.totalSalesBs,
      totalIgtfBs: row.totalIgtfBs,
      collectedDebtBs: row.collectedDebtBs ?? 0,
      registerId: row.registerId ?? undefined,
      operatorId: row.operatorId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? null,
    });
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getOpenCashRegister:', err);
    return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'Error al consultar el estado de la caja.'));
  }
}

export async function getLastClosedCashRegister(tenantId: string): Promise<Result<CashRegister | null, AppError>> {
  try {
    const db = getDb();
    let row = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && !r.isOpen)
      .reverse()
      .first();

    if (!row && navigator.onLine) {
      const uuid = await TenantTranslator.slugToUuid(tenantId);
      const { data } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('tenant_id', uuid)
        .is('deleted_at', null)
        .eq('is_open', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        row = {
          id: data.id as string,
          tenantId,
          isOpen: data.is_open as boolean,
          openedBy: data.opened_by as string | null,
          openedAt: data.opened_at as string | null,
          openingBalanceBs: data.opening_balance_bs as number | null,
          openingRate: data.opening_rate as number | null,
          closedBy: data.closed_by as string | null,
          closedAt: data.closed_at as string | null,
          closingBalanceBs: data.closing_balance_bs as number | null,
          closingRate: data.closing_rate as number | null,
          expectedClosingBs: data.expected_closing_bs as number | null,
          differenceBs: data.difference_bs as number | null,
          totalSalesCount: data.total_sales_count as number,
          totalSalesBs: data.total_sales_bs as number,
          totalIgtfBs: data.total_igtf_bs as number,
          collectedDebtBs: (data.collected_debt_bs as number) ?? 0,
          registerId: (data.register_id as string) ?? undefined,
          operatorId: (data.operator_id as string) ?? undefined,
          createdAt: data.created_at as string,
          updatedAt: data.updated_at as string,
        };
      }
    }

    if (!row) return success(null);
    return success({
      id: row.id, tenantId: row.tenantId, isOpen: row.isOpen,
      openedBy: row.openedBy, openedAt: row.openedAt,
      openingBalanceBs: row.openingBalanceBs, openingRate: row.openingRate,
      closedBy: row.closedBy, closedAt: row.closedAt,
      closingBalanceBs: row.closingBalanceBs, closingRate: row.closingRate,
      expectedClosingBs: row.expectedClosingBs, differenceBs: row.differenceBs,
      totalSalesCount: row.totalSalesCount, totalSalesBs: row.totalSalesBs,
      totalIgtfBs: row.totalIgtfBs,
      collectedDebtBs: row.collectedDebtBs ?? 0,
      registerId: row.registerId ?? undefined,
      operatorId: row.operatorId ?? undefined,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? null,
    });
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getLastClosedCashRegister:', err);
    return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'Error al consultar la última caja cerrada.'));
  }
}

export async function getOpenSessionByRegisterId(registerId: string): Promise<DexieCashRegister | undefined> {
  const db = getDb();
  return db.cashRegisters
    .where({ registerId, isOpen: true })
    .filter((r) => !r.deletedAt)
    .first();
}

export async function openCashRegister(input: OpenCashRegisterInput): Promise<Result<CashRegister, AppError>> {
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  const db = getDb();
  const { tenantId, userId, openingBalanceBs, openingRate, registerId, operatorName } = input;

  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'pos', 'open_box')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', getPermissionMessage('pos', 'open_box')));
  }

  if (!openingBalanceBs || openingBalanceBs <= 0) {
    return failure(new AppError(PosErrors.BOX_OPENING_BALANCE_REQUIRED, 'Debe ingresar un monto inicial para abrir la caja.'));
  }

  if (!openingRate || openingRate <= 0) {
    return failure(new AppError(PosErrors.BOX_OPENING_BALANCE_REQUIRED, 'No hay tasa de cambio disponible. Configure la tasa antes de abrir la caja.'));
  }

  let resolvedRegisterId = registerId;
  if (resolvedRegisterId) {
    const configExists = await db.registerConfigs.get(resolvedRegisterId);
    if (!configExists) {
      return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'La caja seleccionada no existe.'));
    }
  } else {
    const configs = await db.registerConfigs
      .where({ tenantId })
      .filter((c) => c.isActive)
      .toArray();
    if (configs.length === 1) {
      resolvedRegisterId = configs[0].id;
    } else if (configs.length > 1) {
      return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'Hay múltiples cajas configuradas. Selecciona una caja para abrir.'));
    }
  }

  if (resolvedRegisterId) {
    const existing = await db.cashRegisters
      .where({ registerId: resolvedRegisterId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();

    if (existing) {
      const openedDate = existing.openedAt ? new Date(existing.openedAt) : null;
      const operatorLabel = existing.operatorId === userId ? 'ti' : `otro operador`;
      if (openedDate && isSameDayVzla(openedDate, new Date())) {
        return failure(new AppError(PosErrors.BOX_ALREADY_OPEN, `La caja ya está abierta por ${operatorLabel}.`));
      }
      try {
        await autoCloseRegister(db, existing, tenantId, userId);
      } catch {
        return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'Error al cerrar sesión anterior. Intenta de nuevo.'));
      }
    }
  } else {
    const existing = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();

    if (existing) {
      const openedDate = existing.openedAt ? new Date(existing.openedAt) : null;
      if (openedDate && isSameDayVzla(openedDate, new Date())) {
        return failure(new AppError(PosErrors.BOX_ALREADY_OPEN, 'Ya existe una caja abierta para hoy.'));
      }
      try {
        await autoCloseRegister(db, existing, tenantId, userId);
      } catch {
        return failure(new AppError(PosErrors.BOX_QUERY_FAILED, 'Error al cerrar sesión anterior. Intenta de nuevo.'));
      }
    }
  }

  const todayStart = startOfDayVzla();
  const todayEnd = endOfDayVzla();
  const todayClosed = resolvedRegisterId
    ? await db.cashRegisters
      .where({ registerId: resolvedRegisterId })
      .filter((r) => !r.deletedAt && !r.isOpen && r.openedAt != null && r.openedAt >= todayStart && r.openedAt <= todayEnd)
      .first()
    : await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && !r.isOpen && r.openedAt != null && r.openedAt >= todayStart && r.openedAt <= todayEnd)
      .first();

  if (todayClosed) {
    if (todayClosed.totalSalesCount === 0) {
      await db.cashRegisters.update(todayClosed.id, { deletedAt: new Date().toISOString() });
    } else {
      return failure(new AppError(PosErrors.BOX_CLOSED_TODAY, 'Ya hay un cierre de caja registrado para hoy. No puedes abrir otra caja el mismo día.'));
    }
  }

  try {
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    let query = supabase
      .from('cash_registers')
      .select('*')
      .eq('tenant_id', tenantUuid)
      .is('deleted_at', null)
      .eq('is_open', true);
    if (resolvedRegisterId) {
      query = query.eq('register_id', resolvedRegisterId);
    }
    const { data: remoteRegister } = await query.maybeSingle();

    if (remoteRegister) {
      await db.cashRegisters.put({
        id: remoteRegister.id as string,
        tenantId,
        registerId: resolvedRegisterId,
        operatorId: userId,
        isOpen: remoteRegister.is_open as boolean,
        openedBy: remoteRegister.opened_by as string | null,
        openedAt: remoteRegister.opened_at as string | null,
        openingBalanceBs: remoteRegister.opening_balance_bs as number | null,
        openingRate: remoteRegister.opening_rate as number | null,
        closedBy: remoteRegister.closed_by as string | null,
        closedAt: remoteRegister.closed_at as string | null,
        closingBalanceBs: remoteRegister.closing_balance_bs as number | null,
        closingRate: remoteRegister.closing_rate as number | null,
        expectedClosingBs: remoteRegister.expected_closing_bs as number | null,
        differenceBs: remoteRegister.difference_bs as number | null,
        totalSalesCount: remoteRegister.total_sales_count as number,
        totalSalesBs: remoteRegister.total_sales_bs as number,
        totalIgtfBs: remoteRegister.total_igtf_bs as number,
        collectedDebtBs: (remoteRegister.collected_debt_bs as number) ?? 0,
        createdAt: remoteRegister.created_at as string,
        updatedAt: remoteRegister.updated_at as string,
      });
      return failure(new AppError(PosErrors.BOX_ALREADY_OPEN, 'Ya existe una caja abierta en el servidor.'));
    }
  } catch {
    // Remote verification failed, continue with local creation
  }

  const id = generateId();
  const now = new Date().toISOString();
  const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

  try {
    const register = {
      id,
      tenantId,
      isOpen: true,
      openedBy: userId,
      openedAt: now,
      openingBalanceBs,
      openingRate,
      closedBy: null,
      closedAt: null,
      closingBalanceBs: null,
      closingRate: null,
      expectedClosingBs: null,
      differenceBs: null,
      totalSalesCount: 0,
      totalSalesBs: 0,
      totalIgtfBs: 0,
      collectedDebtBs: 0,
      registerId: resolvedRegisterId ?? undefined,
      operatorId: userId,
      operatorName,
      createdAt: now,
      updatedAt: now,
    };

    await db.transaction('rw', [db.cashRegisters, db.syncQueue, db.outbox], async (tx) => {
      await db.cashRegisters.add(register);

      const snakePayload: Record<string, unknown> = {
        id,
        tenant_id: tenantUuid,
        is_open: true,
        opened_by: userId,
        opened_at: now,
        opening_balance_bs: openingBalanceBs,
        opening_rate: openingRate,
        total_sales_count: 0,
        total_sales_bs: 0,
        total_igtf_bs: 0,
        collected_debt_bs: 0,
        created_at: now,
        updated_at: now,
      };
      if (resolvedRegisterId) snakePayload.register_id = resolvedRegisterId;
      if (userId) snakePayload.operator_id = userId;
      if (operatorName) snakePayload.operator_name = operatorName;

      await syncQueue.enqueue('cash_registers', 'CREATE', id, toSnake(snakePayload), tenantId);

      await outboxService.enqueue(SystemEvents.BOX_OPENED, MODULE_NAME, {
        registerId: id,
        tenantSlug: tenantId,
        openingBalanceBs,
        openedBy: userId,
      }, tx);
    });

    await logAuditEventOnly({
      eventName: SystemEvents.BOX_OPENED,
      module: MODULE_NAME,
      payload: { registerId: id, tenantSlug: tenantId, openingBalanceBs, openedBy: userId, registerConfigId: resolvedRegisterId },
      context: { userId, tenantId, tenantUuid },
    });

    syncEngine.pushNow().catch((err) => logger.warn(MODULE_NAME, 'pushNow failed (openCash):', err));

    return success({ ...register, deletedAt: null });
  } catch (err) {
    const errName = (err as { name?: string })?.name ?? '';
    const errMsg = err instanceof Error ? err.message : String(err);
    const isUniqueViolation =
      errName === 'ConstraintError' ||
      errMsg.includes('uq_cash_registers_one_open_per_tenant');

    if (isUniqueViolation) {
      const existingRemote = await db.cashRegisters
        .where({ registerId: resolvedRegisterId })
        .filter((r) => !r.deletedAt && r.isOpen)
        .first();
      if (existingRemote) {
        logger.warn(MODULE_NAME, 'C-8: openCashRegister race detected, returning existing register', { id: existingRemote.id });
        return success({ ...existingRemote });
      }
    }

    logger.error('openCashRegister', 'Error:', err);
    return failure(new AppError('BOX_ALREADY_OPEN', 'Error al abrir la caja.'));
  }
}

export async function closeCashRegister(input: CloseCashRegisterInput): Promise<Result<CashRegister, AppError>> {
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  const db = getDb();
  const { tenantId, userId, declaredClosingBalanceBs, closingRate, sessionId } = input;

  const session = useAuthStore.getState().session;
  if (!session) {
    return failure(new AppError('AUTH_SCOPE_DENIED', getPermissionMessage('pos', 'close_box')));
  }

  let cashReg: DexieCashRegister | undefined;
  if (sessionId) {
    cashReg = await db.cashRegisters.get(sessionId);
  } else {
    cashReg = await db.cashRegisters
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isOpen)
      .first();
  }

  if (!cashReg) {
    return failure(new AppError(PosErrors.BOX_ALREADY_CLOSED, 'La caja ya está cerrada.'));
  }

  const isOwnSession = cashReg.operatorId === userId || cashReg.openedBy === userId;
  const hasClosePermission = hasActionPermission(session, 'pos', 'close_box');
  const hasManagerPermission = hasActionPermission(session, 'pos', 'manager_close');
  if (!isOwnSession && !hasManagerPermission) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para cerrar una caja que no abriste.'));
  }
  if (isOwnSession && !hasClosePermission) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para cerrar la caja.'));
  }

  const now = new Date().toISOString();
  const tenantUuid = await TenantTranslator.slugToUuid(tenantId);

  let expectedClosingBs = 0;
  let differenceBs = 0;

  try {
    await db.transaction('rw', [db.cashRegisters, db.syncQueue, db.outbox], async (tx) => {
      const freshReg = await db.cashRegisters.get(cashReg.id);
      if (!freshReg || !freshReg.isOpen) throw new Error('Cash register not found or already closed');

      expectedClosingBs = preciseRound(
        (freshReg.openingBalanceBs ?? 0) + freshReg.totalSalesBs + (freshReg.collectedDebtBs ?? 0),
        2,
      );

      const rawDiff = preciseRound(declaredClosingBalanceBs - expectedClosingBs, 2);
      differenceBs = Math.abs(rawDiff) <= MAX_CENTS_DIFFERENCE ? 0 : rawDiff;

      await db.cashRegisters.update(cashReg.id, {
        isOpen: false,
        closedBy: userId,
        closedAt: now,
        closingBalanceBs: declaredClosingBalanceBs,
        closingRate,
        expectedClosingBs,
        differenceBs,
        updatedAt: now,
      });

      const closePayload: Record<string, unknown> = {
        id: freshReg.id,
        tenant_id: tenantUuid,
        is_open: false,
        closed_by: userId,
        closed_at: now,
        closing_balance_bs: declaredClosingBalanceBs,
        closing_rate: closingRate,
        expected_closing_bs: expectedClosingBs,
        difference_bs: differenceBs,
        total_sales_count: freshReg.totalSalesCount,
        total_sales_bs: freshReg.totalSalesBs,
        total_igtf_bs: freshReg.totalIgtfBs,
        collected_debt_bs: freshReg.collectedDebtBs ?? 0,
        updated_at: now,
      };
      if (freshReg.registerId) closePayload.register_id = freshReg.registerId;
      if (freshReg.operatorId) closePayload.operator_id = freshReg.operatorId;
      await syncQueue.enqueue('cash_registers', 'UPDATE', freshReg.id, toSnake(closePayload as Record<string, unknown>), tenantId);

      await outboxService.enqueue(SystemEvents.BOX_CLOSED, MODULE_NAME, {
        registerId: cashReg.id,
        tenantSlug: tenantId,
        expectedBs: expectedClosingBs,
        declaredBs: declaredClosingBalanceBs,
        differenceBs,
      }, tx);
    });

    await logAuditEventOnly({
      eventName: SystemEvents.BOX_CLOSED,
      module: MODULE_NAME,
      payload: { registerId: cashReg.id, tenantSlug: tenantId, expectedBs: expectedClosingBs, declaredBs: declaredClosingBalanceBs, differenceBs },
      context: { userId, tenantId, tenantUuid },
    });

    syncEngine.pushNow().catch((err) => logger.warn(MODULE_NAME, 'pushNow failed (closeCash):', err));

    return success({
      id: cashReg.id,
      tenantId: cashReg.tenantId,
      isOpen: false,
      openedBy: cashReg.openedBy,
      openedAt: cashReg.openedAt,
      openingBalanceBs: cashReg.openingBalanceBs,
      openingRate: cashReg.openingRate,
      closedBy: userId,
      closedAt: now,
      closingBalanceBs: declaredClosingBalanceBs,
      closingRate,
      expectedClosingBs,
      differenceBs,
      totalSalesCount: cashReg.totalSalesCount,
      totalSalesBs: cashReg.totalSalesBs,
      totalIgtfBs: cashReg.totalIgtfBs,
      collectedDebtBs: cashReg.collectedDebtBs ?? 0,
      registerId: cashReg.registerId ?? undefined,
      operatorId: cashReg.operatorId ?? undefined,
      createdAt: cashReg.createdAt,
      updatedAt: now,
      deletedAt: null,
    });
  } catch (err) {
    logger.error('closeCashRegister', 'Error:', err);
    return failure(new AppError('BOX_ALREADY_CLOSED', 'Error al cerrar la caja.'));
  }
}
