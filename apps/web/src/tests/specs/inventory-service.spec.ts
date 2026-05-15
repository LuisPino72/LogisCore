/**
 * Inventory Service Tests — INV-007..013
 * TDD: Unit tests for inventoryService with mocked Dexie + syncQueue
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mutable mock ────────────────────────────────

const mockDb = {
  products: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  categories: { add: vi.fn(), where: vi.fn(), update: vi.fn() },
  inventoryMovements: { add: vi.fn(), where: vi.fn(), sortBy: vi.fn() },
  inventoryLots: { add: vi.fn(), update: vi.fn(), where: vi.fn(), get: vi.fn() },
  syncQueue: { add: vi.fn() },
  outbox: { add: vi.fn() },
  transaction: vi.fn((_mode: unknown, _tables: unknown[], fn: () => Promise<void>) => fn()),
};

// Default mock: empty results for filter/where/sortBy
function resetMockDb() {
  vi.clearAllMocks();
  mockDb.products.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), count: vi.fn(() => Promise.resolve(0)) })),
  });
  mockDb.categories.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.inventoryMovements.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.inventoryMovements.sortBy.mockResolvedValue([]);
}

vi.mock('../../services/dexie/db', () => ({
  getDb: () => mockDb,
  isDbReady: () => true,
}));

vi.mock('../../services/sync/syncQueue', () => ({
  syncQueue: { enqueue: vi.fn() },
}));

vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithAudit: vi.fn(),
}));

vi.mock('../../services/audit/auditService', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) } },
}));

vi.mock('@logiscore/core', () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg); this.code = code; this.name = 'AppError';
    }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: Error) => ({ ok: false, error: err }) as const,
  EventBus: { on: vi.fn(() => ({ event: '', listener: vi.fn() })), off: vi.fn(), emit: vi.fn() },
  SystemEvents: { USER_LOGIN: 'USER_LOGIN', USER_LOGOUT: 'USER_LOGOUT' },
  isAppError: (err: Error) => err.name === 'AppError',
}));

// ── Helpers ────────────────────────────────────────────

function mockLots(lots: { id: string; remainingQuantity: number; createdAt: string; version?: number }[]) {
  const lotMap = new Map(lots.map((l) => [l.id, l]));
  mockDb.inventoryLots.get.mockImplementation((id: string) => Promise.resolve(lotMap.get(id) ?? null));
  mockDb.inventoryLots.where.mockReturnValue({
    filter: vi.fn(() => ({
      sortBy: vi.fn(() => Promise.resolve(lots)),
    })),
  });
}

function mockProduct(stock = 50) {
  const product = { id: 'prod-1', tenantId: 'test-tenant', name: 'Test', sku: 'T-001', priceUsd: 1, isWeighted: false, unit: 'unidad' as const, stock, stockMin: undefined, deletedAt: undefined };
  mockDb.products.get.mockResolvedValue(product);
  return product;
}

// ── Tests ──────────────────────────────────────────────

describe('INV-007: FIFO consume del lote más antiguo', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: 2 lotes (Lote1 qty=10, Lote2 qty=10), When: consume 12, Then: Lote1 queda 0, Lote2 queda 8', async () => {
    mockLots([
      { id: 'lot-1', remainingQuantity: 10, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'lot-2', remainingQuantity: 10, createdAt: '2026-01-15T00:00:00Z' },
    ]);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.consumeFifo('prod-1', 12, 'test-tenant');

    expect(result.ok).toBe(true);
    expect(mockDb.inventoryLots.update).toHaveBeenCalledWith('lot-1', expect.objectContaining({ remainingQuantity: 0 }));
    expect(mockDb.inventoryLots.update).toHaveBeenCalledWith('lot-2', expect.objectContaining({ remainingQuantity: 8 }));
  });
});

describe('INV-008: FIFO stock insuficiente', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: stock=5, When: consume 10, Then: INVENTORY_STOCK_INSUFFICIENT', async () => {
    mockLots([{ id: 'lot-1', remainingQuantity: 5, createdAt: '2026-01-01T00:00:00Z' }]);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.consumeFifo('prod-1', 10, 'test-tenant');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVENTORY_STOCK_INSUFFICIENT');
  });
});

describe('INV-009: FIFO consume parcial de lote', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: Lote1 qty=10, When: consume 3, Then: Lote1 remaining=7', async () => {
    mockLots([{ id: 'lot-1', remainingQuantity: 10, createdAt: '2026-01-01T00:00:00Z' }]);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.consumeFifo('prod-1', 3, 'test-tenant');

    expect(result.ok).toBe(true);
    expect(mockDb.inventoryLots.update).toHaveBeenCalledWith('lot-1', expect.objectContaining({ remainingQuantity: 7 }));
  });
});

describe('INV-010: Ajuste manual de stock', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: stock=50 + motivo, When: ajuste +10, Then: stock=60 + lote creado', async () => {
    mockProduct(50);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.adjustStock({
      productId: 'prod-1', quantity: 10, reason: 'devolucion',
      userId: 'user-1', tenantId: 'test-tenant',
    });

    expect(result.ok).toBe(true);
    expect(mockDb.inventoryLots.add).toHaveBeenCalled();
    // stock updated: 50 + 10 = 60
    expect(mockDb.products.update).toHaveBeenCalledWith('prod-1', { stock: 60 });
  });
});

describe('INV-010b: Ajuste manual con motivo vacío', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: sin motivo, When: ajuste, Then: INVENTORY_ADJUSTMENT_INVALID', async () => {
    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.adjustStock({
      productId: 'prod-1', quantity: 10, reason: '',
      userId: 'user-1', tenantId: 'test-tenant',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVENTORY_ADJUSTMENT_INVALID');
  });
});

describe('INV-011: Soft delete de producto', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: producto existe, When: softDelete, Then: deletedAt seteado', async () => {
    mockProduct(50);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.softDeleteProduct('prod-1', 'test-tenant');

    expect(result.ok).toBe(true);
    expect(mockDb.products.update).toHaveBeenCalledWith('prod-1', expect.objectContaining({ deletedAt: expect.any(String) }));
  });

  it('Given: producto no existe, When: softDelete, Then: PRODUCT_NOT_FOUND', async () => {
    mockDb.products.get.mockResolvedValue(undefined);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.softDeleteProduct('prod-404', 'test-tenant');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});

describe('INV-012: Crear producto con stockInicial', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: input + stockInicial=50, When: create, Then: lote y movimiento creados', async () => {
    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.createProduct('test-tenant', 'user-1', {
      name: 'Azucar', sku: 'AZ-001', priceUsd: 1.50,
      isWeighted: false, unit: 'unidad', stockInicial: 50,
    });

    expect(result.ok).toBe(true);
    expect(mockDb.inventoryMovements.add).toHaveBeenCalled();
    expect(mockDb.inventoryLots.add).toHaveBeenCalled();
  });
});

describe('INV-013: Conversión de stock pesable', () => {
  it('kgToGrams: 3.5 kg -> 3500', async () => {
    const { kgToGrams } = await import('../../features/inventory/types');
    expect(kgToGrams(3.5)).toBe(3500);
    expect(kgToGrams(0.5)).toBe(500);
  });

  it('gramsToKg: 3500 -> 3.5', async () => {
    const { gramsToKg } = await import('../../features/inventory/types');
    expect(gramsToKg(3500)).toBe(3.5);
    expect(gramsToKg(500)).toBe(0.5);
  });

  it('ltToMl: 1.5 lt -> 1500', async () => {
    const { ltToMl } = await import('../../features/inventory/types');
    expect(ltToMl(1.5)).toBe(1500);
  });

  it('mlToLt: 1500 -> 1.5', async () => {
    const { mlToLt } = await import('../../features/inventory/types');
    expect(mlToLt(1500)).toBe(1.5);
  });
});
