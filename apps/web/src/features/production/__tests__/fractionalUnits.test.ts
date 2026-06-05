/**
 * Production Service Tests — BUGFIX-MATHCEIL-001
 * TDD: Sub-unidades de producción (fracciones kg/lt/ml/g)
 *
 * Escenarios BDD (Bug Report):
 *   A. Assembly con 0.5 kg de Harina descuenta 0.5 kg (NO 1 kg)
 *   B. Batch con 0.3 kg de Harina descuenta 0.3 kg (NO 1 kg)
 *   C. Proporcionalidad: 0.5 kg vs 1 kg cuestan exactamente 2×
 *   D. calculateRecipeCost con isWeighted=true coincide con createOrder
 *   E. cancelOrder con 0.5 kg revierte 0.5 kg (no 1 kg)
 *
 * NOTA TÉCNICA — BUGFIX-MATHCEIL-001:
 * El sistema de producción opera en storage units (g para kg, ml para lt).
 * Por lo tanto, después del fix:
 *   - recipeQtyToStorage(0.5, 'kg', 'kg') = 500 g
 *   - consumedLots[0].quantity se reporta en g
 *   - product.stock se mantiene en g (consistente con inventoryService.ts:170)
 *
 * El plan de fix describe las expectations en kg (0.5 kg) como lenguaje natural.
 * Las expectations técnicas de este archivo usan g (500 g) para coincidir con
 * la implementación real del helper recipeQtyToStorage y del sistema de inventario.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB ─────────────────────────────────────────────

const mockDb = {
  products: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  recipes: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  recipeLines: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  productionOrders: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  inventoryMovements: { get: vi.fn(), add: vi.fn(), where: vi.fn() },
  inventoryLots: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  syncQueue: { enqueue: vi.fn() },
  outbox: { add: vi.fn() },
  transaction: vi.fn((_mode: unknown, _tables: unknown[], fn: () => Promise<void>) => fn()),
};

function resetMockDb() {
  vi.clearAllMocks();
  mockDb.products.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), first: vi.fn(() => Promise.resolve(null)) })),
  });
  mockDb.recipes.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), first: vi.fn(() => Promise.resolve(null)) })),
  });
  mockDb.recipeLines.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), sortBy: vi.fn(() => Promise.resolve([])) })),
  });
  // productionOrders.where: se reasigna por test con applyProductionOrdersMock()
  mockDb.productionOrders.where.mockReturnValue({
    filter: vi.fn(() => ({
      count: vi.fn(() => Promise.resolve(0)),
      first: vi.fn(() => Promise.resolve(null)),
    })),
  });
  mockDb.inventoryLots.where.mockReturnValue({
    filter: vi.fn(() => ({ sortBy: vi.fn(() => Promise.resolve([])), toArray: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.products.get.mockResolvedValue(null);
  mockDb.recipes.get.mockResolvedValue(null);
  mockDb.recipeLines.get.mockResolvedValue(null);
  mockDb.inventoryLots.get.mockResolvedValue(null);
  mockDb.syncQueue.enqueue.mockResolvedValue(undefined);
  mockDb.outbox.add.mockResolvedValue(undefined);
}

vi.mock('../../../services/dexie/db', () => ({
  getDb: () => mockDb,
  isDbReady: () => true,
}));

vi.mock('../../../services/sync/syncQueue', () => ({
  syncQueue: { enqueue: vi.fn() },
}));

vi.mock('../../../services/audit/emitWithAudit', () => ({
  emitWithPersistence: vi.fn(() => ({
    enqueueInTransaction: vi.fn(),
    auditAfterTransaction: vi.fn(),
  })),
}));

vi.mock('../../../services/network/requireNetwork', () => ({
  requireNetwork: () => ({ ok: true, data: undefined }),
}));

vi.mock('../../../services/tenantTranslator', () => ({
  TenantTranslator: { slugToUuid: vi.fn(() => Promise.resolve('tenant-uuid')) },
}));

// ── Helpers de seed ─────────────────────────────────────

interface SeedProduct {
  id: string;
  name: string;
  productType: 'materia_prima' | 'producto_terminado' | 'both';
  unit?: string;
  stock?: number;
  costPrice?: number;
  isWeighted?: boolean;
}

interface SeedRecipe {
  id: string;
  productId: string;
  mode?: 'batch' | 'assembly';
  isActive?: boolean;
  yieldQuantity?: number;
  yieldUnit?: string;
  wastePct?: number;
  lines: Array<{ productId: string; quantity: number; unit: string }>;
}

const productMap = new Map<string, SeedProduct>();
const recipeMap = new Map<string, SeedRecipe>();
const linesByRecipe = new Map<string, SeedRecipe['lines']>();

function seedProduct(p: SeedProduct) { productMap.set(p.id, p); }
function seedRecipe(r: SeedRecipe) {
  const recipeWithDefaults: SeedRecipe = { isActive: true, ...r };
  recipeMap.set(r.id, recipeWithDefaults);
  linesByRecipe.set(r.id, r.lines);
}

function applySeeds() {
  function buildRecipeObject(r: ReturnType<typeof recipeMap.get>) {
    if (!r) return null;
    return {
      id: r.id,
      tenantId: 'test-tenant',
      name: `Recipe ${r.id}`,
      productId: r.productId,
      mode: r.mode ?? 'batch',
      yieldQuantity: r.yieldQuantity ?? 1,
      yieldUnit: r.yieldUnit ?? 'unidad',
      wastePct: r.wastePct ?? 0,
      isActive: r.isActive ?? true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
  }
  // Mantener el stock actualizado después de cada update (mock stateful)
  mockDb.products.get.mockImplementation((id: string) => Promise.resolve(productMap.get(id) ?? null));
  mockDb.products.update.mockImplementation((id: string, patch: Record<string, unknown>) => {
    const existing = productMap.get(id);
    if (existing) {
      productMap.set(id, { ...existing, ...patch } as SeedProduct);
    }
    return Promise.resolve(undefined);
  });
  mockDb.recipes.get.mockImplementation((id: string) => Promise.resolve(buildRecipeObject(recipeMap.get(id))));
  mockDb.recipeLines.where.mockImplementation((query: { recipeId?: string }) => {
    const lines = (query?.recipeId ? linesByRecipe.get(query.recipeId) ?? [] : []).map((l, i) => ({
      id: `line-${query?.recipeId}-${i}`,
      tenantId: 'test-tenant',
      recipeId: query?.recipeId,
      productId: l.productId,
      quantity: l.quantity,
      unit: l.unit,
      sortOrder: i,
      createdAt: '2026-01-01T00:00:00Z',
    }));
    return {
      filter: vi.fn(() => ({
        toArray: vi.fn(() => Promise.resolve(lines)),
        sortBy: vi.fn(() => Promise.resolve(lines)),
      })),
    };
  });
  mockDb.recipes.where.mockImplementation((query: { productId?: string }) => {
    const matchingRecipes = Array.from(recipeMap.values()).filter((r) => !query?.productId || r.productId === query.productId);
    return {
      filter: vi.fn((fn: (r: { isActive?: boolean; deletedAt?: string }) => boolean) => {
        const filtered = matchingRecipes.filter((r) => fn({ isActive: r.isActive ?? true, deletedAt: undefined }));
        const filteredWrapped = filtered.map(buildRecipeObject);
        return {
          toArray: vi.fn(() => Promise.resolve(filteredWrapped)),
          first: vi.fn(() => Promise.resolve(filteredWrapped[0] ?? null)),
        };
      }),
    };
  });
  mockDb.products.where.mockImplementation((query: { id?: string; tenantId?: string }) => {
    return {
      filter: vi.fn(() => {
        const found = query?.id ? productMap.get(query.id) : null;
        return {
          toArray: vi.fn(() => Promise.resolve(found ? [found] : [])),
          first: vi.fn(() => Promise.resolve(found ?? null)),
        };
      }),
    };
  });
}

// productionOrders tracking para cancelOrder
const productionOrdersMap = new Map<string, Record<string, unknown>>();
function applyProductionOrdersMock() {
  mockDb.productionOrders.where.mockImplementation((query: { tenantId?: string; id?: string }) => {
    return {
      filter: vi.fn((fn: (o: { deletedAt?: string }) => boolean) => {
        const matches = Array.from(productionOrdersMap.values()).filter(
          (o) => (!query?.tenantId || o.tenantId === query.tenantId) && (!query?.id || o.id === query.id),
        );
        const filtered = matches.filter((o) => fn({ deletedAt: o.deletedAt as string | undefined }));
        return {
          first: vi.fn(() => Promise.resolve(filtered[0] ?? null)),
          toArray: vi.fn(() => Promise.resolve(filtered)),
          count: vi.fn(() => Promise.resolve(filtered.length)),
        };
      }),
    };
  });
  // Capturar órdenes creadas en productionOrders.add
  mockDb.productionOrders.add.mockImplementation((order: Record<string, unknown>) => {
    productionOrdersMap.set(order.id as string, order);
    return Promise.resolve(undefined);
  });
}

// ── Tests ───────────────────────────────────────────────

describe('BUGFIX-MATHCEIL-001: Sub-unidades de producción (fracciones)', () => {
  beforeEach(() => {
    resetMockDb();
    productMap.clear();
    recipeMap.clear();
    linesByRecipe.clear();
  });

  it('Test A: Assembly con 0.5 kg de Harina descuenta 0.5 kg (NO 1 kg) — 500 g consumidos, no 1000 g', async () => {
    // Given: Harina stock=15000 g (15 kg) con costPrice=$0.50/kg
    // Receta Combo: 0.5 kg de Harina, mode=assembly
    const comboUuid = '00000000-0000-6000-8000-000000000001';
    const harinaUuid = '00000000-0000-6000-8000-000000000002';
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'kg', stock: 15000, isWeighted: true, costPrice: 0.5 });
    seedProduct({ id: comboUuid, name: 'Combo-desayuno', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: 'r-combo-asm-bugfix',
      productId: comboUuid,
      mode: 'assembly',
      yieldQuantity: 1,
      yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 0.5, unit: 'kg' }],
    });
    applySeeds();
    // Lote en storage units (g): 10 kg @ $0.50/kg = $0.0005/g
    mockDb.inventoryLots.where.mockImplementation((query: { productId?: string }) => {
      const lots = query?.productId === harinaUuid ? [
        { id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 10000, remainingQuantity: 10000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 },
      ] : [];
      return {
        filter: vi.fn(() => ({
          sortBy: vi.fn(() => Promise.resolve([...lots])),
          toArray: vi.fn(() => Promise.resolve([...lots])),
        })),
      };
    });
    mockDb.inventoryLots.get.mockImplementation((id: string) => {
      if (id === 'lot-1') {
        return Promise.resolve({ id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 10000, remainingQuantity: 10000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 });
      }
      return Promise.resolve(null);
    });

    const { productionService } = await import('../services/productionService');

    // When: ensamblar 1 combo (receta dice 0.5 kg → recipeQtyToStorage = 500 g)
    const result = await productionService.consumeForAssembly(comboUuid, 1, 'test-tenant', 'user-1');

    // Then: success, consumedLots[0].quantity === 500 (g), no 1000 (g del bug Math.ceil(1))
    expect(result.ok).toBe(true);
    if (!result.ok) console.error('A result.error:', result.error);
    if (result.ok) {
      expect(result.data.consumedLots).toHaveLength(1);
      expect(result.data.consumedLots[0].lotId).toBe('lot-1');
      expect(result.data.consumedLots[0].quantity).toBe(500); // 0.5 kg = 500 g, NO 1000 g del bug
      expect(result.data.totalIngredientCost).toBe(0.25); // 500 g × $0.0005/g = $0.25
    }
    // Verificar que el stock de Harina bajó a 14500 g (NO 14000 g del bug)
    const harinaUpdate = mockDb.products.update.mock.calls.find((c) => c[0] === harinaUuid);
    expect(harinaUpdate).toBeDefined();
    if (harinaUpdate) {
      const newStock = (harinaUpdate[1] as { stock: number }).stock;
      expect(newStock).toBe(14500); // 15000 g - 500 g = 14500 g, NO 14000 g
    }
  });

  it('Test B: Batch con 0.3 kg de Harina descuenta 0.3 kg — 300 g consumidos, no 1000 g', async () => {
    // Given: Harina stock=15000 g; Receta Pan: 0.3 kg por pan, mode=batch
    const panUuid = '00000000-0000-6000-8000-000000000010';
    const harinaUuid = '00000000-0000-6000-8000-000000000011';
    const recipePanUuid = '00000000-0000-6000-8000-000000000012';
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'kg', stock: 15000, isWeighted: true, costPrice: 0.5 });
    seedProduct({ id: panUuid, name: 'Pan', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: recipePanUuid,
      productId: panUuid,
      mode: 'batch',
      yieldQuantity: 1,
      yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 0.3, unit: 'kg' }],
    });
    applySeeds();
    mockDb.inventoryLots.where.mockImplementation((query: { productId?: string }) => {
      const lots = query?.productId === harinaUuid ? [
        { id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 10000, remainingQuantity: 10000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 },
      ] : [];
      return {
        filter: vi.fn(() => ({
          sortBy: vi.fn(() => Promise.resolve([...lots])),
          toArray: vi.fn(() => Promise.resolve([...lots])),
        })),
      };
    });
    mockDb.inventoryLots.get.mockImplementation((id: string) => {
      if (id === 'lot-1') {
        return Promise.resolve({ id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 10000, remainingQuantity: 10000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 });
      }
      return Promise.resolve(null);
    });

    const { productionService } = await import('../services/productionService');

    // When: producir 1 pan (receta dice 0.3 kg → recipeQtyToStorage = 300 g)
    const result = await productionService.createOrder('test-tenant', 'user-1', {
      recipeId: recipePanUuid,
      batchCount: 1,
      plannedDate: '2026-06-05',
    });

    // Then: success, costPerProducedUnit consistente con 300 g × $0.0005/g = $0.15
    expect(result.ok).toBe(true);
    if (!result.ok) console.error('B result.error:', result.error);
    // Verificar lote del pan con costUsdPerUnit = $0.15/pan
    const finishedLot = mockDb.inventoryLots.add.mock.calls
      .map((c) => c[0])
      .find((lot) => (lot as { productId?: string }).productId === panUuid) as { costUsdPerUnit: number; quantityAdded: number } | undefined;
    expect(finishedLot).toBeDefined();
    if (finishedLot) {
      expect(finishedLot.costUsdPerUnit).toBe(0.15); // 300 g × $0.0005/g = $0.15
      expect(finishedLot.quantityAdded).toBe(1);
    }
    // Verificar consumo del lote: 300 g (NO 1000 g del bug)
    const lotUpdate = mockDb.inventoryLots.update.mock.calls.find((c) => c[0] === 'lot-1');
    expect(lotUpdate).toBeDefined();
    if (lotUpdate) {
      const newRemaining = (lotUpdate[1] as { remainingQuantity: number }).remainingQuantity;
      expect(newRemaining).toBe(9700); // 10000 g - 300 g = 9700 g
    }
  });

  it('Test C: Proporcionalidad — 0.5 kg cuesta la mitad que 1 kg (mismo producto, mismo costo)', async () => {
    // Given: Harina stock=20000 g, costPrice=$0.50/kg; Combo A (0.5 kg) + Combo B (1 kg)
    const comboAUuid = '00000000-0000-6000-8000-000000000020';
    const comboBUuid = '00000000-0000-6000-8000-000000000021';
    const harinaUuid = '00000000-0000-6000-8000-000000000022';
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'kg', stock: 20000, isWeighted: true, costPrice: 0.5 });
    seedProduct({ id: comboAUuid, name: 'ComboA', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedProduct({ id: comboBUuid, name: 'ComboB', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: 'r-comboA-asm', productId: comboAUuid, mode: 'assembly',
      yieldQuantity: 1, yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 0.5, unit: 'kg' }],
    });
    seedRecipe({
      id: 'r-comboB-asm', productId: comboBUuid, mode: 'assembly',
      yieldQuantity: 1, yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 1, unit: 'kg' }],
    });
    applySeeds();
    mockDb.inventoryLots.where.mockImplementation((query: { productId?: string }) => {
      const lots = query?.productId === harinaUuid ? [
        { id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 20000, remainingQuantity: 20000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 },
      ] : [];
      return {
        filter: vi.fn(() => ({
          sortBy: vi.fn(() => Promise.resolve([...lots])),
          toArray: vi.fn(() => Promise.resolve([...lots])),
        })),
      };
    });
    mockDb.inventoryLots.get.mockImplementation((id: string) => {
      if (id === 'lot-1') {
        return Promise.resolve({ id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 20000, remainingQuantity: 20000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 });
      }
      return Promise.resolve(null);
    });

    const { productionService } = await import('../services/productionService');

    // When: ensamblar 1 Combo A (0.5 kg) + 1 Combo B (1 kg)
    const resultA = await productionService.consumeForAssembly(comboAUuid, 1, 'test-tenant', 'user-1');
    const resultB = await productionService.consumeForAssembly(comboBUuid, 1, 'test-tenant', 'user-1');

    // Then: A cuesta $0.25, B cuesta $0.50, B === 2 * A (proporcionalidad real)
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    if (resultA.ok && resultB.ok) {
      const costA = resultA.data.totalIngredientCost;
      const costB = resultB.data.totalIngredientCost;
      expect(costA).toBe(0.25); // 500 g × $0.0005/g
      expect(costB).toBe(0.50); // 1000 g × $0.0005/g
      expect(costB).toBe(2 * costA); // Proporcionalidad: 1 kg = 2× 0.5 kg
    }
  });

  it('Test D: calculateRecipeCost con 0.5 kg y isWeighted=true coincide con createOrder (consistencia)', async () => {
    // Given: Harina stock=15000 g, isWeighted=true, costPrice=$0.50/kg
    // Receta Pan: 0.5 kg de Harina, mode=batch
    const panUuid = '00000000-0000-6000-8000-000000000030';
    const harinaUuid = '00000000-0000-6000-8000-000000000031';
    const recipePanUuid = '00000000-0000-6000-8000-000000000032';
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'kg', stock: 15000, isWeighted: true, costPrice: 0.5 });
    seedProduct({ id: panUuid, name: 'Pan', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: recipePanUuid, productId: panUuid, mode: 'batch',
      yieldQuantity: 1, yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 0.5, unit: 'kg' }],
    });
    applySeeds();
    mockDb.inventoryLots.where.mockImplementation((query: { productId?: string }) => {
      const lots = query?.productId === harinaUuid ? [
        { id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 10000, remainingQuantity: 10000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 },
      ] : [];
      return {
        filter: vi.fn(() => ({
          sortBy: vi.fn(() => Promise.resolve([...lots])),
          toArray: vi.fn(() => Promise.resolve([...lots])),
        })),
      };
    });
    mockDb.inventoryLots.get.mockImplementation((id: string) => {
      if (id === 'lot-1') {
        return Promise.resolve({ id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 10000, remainingQuantity: 10000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 });
      }
      return Promise.resolve(null);
    });

    const { productionService } = await import('../services/productionService');

    // When: obtener preview de costo + ejecutar producción real
    const preview = await productionService.calculateRecipeCost(recipePanUuid, 1);
    const real = await productionService.createOrder('test-tenant', 'user-1', {
      recipeId: recipePanUuid,
      batchCount: 1,
      plannedDate: '2026-06-05',
    });

    // Then: calculateRecipeCost.totalCost === costPerProducedUnit del lote del pan
    expect(preview.ok).toBe(true);
    expect(real.ok).toBe(true);
    if (preview.ok && real.ok) {
      // calculateRecipeCost: 500 g × $0.0005/g = $0.25
      // createOrder: costPerProducedUnit = totalIngredientCost / quantityTarget = 0.25 / 1 = 0.25
      expect(preview.data.totalCost).toBe(0.25);
      const finishedLot = mockDb.inventoryLots.add.mock.calls
        .map((c) => c[0])
        .find((lot) => (lot as { productId?: string }).productId === panUuid) as { costUsdPerUnit: number } | undefined;
      expect(finishedLot?.costUsdPerUnit).toBe(preview.data.totalCost); // Consistencia preview vs cobro real
    }
  });

  it('Test E: cancelOrder con 0.5 kg revierte 0.5 kg (no 1 kg) — stock vuelve al original exacto', async () => {
    // Given: Harina stock=15000 g; Receta Pan: 0.5 kg, mode=batch
    const panUuid = '00000000-0000-6000-8000-000000000040';
    const harinaUuid = '00000000-0000-6000-8000-000000000041';
    const recipePanUuid = '00000000-0000-6000-8000-000000000042';
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'kg', stock: 15000, isWeighted: true, costPrice: 0.5 });
    seedProduct({ id: panUuid, name: 'Pan', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: recipePanUuid, productId: panUuid, mode: 'batch',
      yieldQuantity: 1, yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 0.5, unit: 'kg' }],
    });
    applySeeds();
    mockDb.inventoryLots.where.mockImplementation((query: { productId?: string }) => {
      const lots = query?.productId === harinaUuid ? [
        { id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 10000, remainingQuantity: 10000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 },
      ] : [];
      return {
        filter: vi.fn(() => ({
          sortBy: vi.fn(() => Promise.resolve([...lots])),
          toArray: vi.fn(() => Promise.resolve([...lots])),
        })),
      };
    });
    mockDb.inventoryLots.get.mockImplementation((id: string) => {
      if (id === 'lot-1') {
        return Promise.resolve({ id: 'lot-1', tenantId: 'test-tenant', productId: harinaUuid, quantityAdded: 10000, remainingQuantity: 10000, costUsdPerUnit: 0.0005, createdAt: '2026-06-01T00:00:00Z', version: 0 });
      }
      return Promise.resolve(null);
    });

    const { productionService } = await import('../services/productionService');
    applyProductionOrdersMock();

    // When: producir 1 pan (consume 500 g de Harina, 15000 → 14500) + cancelar
    const orderResult = await productionService.createOrder('test-tenant', 'user-1', {
      recipeId: recipePanUuid,
      batchCount: 1,
      plannedDate: '2026-06-05',
    });
    expect(orderResult.ok).toBe(true);
    if (orderResult.ok) {
      const cancelResult = await productionService.cancelOrder(orderResult.data.id, 'test-tenant');
      if (!cancelResult.ok) console.error('E cancel error:', cancelResult.error);
      expect(cancelResult.ok).toBe(true);
    }

    // Then: el stock de Harina vuelve a 15000 g exactos (revierte 500 g, no 1000 g)
    // Buscar la ÚLTIMA actualización de Harina stock (debe ser la cancelación)
    const harinaUpdates = mockDb.products.update.mock.calls.filter((c) => c[0] === harinaUuid);
    expect(harinaUpdates.length).toBeGreaterThanOrEqual(2);
    if (harinaUpdates.length >= 2) {
      const lastUpdate = harinaUpdates[harinaUpdates.length - 1];
      const finalStock = (lastUpdate[1] as { stock: number }).stock;
      expect(finalStock).toBe(15000); // Reverte exactamente 500 g (no 1000 g del bug)
    }
  });
});
