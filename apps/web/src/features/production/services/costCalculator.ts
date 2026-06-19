/**
 * costCalculator — PRODUCTION-003 [Paso-3]
 * Helper compartido de consumo FIFO real.
 *
 * Usado por:
 *  - productionService.createOrder (batch): calcula costPerProducedUnit.
 *  - productionService.consumeForAssembly (assembly): calcula costUsdPerConsumedUnit.
 *  - productionService.consumeFifoInternal: aplica escrituras con optimistic locking.
 *
 * IMPORTANTE: este helper SOLO LEE la DB. NO escribe. El caller es responsable
 * de aplicar el consumo a los lotes (reducir remainingQuantity, incrementar version).
 * Esto facilita el testing puro y mantiene al helper libre de side effects.
 */
import { type Result, success, failure, AppError } from '@logiscore/core';
import { getDb } from '../../../services/dexie/db';
import { useAuthStore } from '../../auth/stores/authStore';
import { ProductionErrors } from '../../../specs/production/errors';

export interface ConsumptionDetail {
  lotId: string;
  quantity: number;
  costUsdPerUnit: number;
  costUsd: number;
  // PLAN-115 (CODE-MED-9): version del lote al momento de la lectura, para que el
  // caller detecte races via optimistic lock (mismo patron que posService:562).
  version: number;
}

export interface ConsumptionResult {
  totalCost: number;
  consumedLots: ConsumptionDetail[];
}

/**
 * Plan de consumo FIFO — qué lotes consumir y cuánto de cada uno.
 * Devuelto por `selectFifoLots` para ser usado tanto por cálculo de costo (solo lectura)
 * como por escritura real con optimistic locking.
 */
export interface FifoLotPlan {
  lotId: string;
  quantity: number;
  costUsdPerUnit: number;
  version: number;
}

/**
 * Selecciona los lotes FIFO para consumir una cantidad dada.
 * SOLO LEE la DB — no escribe. Devuelve el plan de consumo para que el caller
 * decida qué hacer con él (calcular costo, o aplicar escrituras con optimistic locking).
 *
 * @param productId      ID del producto a consumir.
 * @param quantityNeeded Cantidad total a consumir (en storage units: g, ml, unidades).
 * @param tenantId       Tenant ID para filtrar lotes (multi-tenant).
 * @param options.allowOverride Si true, permite plan aunque no haya stock suficiente.
 * @returns Result con plan de consumo: Array<{ lotId, quantity, costUsdPerUnit, version }>.
 */
export async function selectFifoLots(
  productId: string,
  quantityNeeded: number,
  tenantId: string,
  options: { allowOverride?: boolean } = {},
): Promise<Result<FifoLotPlan[], AppError>> {
  const { allowOverride = false } = options;
  const db = getDb();

  // 1. Validar que el producto exista (puede ser materia prima o sub-receta).
  const product = await db.products.where({ id: productId, tenantId }).first();
  if (!product) {
    return failure(
      new AppError(ProductionErrors.INGREDIENT_NOT_FOUND, `Producto ${productId} no encontrado.`),
    );
  }

  // 2. Obtener lotes disponibles del tenant, orden FIFO (createdAt ASC).
  const lots = await db.inventoryLots
    .where({ tenantId, productId })
    .filter((l) => l.deletedAt == null && l.remainingQuantity > 0)
    .sortBy('createdAt');

  // 3. Validar stock suficiente (a menos que sea override manual).
  const totalAvailable = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
  if (!allowOverride && totalAvailable < quantityNeeded) {
    return failure(
      new AppError(
        ProductionErrors.INGREDIENT_INSUFFICIENT_STOCK,
        `Stock insuficiente de "${product.name ?? productId}": ${totalAvailable} < ${quantityNeeded}`,
      ),
    );
  }

  // 4. Construir plan FIFO: del más antiguo al más nuevo.
  let remaining = quantityNeeded;
  const plan: FifoLotPlan[] = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const consumeQty = Math.min(lot.remainingQuantity, remaining);
    plan.push({
      lotId: lot.id,
      quantity: consumeQty,
      costUsdPerUnit: lot.costUsdPerUnit ?? 0,
      version: lot.version ?? 0,
    });
    remaining -= consumeQty;
  }

  return success(plan);
}

/**
 * Calcula el costo de consumir una cantidad de un producto usando FIFO real
 * sobre los `inventoryLots` disponibles (ordenados por createdAt ASC).
 *
 * @param productId      ID del producto a consumir (materia prima o sub-receta).
 * @param quantityNeeded Cantidad total a consumir (en storage units: g, ml, unidades).
 * @param options.allowOverride Si true, permite consumir aunque no haya stock
 *                              suficiente (solo para override manual del bodeguero).
 *                              En ese caso, consume lo máximo disponible.
 * @returns Result con { totalCost, consumedLots[] } redondeado a 2 decimales (Regla #6).
 */
export async function calculateConsumptionCost(
  productId: string,
  quantityNeeded: number,
  options: { allowOverride?: boolean } = {},
): Promise<Result<ConsumptionResult, AppError>> {
  const session = useAuthStore.getState().session;
  const tenantId = session?.tenantId;

  if (!tenantId) {
    return failure(new AppError('TENANT_REQUIRED', 'No hay tenant en sesión.'));
  }

  const planResult = await selectFifoLots(productId, quantityNeeded, tenantId, options);
  if (!planResult.ok) return planResult;

  // Calcular costos sobre el plan
  let totalCost = 0;
  const consumedLots: ConsumptionDetail[] = [];

  for (const item of planResult.data) {
    const costUsd = item.quantity * item.costUsdPerUnit;
    totalCost += costUsd;
    consumedLots.push({
      lotId: item.lotId,
      quantity: item.quantity,
      costUsdPerUnit: item.costUsdPerUnit,
      costUsd,
      version: item.version,
    });
  }

  // 5. Redondear totalCost a 2 decimales (Regla #6 — precisión fiscal).
  const roundedTotal = Math.round(totalCost * 100) / 100;
  return success({
    totalCost: roundedTotal,
    consumedLots: consumedLots.map((d) => ({
      lotId: d.lotId,
      quantity: d.quantity,
      costUsdPerUnit: d.costUsdPerUnit,
      costUsd: Math.round(d.costUsd * 100) / 100,
      version: d.version,
    })),
  });
}
