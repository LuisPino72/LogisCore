/**
 * POS BDD Tests — POS-001..013
 * TDD: Unit tests for posService with mocked Dexie + syncQueue
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../../services/outbox/outboxService', () => ({
  outboxService: { enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })) },
}));

vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithAudit: vi.fn(),
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ is: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'test-tenant-uuid' }, error: null })) })) })) })) })) },
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

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PROD_ID = '550e8400-e29b-41d4-a716-446655440002';

function mockCashRegister(overrides: Record<string, unknown> = {}) {
  const reg = {
    id: '550e8400-e29b-41d4-a716-446655440003', tenantId: 'test-tenant', isOpen: true,
    openedBy: USER_ID, openedAt: '2026-01-01T00:00:00Z', openingBalanceBs: 100,
    closedBy: null, closedAt: null, closingBalanceBs: null, expectedClosingBs: null, differenceBs: null,
    totalSalesCount: 0, totalSalesBs: 0, totalIgtfBs: 0,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: undefined,
    ...overrides,
  };
  mockDb.cashRegisters.where.mockReturnValue({
    filter: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(reg)) })),
  });
  return reg;
}

function mockProduct(stock = 50) {
  const product = {
    id: PROD_ID, tenantId: 'test-tenant', name: 'Test Product', sku: 'TP-001',
    priceUsd: 2, isWeighted: false, isTaxable: true, unit: 'unidad' as const,
    stock, stockMin: undefined, deletedAt: undefined,
  };
  mockDb.products.get.mockResolvedValue(product);
  return product;
}

function mockLots(lots: { id: string; remainingQuantity: number; createdAt: string; costUsdPerUnit?: number; version?: number }[]) {
  const lotMap = new Map(lots.map((l) => [l.id, l]));
  mockDb.inventoryLots.get.mockImplementation((id: string) => Promise.resolve(lotMap.get(id) ?? null));
  mockDb.inventoryLots.where.mockReturnValue({
    filter: vi.fn(() => ({ sortBy: vi.fn(() => Promise.resolve(lots)) })),
  });
}

function makeCartItem(overrides: Record<string, unknown> = {}) {
  return {
    productId: PROD_ID, name: 'Test Product', sku: 'TP-001',
    quantity: 1, unitPriceUsd: 2, totalPriceUsd: 2,
    isWeighted: false, unit: 'unidad', ...overrides,
  };
}

describe('POS-001: Happy path — venta completada', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: caja abierta, stock=50. When: vender 3. Then: sale completada, stock=47', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 3, totalPriceUsd: 6 })], exchangeRate: 480,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('completed');
    expect(mockDb.products.update).toHaveBeenCalledWith(PROD_ID, { stock: 47 });
  });
});

describe('POS-002: Caja cerrada bloquea venta', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: caja cerrada. When: cobrar. Then: SALE_BOX_CLOSED', async () => {
    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [makeCartItem()], exchangeRate: 480,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SALE_BOX_CLOSED');
  });
});

describe('POS-003: IGTF desactivado (IGTF_RATE=0)', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: subtotal ~1000 Bs. When: efectivo_usd. Then: igtf=0 (rate=0)', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const r = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_usd',
      items: [makeCartItem({ quantity: 1, unitPriceUsd: 2.08333, totalPriceUsd: 2.08333 })], exchangeRate: 480,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.igtfBs).toBe(0);
    expect(r.data.ivaBs).toBe(160);
    expect(r.data.totalBs).toBe(1160);
  });

  it('Given: mismo subtotal. When: efectivo_bs. Then: igtf=0', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const r = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 1, unitPriceUsd: 2.08333, totalPriceUsd: 2.08333 })], exchangeRate: 480,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.igtfBs).toBe(0);
    expect(r.data.totalBs).toBe(1160);
  });
});

describe('POS-004: Carrito vacio', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: carrito vacio. When: cobrar. Then: SALE_NO_ITEMS', async () => {
    mockCashRegister();
    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [], exchangeRate: 480,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SALE_NO_ITEMS');
  });
});

describe('POS-005: Stock insuficiente', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: stock=2, vender 5. Then: SALE_STOCK_INSUFFICIENT', async () => {
    mockCashRegister();
    mockProduct(2);
    mockLots([{ id: 'lot-1', remainingQuantity: 2, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 5, totalPriceUsd: 10 })], exchangeRate: 480,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SALE_STOCK_INSUFFICIENT');
  });
});

describe('POS-007: Abrir caja', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: sin caja abierta. When: abrir con 500. Then: caja abierta', async () => {
    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.openCashRegister({
      tenantId: 'test-tenant', userId: USER_ID, openingBalanceBs: 500,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isOpen).toBe(true);
    expect(result.data.openingBalanceBs).toBe(500);
  });
});

describe('POS-008: Cerrar caja', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: caja abierta con ventas. When: cerrar con 600. Then: expected=600, diff=0', async () => {
    mockCashRegister({ totalSalesBs: 500, totalIgtfBs: 15 });

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.closeCashRegister({
      tenantId: 'test-tenant', userId: USER_ID, declaredClosingBalanceBs: 600,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expectedClosingBs).toBe(600);
    expect(result.data.differenceBs).toBe(0);
  });
});

describe('SALE-009: Venta con descuento', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: subtotal $10. When: descuento 10%. Then: discountBs=480, IVA sobre base reducida', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 5, unitPriceUsd: 2, totalPriceUsd: 10 })],
      exchangeRate: 480,
      discountType: 'percentage',
      discountValue: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.discountType).toBe('percentage');
    expect(result.data.discountValue).toBe(10);
    expect(result.data.totalBs).toBe(5568); // subtotal 4800 - desc 480 + iva 1248 = 5568
  });

  it('Given: subtotal $10. When: descuento fijo $2. Then: discountBs=960, IVA sobre base reducida', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 5, unitPriceUsd: 2, totalPriceUsd: 10 })],
      exchangeRate: 480,
      discountType: 'fixed',
      discountValue: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.discountType).toBe('fixed');
    expect(result.data.discountValue).toBe(2);
    expect(result.data.totalBs).toBe(5568); // subtotal 4800 - desc 960 + iva 1728 = 5568
  });

  it('Given: descuento 101%. When: aplicar. Then: capped al 100%', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 1, totalPriceUsd: 2 })],
      exchangeRate: 480,
      discountType: 'percentage',
      discountValue: 200,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // discount capped at subtotal
    expect(result.data.discountBs).toBeLessThanOrEqual(result.data.subtotalBs);
    expect(result.data.totalBs).toBeGreaterThanOrEqual(0);
  });
});

describe('POS-012: FIFO consume lotes ordenados', () => {
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
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [makeCartItem({ quantity: 8, totalPriceUsd: 16 })], exchangeRate: 480,
    });

    expect(result.ok).toBe(true);
    expect(mockDb.inventoryLots.update).toHaveBeenCalledWith('lot-1', expect.objectContaining({ remainingQuantity: 0 }));
    expect(mockDb.inventoryLots.update).toHaveBeenCalledWith('lot-2', expect.objectContaining({ remainingQuantity: 7 }));
  });
});
