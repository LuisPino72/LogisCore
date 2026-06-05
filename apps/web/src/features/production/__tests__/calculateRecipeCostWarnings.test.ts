/**
 * Production Service Tests — PRODUCTION-003 Sprint 5 (Paso 5)
 * TDD: Warning explicito para ingredientes sin costo (costPrice=0 o null).
 *
 * Escenarios BDD (specs.md Sprint 5):
 *   5.1 Ingrediente sin costo muestra warning (mensaje exacto)
 *   5.2 calculateRecipeCost incluye warning de costo faltante + totalCost parcial
 *   5.3 Receta con todos los ingredientes con costo NO muestra warning (warnings: [])
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// -- Mock DB --------------------------------------------

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

// -- Helpers de seed ------------------------------------

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

// -- Tests ----------------------------------------------

describe('PRODUCTION-003-Sprint5: Warning explicito para ingredientes sin costo', () => {
  beforeEach(() => {
    resetMockDb();
    productMap.clear();
    recipeMap.clear();
    linesByRecipe.clear();
  });

  it('Escenario 5.1: Ingrediente sin costo (costPrice=0) genera warning con mensaje exacto', async () => {
    // Given: receta con 1 ingrediente "Harina" sin costo (costPrice = 0)
    const harinaUuid = '00000000-0000-5000-8000-000000000001';
    const panUuid = '00000000-0000-5000-8000-000000000002';
    const recipePanUuid = '00000000-0000-5000-8000-000000000003';
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'kg', stock: 10, costPrice: 0 });
    seedProduct({ id: panUuid, name: 'Pan', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: recipePanUuid,
      productId: panUuid,
      mode: 'batch',
      yieldQuantity: 1,
      yieldUnit: 'unidad',
      lines: [{ productId: harinaUuid, quantity: 1, unit: 'kg' }],
    });
    applySeeds();

    const { productionService } = await import('../services/productionService');

    // When: consultar costo de la receta
    const result = await productionService.calculateRecipeCost(recipePanUuid, 1);

    // Then: success con warnings que incluye mensaje exacto de Harina
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCost).toBe(0);
      expect(result.data.warnings).toHaveLength(1);
      expect(result.data.warnings[0]).toBe('Harina no tiene costo registrado');
    }
  });

  it('Escenario 5.2: Mezcla de ingredientes (con y sin costo) retorna totalCost parcial + warnings', async () => {
    // Given: receta con Harina (sin costo) + Huevos (costPrice = 0.30)
    const harinaUuid = '00000000-0000-5000-8000-000000000010';
    const huevosUuid = '00000000-0000-5000-8000-000000000011';
    const panUuid = '00000000-0000-5000-8000-000000000012';
    const recipePanUuid = '00000000-0000-5000-8000-000000000013';
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'unidad', stock: 10, costPrice: 0 });
    seedProduct({ id: huevosUuid, name: 'Huevos', productType: 'materia_prima', unit: 'unidad', stock: 50, costPrice: 0.30 });
    seedProduct({ id: panUuid, name: 'Pan', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: recipePanUuid,
      productId: panUuid,
      mode: 'batch',
      yieldQuantity: 1,
      yieldUnit: 'unidad',
      lines: [
        { productId: harinaUuid, quantity: 1, unit: 'unidad' },
        { productId: huevosUuid, quantity: 2, unit: 'unidad' },
      ],
    });
    applySeeds();

    const { productionService } = await import('../services/productionService');

    // When: consultar costo de la receta para 1 batch
    const result = await productionService.calculateRecipeCost(recipePanUuid, 1);

    // Then: totalCost = 2 * 0.30 = 0.60 (solo Huevos), warnings = ['Harina no tiene costo registrado']
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCost).toBe(0.6);
      expect(result.data.warnings).toHaveLength(1);
      expect(result.data.warnings[0]).toBe('Harina no tiene costo registrado');
    }
  });

  it('Escenario 5.3: Todos los ingredientes con costo retorna warnings vacios', async () => {
    // Given: receta con Harina ($0.50) + Huevos ($0.30) - ambos con costo
    const harinaUuid = '00000000-0000-5000-8000-000000000020';
    const huevosUuid = '00000000-0000-5000-8000-000000000021';
    const panUuid = '00000000-0000-5000-8000-000000000022';
    const recipePanUuid = '00000000-0000-5000-8000-000000000023';
    seedProduct({ id: harinaUuid, name: 'Harina', productType: 'materia_prima', unit: 'unidad', stock: 10, costPrice: 0.50 });
    seedProduct({ id: huevosUuid, name: 'Huevos', productType: 'materia_prima', unit: 'unidad', stock: 50, costPrice: 0.30 });
    seedProduct({ id: panUuid, name: 'Pan', productType: 'producto_terminado', unit: 'unidad', stock: 0 });
    seedRecipe({
      id: recipePanUuid,
      productId: panUuid,
      mode: 'batch',
      yieldQuantity: 1,
      yieldUnit: 'unidad',
      lines: [
        { productId: harinaUuid, quantity: 1, unit: 'unidad' },
        { productId: huevosUuid, quantity: 1, unit: 'unidad' },
      ],
    });
    applySeeds();

    const { productionService } = await import('../services/productionService');

    // When: consultar costo de la receta
    const result = await productionService.calculateRecipeCost(recipePanUuid, 1);

    // Then: totalCost = 0.80, warnings = []
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCost).toBe(0.8);
      expect(result.data.warnings).toEqual([]);
    }
  });
});
