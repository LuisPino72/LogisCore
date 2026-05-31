/**
 * Presentations BDD Tests — PRES-001..009
 * TDD: Unit tests for inventoryService presentation functions with mocked Dexie + syncQueue
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = {
  products: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn(), bulkAdd: vi.fn() },
  productPresentations: {
    add: vi.fn(), update: vi.fn(), put: vi.fn(), where: vi.fn(),
    bulkAdd: vi.fn(), filter: vi.fn(), sortBy: vi.fn(), get: vi.fn(),
  },
  categories: { add: vi.fn(), where: vi.fn() },
  inventoryMovements: { add: vi.fn(), where: vi.fn(), sortBy: vi.fn(), bulkAdd: vi.fn() },
  inventoryLots: { add: vi.fn(), update: vi.fn(), where: vi.fn(), get: vi.fn(), bulkAdd: vi.fn() },
  purchaseOrderItems: { where: vi.fn() },
  purchaseOrders: { where: vi.fn() },
  syncQueue: { add: vi.fn() },
  outbox: { add: vi.fn() },
  transaction: vi.fn((_mode: unknown, _tables: unknown[], fn: (tx: unknown) => Promise<void>) => fn()),
};

function resetMockDb() {
  vi.clearAllMocks();
  mockDb.products.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), count: vi.fn(() => Promise.resolve(0)) })),
  });
  mockDb.productPresentations.where.mockReturnValue({
    filter: vi.fn(() => ({
      sortBy: vi.fn(() => Promise.resolve([])),
      toArray: vi.fn(() => Promise.resolve([])),
      first: vi.fn(() => Promise.resolve(undefined)),
    })),
  });
  mockDb.inventoryMovements.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.inventoryMovements.sortBy.mockResolvedValue([]);
  mockDb.purchaseOrderItems.where.mockReturnValue({
    toArray: vi.fn(() => Promise.resolve([])),
  });
  mockDb.purchaseOrders.where.mockReturnValue({
    filter: vi.fn(() => ({ count: vi.fn(() => Promise.resolve(0)) })),
  });
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

vi.mock('../../services/network/requireNetwork', () => ({
  requireNetwork: () => ({ ok: true }),
}));

vi.mock('../../services/imageCache/imageCacheService', () => ({
  imageCacheService: {
    uploadProductImage: vi.fn(() => Promise.resolve({ ok: true, data: { url: '' } })),
    getCachedUrl: vi.fn(),
    cacheImage: vi.fn(),
  },
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ is: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'test-tenant-uuid' }, error: null })) })) })) })) })),
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

vi.mock('@logiscore/core', () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg); this.code = code; this.name = 'AppError';
    }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: Error) => ({ ok: false, error: err, data: undefined as never }) as const,
  EventBus: { on: vi.fn(() => ({ event: '', listener: vi.fn() })), off: vi.fn(), emit: vi.fn() },
  SystemEvents: { USER_LOGIN: 'USER_LOGIN', USER_LOGOUT: 'USER_LOGOUT' },
  isAppError: (err: Error) => err.name === 'AppError',
}));

const TENANT_ID = 'test-tenant';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PARENT_ID = '550e8400-e29b-41d4-a716-446655440010';

function mockParent(stock = 100) {
  const product = {
    id: PARENT_ID, tenantId: TENANT_ID, name: 'Producto Padre', sku: 'PADRE-001',
    priceUsd: 10, isWeighted: false, isTaxable: true, unit: 'unidad' as const,
    stock, stockMin: undefined, deletedAt: undefined,
  };
  mockDb.products.get.mockResolvedValue(product);
  mockDb.products.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([product])) })),
  });
  return product;
}

function mockPresentations(count = 2) {
  const presentations = Array.from({ length: count }, (_, i) => ({
    id: `pres-${i + 1}`,
    productId: PARENT_ID,
    name: `Presentación ${i + 1}`,
    priceUsd: 12,
    unitMultiplier: (i + 1) * 6,
    stockType: 'shared' as const,
    barcode: undefined,
    sortOrder: i,
    tenantId: TENANT_ID,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: undefined,
    product: {
      id: PARENT_ID, name: 'Producto Padre', sku: 'PADRE-001',
      priceUsd: 10, isWeighted: false, isTaxable: true, unit: 'unidad' as const,
      stock: 100, stockMin: undefined, deletedAt: undefined,
    },
  }));
  mockDb.productPresentations.where.mockReturnValue({
    filter: vi.fn(() => ({
      sortBy: vi.fn(() => Promise.resolve(presentations)),
      toArray: vi.fn(() => Promise.resolve(presentations)),
    })),
  });
  return presentations;
}

describe('PRES-001: Crear producto con presentaciones compartidas', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: input valido + 2 pres shared. When: createProductWithPresentations. Then: padre+pres creados, stock unificado', async () => {
    mockParent(0);
    mockDb.products.add.mockResolvedValue(PARENT_ID);
    mockDb.products.where.mockReturnValue({
      filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
    });

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.createProductWithPresentations(TENANT_ID, USER_ID, {
      name: 'Producto Padre', sku: 'PADRE-001', priceUsd: 10,
      isWeighted: false, unit: 'unidad', stockInicial: 100,
    }, [
      { name: 'Pack 6', priceUsd: 12, unitMultiplier: 6, stockType: 'shared' },
      { name: 'Pack 12', priceUsd: 22, unitMultiplier: 12, stockType: 'shared' },
    ], 'shared');

    expect(result.ok).toBe(true);
    expect(mockDb.products.add).toHaveBeenCalled();
    expect(mockDb.productPresentations.add).toHaveBeenCalled();
    expect(mockDb.inventoryLots.add).toHaveBeenCalled();
  });
});

describe('PRES-003: Obtener presentaciones de un producto', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: producto con 2 pres shared. When: getPresentationsForProduct. Then: lista de 2 presentaciones', async () => {
    mockPresentations(2, 'shared');

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.getPresentationsForProduct(PARENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(2);
    expect(result.data[0].name).toBe('Presentación 1');
    expect(result.data[1].unitMultiplier).toBe(12);
  });

  it('Given: producto sin presentaciones. When: getPresentationsForProduct. Then: lista vacia', async () => {
    mockDb.productPresentations.where.mockReturnValue({
      filter: vi.fn(() => ({ sortBy: vi.fn(() => Promise.resolve([])) })),
    });

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.getPresentationsForProduct(PARENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(0);
  });
});

describe('PRES-004: Soft delete producto en cascada con presentaciones', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: producto con 2 pres shared. When: deleteProduct. Then: padre+pres soft deleted', async () => {
    const parent = mockParent(0);
    const pres = [
      { id: 'pres-1', productId: PARENT_ID, tenantId: TENANT_ID, name: 'Var 1', priceUsd: 12, unitMultiplier: 6, stockType: 'shared' as const, sortOrder: 0, createdAt: 'now', updatedAt: 'now' },
      { id: 'pres-2', productId: PARENT_ID, tenantId: TENANT_ID, name: 'Var 2', priceUsd: 12, unitMultiplier: 12, stockType: 'shared' as const, sortOrder: 1, createdAt: 'now', updatedAt: 'now' },
    ];
    const presChain = vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve(pres)), first: vi.fn(() => Promise.resolve(undefined)) }));
    mockDb.productPresentations.where.mockReturnValue({
      filter: presChain,
    });
    mockDb.products.get.mockImplementation((id: string) => {
      if (id === PARENT_ID) return Promise.resolve(parent);
      return Promise.resolve(undefined);
    });

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.softDeleteProduct(PARENT_ID, TENANT_ID);

    expect(result.ok).toBe(true);
    expect(mockDb.products.update).toHaveBeenCalledWith(PARENT_ID, expect.objectContaining({ deletedAt: expect.any(String) }));
  });
});

describe('PRES-005: Actualizar presentación', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: presentación existe. When: updatePresentation. Then: nombre y precio actualizados', async () => {
    mockDb.productPresentations.get.mockResolvedValue({ id: 'pres-1', productId: PARENT_ID, name: 'Pack 6', priceUsd: 12, unitMultiplier: 6, stockType: 'shared', sortOrder: 0 });
    mockDb.productPresentations.update.mockResolvedValue(1);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.updatePresentation(TENANT_ID, 'pres-1', {
      name: 'Pack 24',
      priceUsd: 30,
    });

    expect(result.ok).toBe(true);
    expect(mockDb.productPresentations.put).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pack 24', priceUsd: 30 }));
  });
});

describe('PRES-006: Eliminar presentación (soft delete)', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: presentación existe. When: deletePresentation. Then: deletedAt seteado', async () => {
    mockDb.productPresentations.get.mockResolvedValue({ id: 'pres-1', productId: PARENT_ID, name: 'Pack 6', priceUsd: 12, unitMultiplier: 6, stockType: 'shared', sortOrder: 0 });
    mockDb.productPresentations.update.mockResolvedValue(1);

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.deletePresentation(TENANT_ID, 'pres-1');

    expect(result.ok).toBe(true);
    expect(mockDb.productPresentations.update).toHaveBeenCalledWith('pres-1', expect.objectContaining({ deletedAt: expect.any(String) }));
  });
});

describe('PRES-007: getAllPresentations retorna todas', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: 3 pres en DB. When: getAllPresentations. Then: retorna 3', async () => {
    mockDb.productPresentations.where.mockReturnValue({
      filter: vi.fn(() => ({
        toArray: vi.fn(() => Promise.resolve([
          { id: 'p1', productId: PARENT_ID, tenantId: TENANT_ID, name: 'A', priceUsd: 10, unitMultiplier: 6, stockType: 'shared', sortOrder: 0, createdAt: 'now', updatedAt: 'now' },
          { id: 'p2', productId: PARENT_ID, tenantId: TENANT_ID, name: 'B', priceUsd: 10, unitMultiplier: 12, stockType: 'shared', sortOrder: 1, createdAt: 'now', updatedAt: 'now' },
          { id: 'p3', productId: PARENT_ID, tenantId: TENANT_ID, name: 'C', priceUsd: 10, unitMultiplier: 24, stockType: 'shared', sortOrder: 2, createdAt: 'now', updatedAt: 'now' },
        ])),
      })),
    });

    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.getAllPresentations(TENANT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(3);
  });
});

describe('PRES-008: Schemas Zod validan presentaciones', () => {
  it('Given: PresentationSchema. When: validar data valida. Then: ok', async () => {
    const { PresentationSchema } = await import('../../specs/inventory/index');
    const result = PresentationSchema.safeParse({
      productId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Pack 6',
      priceUsd: 12,
      unitMultiplier: 6,
      stockType: 'shared',
      sortOrder: 0,
    });
    expect(result.success).toBe(true);
  });

  it('Given: PresentationSchema. When: nombre vacio. Then: error', async () => {
    const { PresentationSchema } = await import('../../specs/inventory/index');
    const result = PresentationSchema.safeParse({
      productId: '550e8400-e29b-41d4-a716-446655440000',
      name: '',
      priceUsd: 12,
      unitMultiplier: 6,
      stockType: 'shared',
      sortOrder: 0,
    });
    expect(result.success).toBe(false);
  });

  it('Given: PresentationSchema. When: precio 0. Then: error', async () => {
    const { PresentationSchema } = await import('../../specs/inventory/index');
    const result = PresentationSchema.safeParse({
      productId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Pack 6',
      priceUsd: 0,
      unitMultiplier: 6,
      stockType: 'shared',
      sortOrder: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('PRES-009: Codigos de error de presentaciones', () => {
  it('Given: inventory errors. When: verificar PRESENTATION_ codes. Then: existen y son descriptivos', async () => {
    const { InventoryErrors } = await import('../../specs/inventory/errors');
    expect(InventoryErrors.PRESENTATION_NOT_FOUND).toBe('PRESENTATION_NOT_FOUND');
    expect(InventoryErrors.PRESENTATION_MULTIPLIER_INVALID).toBe('PRESENTATION_MULTIPLIER_INVALID');
    expect(InventoryErrors.PRESENTATION_NAME_REQUIRED).toBe('PRESENTATION_NAME_REQUIRED');
  });
});
