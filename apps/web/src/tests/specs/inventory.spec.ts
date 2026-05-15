/**
 * Inventory Service Tests — INV-001..006
 * TDD: Unit tests for inventoryService with mocked Dexie + syncQueue
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { outboxService } from '../../services/outbox/outboxService';

const mockDb = {
  products: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  categories: { add: vi.fn(), where: vi.fn(), update: vi.fn(), get: vi.fn() },
  inventoryMovements: { add: vi.fn(), where: vi.fn(), sortBy: vi.fn() },
  inventoryLots: { add: vi.fn(), update: vi.fn(), where: vi.fn(), get: vi.fn() },
  syncQueue: { add: vi.fn() },
  outbox: { add: vi.fn() },
  tenantRefs: { get: vi.fn() },
  transaction: vi.fn((_mode: unknown, _tables: unknown[], fn: () => Promise<void>) => fn()),
};

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
  mockDb.inventoryLots.where.mockReturnValue({
    filter: vi.fn(() => ({ sortBy: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.inventoryLots.get.mockResolvedValue(null);
}

vi.mock('../../services/dexie/db', () => ({
  getDb: () => mockDb,
  isDbReady: () => true,
}));

vi.mock('../../services/sync/syncQueue', () => ({
  syncQueue: { enqueue: vi.fn() },
}));

vi.mock('../../services/outbox/outboxService', () => ({
  outboxService: { enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })) },
}));

vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithAudit: vi.fn(),
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null })) })) })) })) },
}));

vi.mock('@logiscore/core', () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'AppError'; }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: Error) => ({ ok: false, error: err }) as const,
  EventBus: { on: vi.fn(() => ({ event: '', listener: vi.fn() })), off: vi.fn(), emit: vi.fn() },
  SystemEvents: { USER_LOGIN: 'USER_LOGIN', USER_LOGOUT: 'USER_LOGOUT' },
  isAppError: (err: Error) => err.name === 'AppError',
}));

function mockProduct(stock = 50) {
  const product = {
    id: 'prod-1', tenantId: 'test-tenant', name: 'Test', sku: 'T-001',
    priceUsd: 1, isWeighted: false, isTaxable: true, unit: 'unidad' as const,
    stock, stockMin: undefined, deletedAt: undefined,
  };
  mockDb.products.get.mockResolvedValue(product);
  return product;
}

describe('INV-001: Crear producto', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: nombre, SKU, precio. When: crear. Then: producto guardado + evento outbox', async () => {
    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.createProduct('test-tenant', 'user-1', {
      name: 'Harina PAN', sku: 'HP-001', priceUsd: 2.50,
      isWeighted: false, isTaxable: true, unit: 'unidad',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Harina PAN');
    expect(mockDb.products.add).toHaveBeenCalled();
    expect(outboxService.enqueue).toHaveBeenCalled();
  });
});

describe('INV-002: Crear categoria', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: nombre. When: crear. Then: categoria guardada', async () => {
    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.createCategory({ name: 'Harinas', tenantId: 'test-tenant' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Harinas');
    expect(mockDb.categories.add).toHaveBeenCalled();
  });
});

describe('INV-003: Producto pesable', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: producto pesable en kg. When: crear con stock. Then: stock convertido a gramos', async () => {
    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.createProduct('test-tenant', 'user-1', {
      name: 'Queso', sku: 'QS-001', priceUsd: 5.00,
      isWeighted: true, isTaxable: true, unit: 'kg', stockInicial: 3.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockDb.inventoryLots.add).toHaveBeenCalled();
    const lotCall = mockDb.inventoryLots.add.mock.calls[0][0];
    expect(lotCall.quantityAdded).toBe(3500); // 3.5 kg = 3500 g
  });
});

describe('INV-004: Ajuste de stock', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: stock=50 + motivo valido. When: ajuste +10. Then: stock=60', async () => {
    mockProduct(50);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.adjustStock({
      productId: 'prod-1', quantity: 10, reason: 'devolucion',
      userId: 'user-1', tenantId: 'test-tenant',
    });

    expect(result.ok).toBe(true);
    expect(mockDb.products.update).toHaveBeenCalledWith('prod-1', { stock: 60 });
  });

  it('Given: sin motivo. When: ajuste. Then: INVENTORY_ADJUSTMENT_INVALID', async () => {
    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.adjustStock({
      productId: 'prod-1', quantity: 10, reason: '',
      userId: 'user-1', tenantId: 'test-tenant',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVENTORY_ADJUSTMENT_INVALID');
  });
});

describe('INV-005: Soft delete producto', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: producto existe. When: softDelete. Then: deletedAt seteado', async () => {
    mockProduct(50);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.softDeleteProduct('prod-1', 'test-tenant');

    expect(result.ok).toBe(true);
    expect(mockDb.products.update).toHaveBeenCalledWith('prod-1', expect.objectContaining({ deletedAt: expect.any(String) }));
  });
});

describe('INV-006: Productos con stock bajo', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: stock=3, stockMin=10. When: getLowStock. Then: incluido en alertas', async () => {
    const products = [{
      id: 'prod-1', tenantId: 'test-tenant', name: 'Test', sku: 'T-001',
      priceUsd: 1, isWeighted: false, isTaxable: true, unit: 'unidad' as const,
      stock: 3, stockMin: 10, deletedAt: undefined,
    }];
    mockDb.products.where.mockReturnValue({
      filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve(products)) })),
    });

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.getLowStockProducts('test-tenant');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toBe('Test');
  });
});
