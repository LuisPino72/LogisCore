/**
 * Production Service Tests — PRODUCTION-003 Sprint 4 (Paso 4)
 * TDD: Sincronizar product.costPrice con WAC tras producir + crear lote del combo en assembly.
 *
 * Escenarios BDD (specs.md Sprint 4):
 *   4.1 Producir actualiza product.costPrice con WAC (stock previo 0)
 *   4.2 WAC entre stock previo y lote producido (WAC ponderado real)
 *   4.3 Sub-receta usa costPrice actualizado (calculateRecipeCost lee el nuevo valor)
 *   4.4 Ensamblar combo crea lote del combo (FIFO tracking del ensamblado)
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
  mockDb.products.get.mockResolvedValue(null);
  mockDb.recipes.get.mockResolvedValue(null);
  mockDb.recipeLines.get.mockResolvedValue(null);
  mockDb.inventoryLots.get.mockResolvedValue(null);
  mockDb.syncQueue.enqueue.mockResolvedValue(undefined);
  mockDb.outbox.add.mockResolvedValue(undefined);
  mockDb.products.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), first: vi.fn(() => Promise.resolve(null)) })),
  });
  mockDb.recipes.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), first: vi.fn(() => Promise.resolve(null)) })),
  });
  mockDb.recipeLines.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), sortBy: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.inventoryLots.where.mockReturnValue({
    filter: vi.fn(() => ({ sortBy: vi.fn(() => Promise.resolve([])), toArray: vi.fn(() => Promise.resolve([])) })),
  });
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
  priceUsd?: number;
  sku?: string;
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

function seedProduct(p: SeedProduct) {
  productMap.set(p.id, p);
}
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
  mockDb.products.get.mockImplementation((id: string) => {
    return Promise.resolve(productMap.get(id) ?? null);
  });
  mockDb.recipes.get.mockImplementation((id: string) => {
    return Promise.resolve(buildRecipeObject(recipeMap.get(id)));
  });
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
        const filtered = matchingRecipes.filter((r) =>
          fn({ isActive: r.isActive ?? true, deletedAt: undefined }),
        );
        const filteredWrapped = filtered.map(buildRecipeObject);
        return {
          toArray: vi.fn(() => Promise.resolve(filteredWrapped)),
          first: vi.fn(() => Promise.resolve(filteredWrapped[0] ?? null)),
        };
      }),
    };
  });
}

// Helper para setup de un solo lote FIFO de un producto
function mockSingleLot(productId: string, lotId: string, remaining: number, costUsdPerUnit: number) {
  const lot = {
    id: lotId,
    tenantId: 'test-tenant',
    productId,
    quantityAdded: remaining,
    remainingQuantity: remaining,
    costUsdPerUnit,
    createdAt: '2026-01-01T00:00:00Z',
    version: 0,
  };
  mockDb.inventoryLots.where.mockImplementation((query: { productId?: string }) => {
    const lots = query?.productId === productId ? [lot] : [];
    return {
      filter: vi.fn(() => ({
        sortBy: vi.fn(() => Promise.resolve([...lots])),
        toArray: vi.fn(() => Promise.resolve([...lots])),
      })),
    };
  });
  mockDb.inventoryLots.get.mockImplementation((id: string) => {
    if (id === lotId) return Promise.resolve(lot);
    return Promise.resolve(null);
  });
}

// ── Tests ───────────────────────────────────────────────

describe('PRODUCTION-003-Sprint4: Sincronizar product.costPrice con WAC', () => {
  beforeEach(() => {
    resetMockDb();
    productMap.clear();
    recipeMap.clear();
    linesByRecipe.clear();
  });

  it('Escenario 4.1: Producir actualiza product.costPrice con WAC (stock previo 0)', async () => {
    // Given: Pan con stock=0 y costPrice=0
    const panUuid = '00000000-0000-4000-8000-000000000050';
    const harinaUuid = '00000000-0000-4000-8000-000000000051';
    const recipePanUuid = '00000000-0000-4000-8000-000000000052';
    seedProduct({ id: panUuid, name: 'Pan', productType: 'producto_terminado', unit: 'unidad', stock: 0, costPrice: 0 });
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'kg', stock: 10, costPrice: 0.5 });
    seedRecipe({
      id: recipePanUuid,
      productId: panUuid,
      mode: 'batch',
      yieldQuantity: 1,
      yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 1, unit: 'kg' }],
    });
    applySeeds();
    mockSingleLot(harinaUuid, 'lot-h1', 10, 0.5);

    const { productionService } = await import('../services/productionService');

    // When: producir 10 panes (10kg Harina × $0.50 = $5 total → costPerProducedUnit = $0.50)
    const result = await productionService.createOrder('test-tenant', 'user-1', {
      recipeId: recipePanUuid,
      batchCount: 10,
      plannedDate: '2026-06-05',
    });

    // Then: success
    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('4.1 result.error:', result.error);
      return;
    }

    // Verificar que db.products.update fue llamado para Pan con costPrice = $0.50
    const panUpdate = mockDb.products.update.mock.calls.find(
      (c) => Array.isArray(c) && c[0] === panUuid,
    );
    expect(panUpdate).toBeDefined();
    if (panUpdate) {
      expect(panUpdate[1].costPrice).toBe(0.5);
      expect(panUpdate[1].stock).toBe(10);
    }

    // Verificar que el finished lot tiene costUsdPerUnit = $0.50
    const finishedLotCall = mockDb.inventoryLots.add.mock.calls.find(
      (c) => Array.isArray(c) && c[0] && (c[0] as { productId?: string }).productId === panUuid,
    );
    expect(finishedLotCall).toBeDefined();
    if (finishedLotCall) {
      const finishedLot = finishedLotCall[0] as { costUsdPerUnit: number; quantityAdded: number };
      expect(finishedLot.costUsdPerUnit).toBe(0.5);
      expect(finishedLot.quantityAdded).toBe(10);
    }
  });

  it('Escenario 4.2: WAC entre stock previo y lote producido', async () => {
    // Given: Pan con stock=5 y costPrice=$0.40
    const panUuid = '00000000-0000-4000-8000-000000000060';
    const harinaUuid = '00000000-0000-4000-8000-000000000061';
    const recipePanUuid = '00000000-0000-4000-8000-000000000062';
    seedProduct({ id: panUuid, name: 'Pan', productType: 'producto_terminado', unit: 'unidad', stock: 5, costPrice: 0.4 });
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'kg', stock: 10, costPrice: 0.5 });
    seedRecipe({
      id: recipePanUuid,
      productId: panUuid,
      mode: 'batch',
      yieldQuantity: 1,
      yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 1, unit: 'kg' }],
    });
    applySeeds();
    mockSingleLot(harinaUuid, 'lot-h1', 10, 0.5);

    const { productionService } = await import('../services/productionService');

    // When: producir 10 panes más (10kg Harina × $0.50 = $5 → costPerProducedUnit = $0.50)
    const result = await productionService.createOrder('test-tenant', 'user-1', {
      recipeId: recipePanUuid,
      batchCount: 10,
      plannedDate: '2026-06-05',
    });

    // Then: success
    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('4.2 result.error:', result.error);
      return;
    }

    // WAC esperado: (5 × $0.40 + 10 × $0.50) / 15 = $7 / 15 = $0.4666... → $0.47
    const panUpdate = mockDb.products.update.mock.calls.find(
      (c) => Array.isArray(c) && c[0] === panUuid,
    );
    expect(panUpdate).toBeDefined();
    if (panUpdate) {
      expect(panUpdate[1].costPrice).toBe(0.47);
      expect(panUpdate[1].stock).toBe(15);
    }
  });

  it('Escenario 4.3: Sub-receta usa costPrice actualizado por WAC', async () => {
    // Given: Pan con costPrice=$0.47 (ya sincronizado tras producir en escenario 4.2)
    const panUuid = '00000000-0000-4000-8000-000000000070';
    const comboUuid = '00000000-0000-4000-8000-000000000071';
    const recipeComboUuid = '00000000-0000-4000-8000-000000000072';
    seedProduct({ id: panUuid, name: 'Pan', productType: 'producto_terminado', unit: 'unidad', stock: 15, costPrice: 0.47 });
    seedProduct({ id: comboUuid, name: 'Combo-desayuno', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: recipeComboUuid,
      productId: comboUuid,
      mode: 'batch',
      yieldQuantity: 1,
      yieldUnit: 'unidad',
      lines: [{ productId: panUuid, quantity: 2, unit: 'unidad' }],
    });
    applySeeds();

    const { productionService } = await import('../services/productionService');

    // When: calcular costo de Combo (usa Pan como sub-receta)
    const result = await productionService.calculateRecipeCost(recipeComboUuid, 1);

    // Then: success con costo = 2 unidades × $0.47 = $0.94 (NO usa un costPrice desactualizado como $0)
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCost).toBe(0.94);
      expect(result.data.warnings).toEqual([]);
    }
  });

  it('Escenario 4.4: Ensamblar combo crea lote del combo (FIFO tracking)', async () => {
    // Given: Combo con receta assembly (1kg Harina) + 1 lote de Harina
    const comboUuid = '00000000-0000-4000-8000-000000000080';
    const harinaUuid = '00000000-0000-4000-8000-000000000081';
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'kg', stock: 10, costPrice: 0.5 });
    seedProduct({ id: comboUuid, name: 'Combo-desayuno', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: 'r-combo-asm-4',
      productId: comboUuid,
      mode: 'assembly',
      yieldQuantity: 1,
      yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 1, unit: 'kg' }],
    });
    applySeeds();
    mockSingleLot(harinaUuid, 'lot-h1', 10, 0.5);

    const { productionService } = await import('../services/productionService');

    // When: ensamblar 1 combo
    const result = await productionService.consumeForAssembly(comboUuid, 1, 'test-tenant', 'user-1');

    // Then: success
    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('4.4 result.error:', result.error);
      return;
    }

    // Verificar que se creó un inventoryLot del combo con:
    //   - productId = combo
    //   - quantityAdded = 1
    //   - remainingQuantity = 1
    //   - costUsdPerUnit = $0.50 (1kg × $0.50)
    const comboLotCall = mockDb.inventoryLots.add.mock.calls.find(
      (c) => Array.isArray(c) && c[0] && (c[0] as { productId?: string }).productId === comboUuid,
    );
    expect(comboLotCall).toBeDefined();
    if (comboLotCall) {
      const comboLot = comboLotCall[0] as {
        productId: string;
        quantityAdded: number;
        remainingQuantity: number;
        costUsdPerUnit: number;
        tenantId: string;
      };
      expect(comboLot.productId).toBe(comboUuid);
      expect(comboLot.quantityAdded).toBe(1);
      expect(comboLot.remainingQuantity).toBe(1);
      expect(comboLot.costUsdPerUnit).toBe(0.5);
      expect(comboLot.tenantId).toBe('test-tenant');
    }
  });
});
