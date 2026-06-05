/**
 * costCalculator Tests — PRODUCTION-003 [Paso-3]
 * Helper compartido `calculateConsumptionCost` con FIFO real.
 *
 * TDD: 6 tests unitarios (RED → GREEN)
 *   1. FIFO simple (1 lote, consumir todo)
 *   2. FIFO multi-lote (consumir de varios en orden createdAt ASC)
 *   3. Stock insuficiente sin override → INGREDIENT_INSUFFICIENT_STOCK
 *   4. Stock insuficiente con override → success
 *   5. Producto inexistente → INGREDIENT_NOT_FOUND
 *   6. Decimal precision (costPrice=0.333 → redondeado a 2 decimales)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB ─────────────────────────────────────────────

interface SeedLot {
  id: string;
  tenantId: string;
  productId: string;
  quantityAdded: number;
  remainingQuantity: number;
  costUsdPerUnit: number;
  createdAt: string;
  version?: number;
  deletedAt?: string;
}

interface SeedProduct {
  id: string;
  name: string;
}

const productMap = new Map<string, SeedProduct>();
const lotsByProduct = new Map<string, SeedLot[]>();

function seedProduct(p: SeedProduct) {
  productMap.set(p.id, p);
}

function seedLots(productId: string, lots: SeedLot[]) {
  lotsByProduct.set(productId, lots);
}

function resetMockDb() {
  vi.clearAllMocks();
  productMap.clear();
  lotsByProduct.clear();
}

const mockDb = {
  products: {
    get: vi.fn((id: string) => Promise.resolve(productMap.get(id) ?? null)),
  },
  inventoryLots: {
    where: vi.fn(),
  },
};

vi.mock('../../../../services/dexie/db', () => ({
  getDb: () => mockDb,
}));

function applyLots() {
  mockDb.inventoryLots.where.mockImplementation((query: { productId?: string }) => {
    const allLots = query?.productId ? lotsByProduct.get(query.productId) ?? [] : [];
    return {
      filter: vi.fn(() => ({
        sortBy: vi.fn(() => Promise.resolve([...allLots])),
      })),
    };
  });
}

// ── Tests ───────────────────────────────────────────────

describe('PRODUCTION-003 [Paso-3]: costCalculator — calculateConsumptionCost', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('Test 1: FIFO simple — 1 lote, consumir todo retorna totalCost = qty * cost', async () => {
    // Given: 1 lote de 10kg de Harina a $0.50/kg
    seedProduct({ id: 'p-harina', name: 'Harina' });
    seedLots('p-harina', [
      { id: 'lot-1', tenantId: 't1', productId: 'p-harina', quantityAdded: 10, remainingQuantity: 10, costUsdPerUnit: 0.5, createdAt: '2026-06-01T00:00:00Z' },
    ]);
    applyLots();

    const { calculateConsumptionCost } = await import('../costCalculator');

    // When: consumir 10kg
    const result = await calculateConsumptionCost('p-harina', 10);

    // Then: totalCost = 5, consumedLots con 1 detalle
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCost).toBe(5);
      expect(result.data.consumedLots).toHaveLength(1);
      expect(result.data.consumedLots[0]).toEqual({
        lotId: 'lot-1',
        quantity: 10,
        costUsdPerUnit: 0.5,
        costUsd: 5,
      });
    }
  });

  it('Test 2: FIFO multi-lote — consume del más antiguo al más nuevo', async () => {
    // Given: 2 lotes de Harina. Lote 1 (10kg @ $0.50) creado 2026-06-01, Lote 2 (5kg @ $0.60) creado 2026-06-04
    seedProduct({ id: 'p-harina', name: 'Harina' });
    seedLots('p-harina', [
      { id: 'lot-1', tenantId: 't1', productId: 'p-harina', quantityAdded: 10, remainingQuantity: 10, costUsdPerUnit: 0.5, createdAt: '2026-06-01T00:00:00Z' },
      { id: 'lot-2', tenantId: 't1', productId: 'p-harina', quantityAdded: 5, remainingQuantity: 5, costUsdPerUnit: 0.6, createdAt: '2026-06-04T00:00:00Z' },
    ]);
    applyLots();

    const { calculateConsumptionCost } = await import('../costCalculator');

    // When: consumir 12kg
    const result = await calculateConsumptionCost('p-harina', 12);

    // Then: totalCost = 5 + 1.20 = 6.20; consume 10kg de Lote 1 + 2kg de Lote 2
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCost).toBe(6.2);
      expect(result.data.consumedLots).toHaveLength(2);
      const lote1 = result.data.consumedLots.find((c) => c.lotId === 'lot-1');
      const lote2 = result.data.consumedLots.find((c) => c.lotId === 'lot-2');
      expect(lote1?.quantity).toBe(10);
      expect(lote1?.costUsd).toBe(5);
      expect(lote2?.quantity).toBe(2);
      expect(lote2?.costUsd).toBe(1.2);
    }
  });

  it('Test 3: Stock insuficiente sin override retorna INGREDIENT_INSUFFICIENT_STOCK', async () => {
    // Given: 1 lote de 2kg a $0.50/kg
    seedProduct({ id: 'p-harina', name: 'Harina' });
    seedLots('p-harina', [
      { id: 'lot-1', tenantId: 't1', productId: 'p-harina', quantityAdded: 2, remainingQuantity: 2, costUsdPerUnit: 0.5, createdAt: '2026-06-01T00:00:00Z' },
    ]);
    applyLots();

    const { calculateConsumptionCost } = await import('../costCalculator');

    // When: intentar consumir 5kg
    const result = await calculateConsumptionCost('p-harina', 5);

    // Then: failure con INGREDIENT_INSUFFICIENT_STOCK
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PRODUCTION_INGREDIENT_INSUFFICIENT_STOCK');
    }
  });

  it('Test 4: Stock insuficiente con override=true retorna success consumiendo solo lo disponible', async () => {
    // Given: 1 lote de 2kg a $0.50/kg
    seedProduct({ id: 'p-harina', name: 'Harina' });
    seedLots('p-harina', [
      { id: 'lot-1', tenantId: 't1', productId: 'p-harina', quantityAdded: 2, remainingQuantity: 2, costUsdPerUnit: 0.5, createdAt: '2026-06-01T00:00:00Z' },
    ]);
    applyLots();

    const { calculateConsumptionCost } = await import('../costCalculator');

    // When: consumir 5kg con allowOverride=true
    const result = await calculateConsumptionCost('p-harina', 5, { allowOverride: true });

    // Then: success con totalCost = 1 (solo 2kg disponibles)
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCost).toBe(1);
      expect(result.data.consumedLots).toHaveLength(1);
      expect(result.data.consumedLots[0].quantity).toBe(2);
    }
  });

  it('Test 5: Producto inexistente retorna INGREDIENT_NOT_FOUND', async () => {
    // Given: productMap vacío
    applyLots();

    const { calculateConsumptionCost } = await import('../costCalculator');

    // When: consumir de productId inexistente
    const result = await calculateConsumptionCost('p-inexistente', 5);

    // Then: failure con INGREDIENT_NOT_FOUND
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PRODUCTION_INGREDIENT_NOT_FOUND');
    }
  });

  it('Test 6: Decimal precision — costPrice=0.333 → totalCost redondeado a 2 decimales', async () => {
    // Given: 1 lote de 3 unidades a $0.333/unidad
    seedProduct({ id: 'p-queso', name: 'Queso' });
    seedLots('p-queso', [
      { id: 'lot-1', tenantId: 't1', productId: 'p-queso', quantityAdded: 3, remainingQuantity: 3, costUsdPerUnit: 0.333, createdAt: '2026-06-01T00:00:00Z' },
    ]);
    applyLots();

    const { calculateConsumptionCost } = await import('../costCalculator');

    // When: consumir 3 unidades (3 * 0.333 = 0.999)
    const result = await calculateConsumptionCost('p-queso', 3);

    // Then: totalCost redondeado a 1.00 (Regla #6: 2 decimales)
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Math.round(0.999 * 100) / 100 = 100/100 = 1
      expect(result.data.totalCost).toBe(1);
      expect(result.data.consumedLots[0].costUsd).toBe(1);
    }
  });
});
