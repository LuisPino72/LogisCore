/**
 * POS Service Tests — POS-014..021
 * TDD: Unit tests for posService with mocked Dexie + syncQueue
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mutable mock ────────────────────────────────

const mockDb = {
  products: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  sales: { add: vi.fn() },
  saleItems: { add: vi.fn() },
  inventoryMovements: { add: vi.fn(), where: vi.fn(), sortBy: vi.fn() },
  inventoryLots: { add: vi.fn(), update: vi.fn(), where: vi.fn(), get: vi.fn() },
  cashRegisters: { add: vi.fn(), update: vi.fn(), where: vi.fn() },
  tenantRefs: { get: vi.fn() },
  syncQueue: { add: vi.fn() },
  outbox: { add: vi.fn() },
  transaction: vi.fn((_mode: unknown, _tables: unknown[], fn: () => Promise<void>) => fn()),
};

function resetMockDb() {
  vi.clearAllMocks();
  mockDb.products.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), count: vi.fn(() => Promise.resolve(0)) })),
  });
  mockDb.cashRegisters.where.mockReturnValue({
    filter: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(null)) })),
  });
  mockDb.inventoryLots.where.mockReturnValue({
    filter: vi.fn(() => ({ sortBy: vi.fn(() => Promise.resolve([])) })),
  });
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
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null })) })) })) })) },
}));

vi.mock('../../features/inventory/types', () => ({
  convertToStorage: (qty: number) => qty,
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

function mockCashRegister(overrides: Partial<Record<string, unknown>> = {}) {
  const reg = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    tenantId: 'test-tenant',
    isOpen: true,
    openedBy: '550e8400-e29b-41d4-a716-446655440001',
    openedAt: '2026-01-01T00:00:00Z',
    openingBalanceBs: 100,
    closedBy: null,
    closedAt: null,
    closingBalanceBs: null,
    expectedClosingBs: null,
    differenceBs: null,
    totalSalesCount: 0,
    totalSalesBs: 0,
    totalIgtfBs: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: undefined,
    ...overrides,
  };
  mockDb.cashRegisters.where.mockReturnValue({
    filter: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(reg)) })),
  });
  return reg;
}

function mockProduct(stock = 50) {
  const product = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    tenantId: 'test-tenant',
    name: 'Test Product',
    sku: 'TP-001',
    priceUsd: 2,
    isWeighted: false,
    isTaxable: true,
    unit: 'unidad' as const,
    stock,
    stockMin: undefined,
    deletedAt: undefined,
  };
  mockDb.products.get.mockResolvedValue(product);
  return product;
}

function mockLots(lots: { id: string; remainingQuantity: number; createdAt: string; version?: number }[]) {
  const lotMap = new Map(lots.map((l) => [l.id, l]));
  mockDb.inventoryLots.get.mockImplementation((id: string) => Promise.resolve(lotMap.get(id) ?? null));
  mockDb.inventoryLots.where.mockReturnValue({
    filter: vi.fn(() => ({
      sortBy: vi.fn(() => Promise.resolve(lots)),
    })),
  });
}

function makeCartItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    productId: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Test Product',
    sku: 'TP-001',
    quantity: 1,
    unitPriceUsd: 2,
    totalPriceUsd: 2,
    isWeighted: false,
    unit: 'unidad',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────

describe('POS-014: Happy path — venta completada', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: caja abierta, stock=50, 1 producto. When: vender 3. Then: sale+item creados, stock=47, caja actualizada', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 3, totalPriceUsd: 6 })],
      exchangeRate: 480,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('completed');
    expect(mockDb.sales.add).toHaveBeenCalledTimes(1);
    expect(mockDb.saleItems.add).toHaveBeenCalledTimes(1);
    expect(mockDb.products.update).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440002', { stock: 47 });
    expect(mockDb.cashRegisters.update).toHaveBeenCalled();
  });
});

describe('POS-015: Caja cerrada bloquea venta', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: caja cerrada. When: intentar cobrar. Then: SALE_BOX_CLOSED', async () => {
    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      paymentMethod: 'efectivo_bs',
      items: [makeCartItem()],
      exchangeRate: 480,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SALE_BOX_CLOSED');
  });
});

describe('POS-016: IGTF solo en efectivo_usd', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: subtotal=1000Bs. When: efectivo_usd. Then: igtf=30', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      paymentMethod: 'efectivo_usd',
      items: [makeCartItem({ quantity: 1, unitPriceUsd: 2.08333, totalPriceUsd: 2.08333 })],
      exchangeRate: 480,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.igtfBs).toBe(30);
    expect(result.data.ivaBs).toBe(160);
    expect(result.data.totalBs).toBe(1190);
  });

  it('Given: subtotal=1000Bs. When: efectivo_bs. Then: igtf=0', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 1, unitPriceUsd: 2.08333, totalPriceUsd: 2.08333 })],
      exchangeRate: 480,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.igtfBs).toBe(0);
    expect(result.data.ivaBs).toBe(160);
    expect(result.data.totalBs).toBe(1160);
  });
});

describe('POS-017: Carrito vacio', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: caja abierta, carrito vacio. When: cobrar. Then: SALE_NO_ITEMS', async () => {
    mockCashRegister();

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      paymentMethod: 'efectivo_bs',
      items: [],
      exchangeRate: 480,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SALE_NO_ITEMS');
  });
});

describe('POS-018: Stock insuficiente', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: stock=2, lotes=2. When: vender 5. Then: SALE_STOCK_INSUFFICIENT', async () => {
    mockCashRegister();
    mockProduct(2);
    mockLots([{ id: 'lot-1', remainingQuantity: 2, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 5, totalPriceUsd: 10 })],
      exchangeRate: 480,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SALE_STOCK_INSUFFICIENT');
  });
});

describe('POS-019: Sin tasa BCV configurada', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: caja abierta, sin tasa. When: cobrar. Then: SALE_EXCHANGE_RATE_NOT_FOUND', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      paymentMethod: 'efectivo_bs',
      items: [makeCartItem()],
      exchangeRate: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SALE_EXCHANGE_RATE_NOT_FOUND');
  });
});

describe('POS-020: FIFO consume lotes ordenados', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: Lote1=5, Lote2=10. When: vender 8. Then: Lote1=0, Lote2=7', async () => {
    mockCashRegister();
    mockProduct(15);
    mockLots([
      { id: 'lot-1', remainingQuantity: 5, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'lot-2', remainingQuantity: 10, createdAt: '2026-01-15T00:00:00Z' },
    ]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 8, totalPriceUsd: 16 })],
      exchangeRate: 480,
    });

    expect(result.ok).toBe(true);
    expect(mockDb.inventoryLots.update).toHaveBeenCalledWith('lot-1', expect.objectContaining({ remainingQuantity: 0 }));
    expect(mockDb.inventoryLots.update).toHaveBeenCalledWith('lot-2', expect.objectContaining({ remainingQuantity: 7 }));
  });
});

describe('POS-021: Calculo expected_closing correcto', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: opening=100, sales=500, igtf=15. When: cerrar. Then: expected=600', async () => {
    mockCashRegister({ totalSalesBs: 500, totalIgtfBs: 15 });

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.closeCashRegister({
      tenantId: 'test-tenant',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      declaredClosingBalanceBs: 600,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expectedClosingBs).toBe(600);
    expect(result.data.differenceBs).toBe(0);
    expect(result.data.deletedAt).toBeNull();
    // Verify deletedAt was NOT set (no se marca como eliminada al cerrar)
    const updateCalls = mockDb.cashRegisters.update.mock.calls;
    for (const [, data] of updateCalls) {
      expect(data).not.toHaveProperty('deletedAt');
    }
  });
});
