import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSales: Array<Record<string, unknown>> = [];
const mockSaleItems: Array<Record<string, unknown>> = [];
const mockProducts: Array<Record<string, unknown>> = [];
const mockInventoryLots: Array<Record<string, unknown>> = [];
const mockInventoryMovements: Array<Record<string, unknown>> = [];
const mockCashRegisters: Array<Record<string, unknown>> = [];
const mockCustomers: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockSales.length = 0;
  mockSaleItems.length = 0;
  mockProducts.length = 0;
  mockInventoryLots.length = 0;
  mockInventoryMovements.length = 0;
  mockCashRegisters.length = 0;
  mockCustomers.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  return {
    sales: {
      where: vi.fn((criteria: Record<string, unknown>) => ({
        first: async () => {
          let items = [...mockSales];
          for (const [k, v] of Object.entries(criteria)) items = items.filter(i => i[k] === v);
          return items[0] ?? null;
        },
        filter: (predicate: (s: Record<string, unknown>) => boolean) => ({
          toArray: async () => {
            let items = [...mockSales];
            for (const [k, v] of Object.entries(criteria)) items = items.filter(i => i[k] === v);
            return items.filter(predicate);
          },
        }),
        toArray: async () => mockSales,
      })),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockSales.findIndex(s => s.id === id);
        if (idx >= 0) mockSales[idx] = { ...mockSales[idx], ...changes };
        return 1;
      }),
    },
    saleItems: {
      where: vi.fn((criteria: Record<string, unknown>) => ({
        toArray: async () => mockSaleItems.filter(i =>
          Object.entries(criteria).every(([k, v]) => i[k] === v),
        ),
      })),
    },
    products: {
      where: vi.fn((criteria: Record<string, unknown>) => ({
        first: async () => {
          let items = [...mockProducts];
          for (const [k, v] of Object.entries(criteria)) items = items.filter(p => p[k] === v);
          return items[0] ?? null;
        },
      })),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockProducts.findIndex(p => p.id === id);
        if (idx >= 0) mockProducts[idx] = { ...mockProducts[idx], ...changes };
        return 1;
      }),
    },
    inventoryLots: {
      get: vi.fn(async (id: string) => mockInventoryLots.find(l => l.id === id) ?? null),
      where: vi.fn((criteria: Record<string, unknown>) => ({
        filter: (predicate: (l: Record<string, unknown>) => boolean) => ({
          toArray: async () => {
            let items = [...mockInventoryLots];
            for (const [k, v] of Object.entries(criteria)) items = items.filter(l => l[k] === v);
            return items.filter(predicate);
          },
        }),
        toArray: async () => mockInventoryLots,
      })),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockInventoryLots.findIndex(l => l.id === id);
        if (idx >= 0) mockInventoryLots[idx] = { ...mockInventoryLots[idx], ...changes };
        return 1;
      }),
      add: vi.fn(async (lot: Record<string, unknown>) => {
        mockInventoryLots.push(lot);
        return lot.id as string;
      }),
    },
    inventoryMovements: {
      add: vi.fn(async (m: Record<string, unknown>) => {
        mockInventoryMovements.push(m);
        return m.id as string;
      }),
    },
    cashRegisters: {
      where: vi.fn((criteria: Record<string, unknown>) => ({
        first: async () => {
          let items = [...mockCashRegisters];
          for (const [k, v] of Object.entries(criteria)) items = items.filter(r => r[k] === v);
          return items[0] ?? null;
        },
        filter: (predicate: (r: Record<string, unknown>) => boolean) => ({
          toArray: async () => {
            let items = [...mockCashRegisters];
            for (const [k, v] of Object.entries(criteria)) items = items.filter(r => r[k] === v);
            return items.filter(predicate);
          },
        }),
      })),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockCashRegisters.findIndex(r => r.id === id);
        if (idx >= 0) mockCashRegisters[idx] = { ...mockCashRegisters[idx], ...changes };
        return 1;
      }),
    },
    customers: {
      get: vi.fn(async (id: string) => mockCustomers.find(c => c.id === id) ?? null),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockCustomers.findIndex(c => c.id === id);
        if (idx >= 0) mockCustomers[idx] = { ...mockCustomers[idx], ...changes };
        return 1;
      }),
    },
    recipes: {
      where: vi.fn(() => ({
        filter: () => ({ first: async () => null }),
      })),
    },
    recipeLines: {
      where: vi.fn(() => ({
        filter: () => ({ toArray: async () => [] }),
      })),
    },
    syncQueue: { enqueue: vi.fn(async () => undefined) },
    outbox: { add: vi.fn(async () => 'id') },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<unknown>) => fn()),
  };
}

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })) })) },
}));
vi.mock('../../services/dexie/db', () => ({ getDb: () => mockDb, isDbReady: () => true, isDbClosing: () => false }));
vi.mock('../../services/sync/syncQueue', () => ({ syncQueue: { enqueue: vi.fn() } }));
vi.mock('../../services/outbox/outboxService', () => ({ outboxService: { enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })) } }));
vi.mock('../../services/audit/emitWithAudit', () => ({ logAuditEventOnly: vi.fn(async () => undefined), emitEngineEvent: vi.fn() }));
vi.mock('../../services/network/requireNetwork', () => ({ requireNetwork: vi.fn(() => ({ ok: true, data: undefined })) }));
vi.mock('../../services/network/networkAwareService', () => ({ networkAware: { isOnline: () => true } }));
vi.mock('../../features/auth/services/roleGuard', () => ({ requireRole: vi.fn() }));
vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ session: { userId: 'u-1', email: 'o@bodega.com', role: 'owner', tenantId: 'tenant-1' } }) },
}));
vi.mock('../../services/tenantTranslator', () => ({ TenantTranslator: { slugToUuid: vi.fn(() => Promise.resolve('tenant-uuid')) } }));
vi.mock('../../lib/date', () => ({
  isSameDayVzla: vi.fn(() => true),
  startOfDayVzla: () => new Date(),
  endOfDayVzla: () => new Date(),
}));
vi.mock('../../lib/logger', () => ({ logger: { error: (...args: unknown[]) => console.error('LOGGER_ERROR', ...args), warn: (...args: unknown[]) => console.warn('LOGGER_WARN', ...args) } }));
vi.mock('@logiscope/core', () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'AppError'; }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: Error) => ({ ok: false, error: err }) as const,
}));
vi.mock('@logiscope/shared', () => ({
  preciseRound: (n: number, d: number) => { const f = Math.pow(10, d); return Math.round(n * f) / f; },
  generateId: () => 'mock-id-' + Date.now(),
  toSnake: (o: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())] = v;
    return out;
  },
}));
vi.mock('../../inventory/types', () => ({
  convertToStorage: (qty: number, _type: string) => qty * 1000,
  unitToStorageType: () => 'g',
  gramsToKg: (g: number) => g / 1000,
  kgToGrams: (kg: number) => kg * 1000,
}));

import { posService } from '../../features/pos/services/posService';
import { isSameDayVzla } from '../../lib/date';

const TENANT_ID = 'tenant-1';
const SALE_ID = 'sale-1';
const PRODUCT_ID = 'prod-1';
const LOT_ID = 'lot-1';
const CUSTOMER_ID = 'cust-1';
const TODAY_ISO = new Date().toISOString();
const USER_ID = 'u-1';

function seedSimpleSale(overrides?: Record<string, unknown>) {
  mockProducts.push({
    id: PRODUCT_ID, tenantId: TENANT_ID, name: 'Producto Simple', sku: 'P-001',
    isWeighted: false, unit: 'unidad', stock: 0, costPrice: 5, priceUsd: 10,
    isSellable: true, productType: 'producto_terminado', deletedAt: null,
  });
  mockInventoryLots.push({
    id: LOT_ID, tenantId: TENANT_ID, productId: PRODUCT_ID,
    quantityAdded: 10, remainingQuantity: 9, costUsdPerUnit: 4,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', version: 1, deletedAt: null,
  });
  mockSales.push({
    id: SALE_ID, tenantId: TENANT_ID, userId: USER_ID, status: 'completed',
    createdAt: TODAY_ISO, totalBs: 100, igtfBs: 0, ivaBs: 0, exchangeRate: 10,
    totalUsd: 10, paymentMethod: 'efectivo_usd', discountBs: 0, isCreditSale: false,
    creditCollected: false, cashRegisterId: 'reg-1', deletedAt: null, ...overrides,
  });
  mockSaleItems.push({
    id: 'si-1', tenantId: TENANT_ID, saleId: SALE_ID, productId: PRODUCT_ID,
    productName: 'Producto Simple', productSku: 'P-001', quantity: 1, unitMultiplier: 1,
    unitPriceUsd: 10, isWeighted: false, unit: 'unidad',
    consumedLots: [{ lotId: LOT_ID, quantity: 1 }],
  });
  mockCashRegisters.push({
    id: 'reg-1', tenantId: TENANT_ID, isOpen: true, openingBalanceBs: 0,
    totalSalesBs: 100, totalIgtfBs: 0, totalSalesCount: 1,
    openedAt: TODAY_ISO, createdAt: TODAY_ISO, deletedAt: null,
  });
}

describe('DINERO-023: voidSale producto simple', () => {
  beforeEach(() => resetMockDb());

  it('1. Producto simple con consumedLots — restaura lote original, stock y caja', async () => {
    seedSimpleSale();
    const result = await posService.voidSale(SALE_ID, TENANT_ID, USER_ID);
    expect(result.ok).toBe(true);
    const product = mockProducts.find(p => p.id === PRODUCT_ID);
    expect(product?.stock).toBe(1);
    const lot = mockInventoryLots.find(l => l.id === LOT_ID);
    expect(lot?.remainingQuantity).toBe(10);
    const sale = mockSales.find(s => s.id === SALE_ID);
    expect(sale?.status).toBe('voided');
    const reg = mockCashRegisters.find(r => r.id === 'reg-1');
    expect(reg?.totalSalesBs).toBe(0);
    expect(reg?.totalSalesCount).toBe(0);
    expect(mockInventoryMovements.length).toBeGreaterThan(0);
  });

  it('2. Producto simple legacy (sin consumedLots) — restaura lotes más recientes, crea lote implícito si falta', async () => {
    seedSimpleSale();
    const itemIdx = mockSaleItems.findIndex(i => i.saleId === SALE_ID);
    mockSaleItems[itemIdx] = { ...mockSaleItems[itemIdx], consumedLots: [] };
    const result = await posService.voidSale(SALE_ID, TENANT_ID, USER_ID);
    expect(result.ok).toBe(true);
    const product = mockProducts.find(p => p.id === PRODUCT_ID);
    expect(product?.stock).toBe(1);
    const lot = mockInventoryLots.find(l => l.id === LOT_ID);
    expect(lot?.remainingQuantity).toBe(10);
    const sale = mockSales.find(s => s.id === SALE_ID);
    expect(sale?.status).toBe('voided');
  });

  it('3. Cash register — canonical recompute recalcula totales desde la fuente de verdad (no solo decrementa)', async () => {
    mockProducts.push({
      id: PRODUCT_ID, tenantId: TENANT_ID, name: 'Producto Simple', sku: 'P-001',
      isWeighted: false, unit: 'unidad', stock: 5, costPrice: 5, priceUsd: 10,
      isSellable: true, productType: 'producto_terminado', deletedAt: null,
    });
    mockInventoryLots.push({
      id: LOT_ID, tenantId: TENANT_ID, productId: PRODUCT_ID,
      quantityAdded: 20, remainingQuantity: 19, costUsdPerUnit: 4,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', version: 1, deletedAt: null,
    });
    mockSales.push(
      { id: 'sale-a', tenantId: TENANT_ID, status: 'completed', createdAt: TODAY_ISO, totalBs: 100, igtfBs: 10, isCreditSale: false, cashRegisterId: 'reg-1', deletedAt: null },
      { id: 'sale-b', tenantId: TENANT_ID, status: 'completed', createdAt: TODAY_ISO, totalBs: 200, igtfBs: 20, isCreditSale: false, cashRegisterId: 'reg-1', deletedAt: null },
    );
    mockSaleItems.push({
      id: 'si-a', saleId: 'sale-a', tenantId: TENANT_ID, productId: PRODUCT_ID,
      quantity: 1, unitMultiplier: 1, isWeighted: false, unit: 'unidad',
      consumedLots: [{ lotId: LOT_ID, quantity: 1 }],
    });
    mockCashRegisters.push({
      id: 'reg-1', tenantId: TENANT_ID, isOpen: true, openingBalanceBs: 0,
      totalSalesBs: 300, totalIgtfBs: 30, totalSalesCount: 2,
      openedAt: TODAY_ISO, createdAt: TODAY_ISO, deletedAt: null,
    });
    const result = await posService.voidSale('sale-a', TENANT_ID, USER_ID);
    expect(result.ok).toBe(true);
    const reg = mockCashRegisters.find(r => r.id === 'reg-1');
    expect(reg?.totalSalesBs).toBe(200);
    expect(reg?.totalIgtfBs).toBe(20);
    expect(reg?.totalSalesCount).toBe(1);
  });

  it('4. Credit sale sin cobrar — reduce customer.balance', async () => {
    seedSimpleSale({ isCreditSale: true, creditCollected: false, customerId: CUSTOMER_ID, totalUsd: 10 });
    mockCustomers.push({ id: CUSTOMER_ID, tenantId: TENANT_ID, balance: 100, deletedAt: null });
    const result = await posService.voidSale(SALE_ID, TENANT_ID, USER_ID);
    expect(result.ok).toBe(true);
    const customer = mockCustomers.find(c => c.id === CUSTOMER_ID);
    expect(customer?.balance).toBe(90);
  });

  it('5. Sale no encontrada — error', async () => {
    const result = await posService.voidSale('fake-id', TENANT_ID, USER_ID);
    expect(result.ok).toBe(false);
  });

  it('6. Sale de día anterior — error (isSameDayVzla=false)', async () => {
    seedSimpleSale();
    vi.mocked(isSameDayVzla).mockReturnValueOnce(false);
    const result = await posService.voidSale(SALE_ID, TENANT_ID, USER_ID);
    expect(result.ok).toBe(false);
  });

  it('7. Caja cerrada — SALE_VOID_BOX_CLOSED', async () => {
    seedSimpleSale();
    const regIdx = mockCashRegisters.findIndex(r => r.id === 'reg-1');
    mockCashRegisters[regIdx] = { ...mockCashRegisters[regIdx], isOpen: false };
    const result = await posService.voidSale(SALE_ID, TENANT_ID, USER_ID);
    expect(result.ok).toBe(false);
  });
});
