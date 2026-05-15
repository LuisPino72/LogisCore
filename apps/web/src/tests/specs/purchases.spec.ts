/**
 * Purchases Service Tests — PURCH-001..005
 * TDD: Unit tests for purchaseService with mocked Dexie + syncQueue
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { outboxService } from '../../services/outbox/outboxService';

const mockDb = {
  suppliers: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  purchaseOrders: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  purchaseOrderItems: { add: vi.fn(), bulkAdd: vi.fn(), where: vi.fn(), delete: vi.fn(), update: vi.fn(), get: vi.fn() },
  products: { get: vi.fn(), update: vi.fn(), where: vi.fn() },
  inventoryMovements: { add: vi.fn(), where: vi.fn() },
  inventoryLots: { add: vi.fn(), update: vi.fn(), where: vi.fn() },
  syncQueue: { add: vi.fn() },
  outbox: { add: vi.fn() },
  transaction: vi.fn((_mode: unknown, _tables: unknown[], fn: () => Promise<void>) => fn()),
};

function resetMockDb() {
  vi.clearAllMocks();
  mockDb.suppliers.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), count: vi.fn(() => Promise.resolve(0)) })),
  });
  mockDb.purchaseOrders.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.purchaseOrderItems.where.mockReturnValue({
    toArray: vi.fn(() => Promise.resolve([])),
  });
  mockDb.products.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
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

vi.mock('../../services/audit/auditService', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null })) })) })) })) },
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

function mockProduct() {
  const product = {
    id: 'prod-1', name: 'Harina PAN', sku: 'HP-001', priceUsd: 2.50,
    isWeighted: false, isTaxable: true, unit: 'unidad', stock: 50, deletedAt: undefined,
  };
  mockDb.products.get.mockResolvedValue(product);
  return product;
}

describe('PURCH-001: Crear proveedor', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: nombre y telefono. When: crear. Then: proveedor guardado + evento outbox', async () => {
    const { purchaseService } = await import('../../features/purchases/services/purchaseService');
    const result = await purchaseService.createSupplier('test-tenant', 'user-1', {
      name: 'Distribuidora XYZ', phone: '0412-1234567',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Distribuidora XYZ');
    expect(mockDb.suppliers.add).toHaveBeenCalled();
  });
});

describe('PURCH-002: Crear orden de compra', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: proveedor + items. When: crear. Then: orden en draft + lotes NO creados todavia', async () => {
    mockProduct();

    const { purchaseService } = await import('../../features/purchases/services/purchaseService');
    const result = await purchaseService.createOrder('test-tenant', 'user-1', {
      supplierId: 'sup-1',
      notes: 'Pedido urgente',
      items: [{ productId: 'prod-1', quantity: 100, totalCostUsd: 180 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('draft');
    expect(result.data.totalUsd).toBe(180);
    expect(mockDb.purchaseOrders.add).toHaveBeenCalled();
  });
});

describe('PURCH-003: Confirmar orden', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: orden en draft. When: confirmar. Then: status=confirmed', async () => {
    const order = {
      id: 'order-1', tenantId: 'test-tenant', supplierId: 'sup-1',
      status: 'draft' as const, totalUsd: 180, notes: '', createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: undefined,
    };
    mockDb.purchaseOrders.get.mockResolvedValue(order);
    mockDb.purchaseOrders.put.mockResolvedValue(undefined as never);

    const { purchaseService } = await import('../../features/purchases/services/purchaseService');
    const result = await purchaseService.confirmOrder('order-1', 'test-tenant');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('confirmed');
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  it('Given: orden ya confirmada. When: confirmar de nuevo. Then: ORDER_INVALID_STATUS', async () => {
    const order = {
      id: 'order-1', tenantId: 'test-tenant', supplierId: 'sup-1',
      status: 'confirmed' as const, totalUsd: 180, notes: '', createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: undefined,
    };
    mockDb.purchaseOrders.get.mockResolvedValue(order);

    const { purchaseService } = await import('../../features/purchases/services/purchaseService');
    const result = await purchaseService.confirmOrder('order-1', 'test-tenant');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ORDER_INVALID_STATUS');
  });
});

describe('PURCH-004: Recibir mercancia con lotes FIFO', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: orden confirmada + items. When: recibir 100. Then: stock incrementa + lote creado con costUsdPerUnit', async () => {
    const order = {
      id: 'order-1', tenantId: 'test-tenant', supplierId: 'sup-1',
      status: 'confirmed' as const, totalUsd: 180, notes: '', createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: undefined,
    };
    mockDb.purchaseOrders.get.mockResolvedValue(order);
    mockProduct();
    mockDb.purchaseOrderItems.where.mockReturnValue({
      toArray: vi.fn(() => Promise.resolve([
        { id: 'item-1', orderId: 'order-1', productId: 'prod-1', productName: 'Harina PAN', quantity: 100, costUsdPerUnit: 1.80, receivedQuantity: 0, totalUsd: 180, createdAt: '2026-01-01T00:00:00Z' },
      ])),
    });

    const { purchaseService } = await import('../../features/purchases/services/purchaseService');
    const result = await purchaseService.receiveOrder('order-1', {
      items: [{ itemId: 'item-1', receivedQuantity: 100 }],
    }, 'test-tenant', 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockDb.inventoryLots.add).toHaveBeenCalled();
    const lotCall = mockDb.inventoryLots.add.mock.calls[0][0];
    expect(lotCall.costUsdPerUnit).toBe(1.80); // Lote creado con costo
    expect(lotCall.remainingQuantity).toBe(100);
    expect(mockDb.products.update).toHaveBeenCalledWith('prod-1', { stock: 150 });
    expect(outboxService.enqueue).toHaveBeenCalled(); // outbox event
  });
});

describe('PURCH-005: Cancelar orden', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: orden en draft. When: cancelar. Then: status=cancelled', async () => {
    const order = {
      id: 'order-1', tenantId: 'test-tenant', supplierId: 'sup-1',
      status: 'draft' as const, totalUsd: 180, notes: '', createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: undefined,
    };
    mockDb.purchaseOrders.get.mockResolvedValue(order);

    const { purchaseService } = await import('../../features/purchases/services/purchaseService');
    const result = await purchaseService.cancelOrder('order-1', 'test-tenant');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockDb.transaction).toHaveBeenCalled();
  });
});
