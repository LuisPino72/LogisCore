/**
 * Sales Service Tests — SALE-001..008
 * TDD: Unit tests for sale flow via posService with mocked Dexie + syncQueue
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

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PROD_ID = '550e8400-e29b-41d4-a716-446655440002';

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
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'AppError'; }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: Error) => ({ ok: false, error: err }) as const,
  EventBus: { on: vi.fn(() => ({ event: '', listener: vi.fn() })), off: vi.fn(), emit: vi.fn() },
  SystemEvents: { USER_LOGIN: 'USER_LOGIN', USER_LOGOUT: 'USER_LOGOUT' },
  isAppError: (err: Error) => err.name === 'AppError',
}));

vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ session: { userId: 'u-1', email: 'owner@bodega.com', role: 'owner', tenantId: 'test-tenant-uuid' } }),
  },
}));

function mockCashRegister(overrides: Record<string, unknown> = {}) {
  const reg = {
    id: 'reg-1', tenantId: 'test-tenant', isOpen: true,
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

function mockLots(lots: { id: string; remainingQuantity: number; createdAt: string }[]) {
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

describe('SALE-001: Abrir caja', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: sin caja abierta, monto=5000. When: abrir. Then: caja abierta con saldo', async () => {
    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.openCashRegister({
      tenantId: 'test-tenant', userId: USER_ID, openingBalanceBs: 5000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isOpen).toBe(true);
    expect(result.data.openingBalanceBs).toBe(5000);
  });
});

describe('SALE-002: Buscar producto', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: productos en DB. When: getProductsForSale. Then: retorna solo los que tienen stock', async () => {
    const products = [
      { id: PROD_ID, tenantId: 'test-tenant', name: 'Harina PAN', sku: 'HP-001', priceUsd: 2, isWeighted: false, isTaxable: true, unit: 'unidad' as const, stock: 50, deletedAt: undefined },
    ];
    mockDb.products.where.mockReturnValue({
      filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve(products)) })),
    });

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.getProductsForSale('test-tenant');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
  });
});

describe('SALE-003: Agregar al carrito (POS store)', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: producto. When: addToCart con cantidad. Then: cart contiene item', async () => {
    const { usePosStore } = await import('../../features/pos/stores/posStore');
    usePosStore.getState().reset();
    usePosStore.getState().addToCart({
      id: PROD_ID, name: 'Harina PAN', sku: 'HP-001', priceUsd: 2.50,
      isWeighted: false, isTaxable: true, unit: 'unidad', stock: 50,
    } as never, 3);

    const cart = usePosStore.getState().cart;
    expect(cart.length).toBe(1);
    expect(cart[0].quantity).toBe(3);
    expect(cart[0].totalPriceUsd).toBe(7.50);
  });
});

describe('SALE-004: Cobrar venta', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: caja abierta, stock=50, tasa=480. When: vender 1. Then: venta completada, stock=49', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_bs',
      items: [makeCartItem()], exchangeRate: 480,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('completed');
    expect(result.data.subtotalBs).toBe(960); // 2 * 1 * 480
    expect(result.data.igtfBs).toBe(0); // efectivo_bs no paga IGTF
    expect(mockDb.products.update).toHaveBeenCalledWith(PROD_ID, { stock: 49 });
  });
});

describe('SALE-007: IGTF', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: efectivo_usd. When: vender. Then: IGTF 0 (desactivado)', async () => {
    mockCashRegister();
    mockProduct(50);
    mockLots([{ id: 'lot-1', remainingQuantity: 50, createdAt: '2026-01-01T00:00:00Z' }]);

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.createSale({
      tenantId: 'test-tenant', userId: USER_ID, paymentMethod: 'efectivo_usd',
      items: [makeCartItem({ quantity: 1, unitPriceUsd: 2.08333, totalPriceUsd: 2.08333 })],
      exchangeRate: 480,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.igtfBs).toBe(0); // IGTF desactivado (IGTF_RATE=0)
  });
});

describe('SALE-008: Cierre de caja', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: caja abierta con ventas. When: cerrar. Then: expected=opening+sales', async () => {
    mockCashRegister({ openingBalanceBs: 200, totalSalesBs: 800, totalIgtfBs: 24 });

    const { posService } = await import('../../features/pos/services/posService');
    const result = await posService.closeCashRegister({
      tenantId: 'test-tenant', userId: USER_ID, declaredClosingBalanceBs: 1000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expectedClosingBs).toBe(1000);
    expect(result.data.differenceBs).toBe(0);
    expect(result.data.deletedAt).toBeNull(); // No se marca como eliminada
  });
});
