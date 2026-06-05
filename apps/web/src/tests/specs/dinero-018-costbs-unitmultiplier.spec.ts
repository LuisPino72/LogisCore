import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSales: Array<Record<string, unknown>> = [];
const mockSaleItems: Array<Record<string, unknown>> = [];
const mockRates: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockSales.length = 0;
  mockSaleItems.length = 0;
  mockRates.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  const makeChain = (items: unknown[]) => ({
    toArray: async () => items,
    first: async () => items[0] ?? null,
    filter: (predicate: (i: unknown) => boolean) => makeChain(items.filter(predicate)),
  });
  return {
    sales: {
      where: vi.fn((field: string) => {
        if (field === '[tenantId+createdAt]') {
          return { between: vi.fn(() => makeChain(mockSales)) };
        }
        return { between: vi.fn(() => makeChain([])) };
      }),
    },
    saleItems: {
      where: vi.fn((field: string) => ({
        anyOf: vi.fn((saleIds: string[]) => makeChain(mockSaleItems.filter((i) => saleIds.includes((i as Record<string, unknown>)[field] as string)))),
        equals: vi.fn(() => makeChain([])),
      })),
    },
    products: { where: vi.fn(() => makeChain([])) },
    inventoryLots: { where: vi.fn(() => makeChain([])) },
    inventoryMovements: { where: vi.fn(() => makeChain([])) },
    expenses: { where: vi.fn(() => ({ between: vi.fn(() => makeChain([])) })) },
    exchangeRates: { where: vi.fn(() => ({ equals: vi.fn(() => makeChain(mockRates)) })) },
  };
}

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: [], error: null })) })) })) })) },
}));
vi.mock('../../services/dexie/db', () => ({ getDb: () => mockDb, isDbReady: () => true }));
vi.mock('../../services/sync/syncQueue', () => ({ syncQueue: { enqueue: vi.fn() } }));
vi.mock('../../services/outbox/outboxService', () => ({
  outboxService: { enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })) },
}));
vi.mock('../../services/network/requireNetwork', () => ({
  requireNetwork: vi.fn(() => ({ ok: true, data: undefined })),
}));
vi.mock('../../services/network/networkAwareService', () => ({
  networkAware: { isOnline: () => true },
}));
vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      session: { userId: 'u1', email: 'a@b.c', role: 'owner', tenantId: 't1' },
    }),
  },
}));

import { reportsService } from '../../features/reports/services/reportsService';

const TENANT_ID = 'tenant-1';
const RATE = 36;

describe('DINERO-018: calcItemCostBs usa unitMultiplier como costUsd (asimetría corregida)', () => {
  beforeEach(() => resetMockDb());

  it('Given: venta de 1 pack×12 latas (unitMultiplier=12, costUsdPerUnit=$0.50, rate=36). When: getExecutiveSummary. Then: costBs = 1×12×$0.50×36 = $216 Bs (NO $18 Bs)', async () => {
    mockSales.push({
      id: 's-12', tenantId: TENANT_ID, totalBs: 1 * 12 * 0.5 * RATE, igtfBs: 0, ivaBs: 0,
      exchangeRate: RATE, paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z', discountBs: 0, status: 'completed',
    });
    mockSaleItems.push({
      id: 'i-12', saleId: 's-12', productId: 'p-12', productName: 'Pack×12', productSku: 'PK12',
      quantity: 1, unitMultiplier: 12, unitPriceUsd: 6, costUsdPerUnit: 0.5,
    });

    const result = await reportsService.getExecutiveSummary(TENANT_ID, {
      timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30',
    });
    if (!result.ok) console.error('Test 1 error:', result.error);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCostBs).toBe(216);
      expect(result.data.totalCostUsd).toBe(6);
    }
  });

  it('Given: venta simple (unitMultiplier=1, quantity=3, costUsdPerUnit=$0.80). When: getExecutiveSummary. Then: costBs = 3×$0.80×36 = 86.40 Bs (sin cambio)', async () => {
    mockSales.push({
      id: 's-s', tenantId: TENANT_ID, totalBs: 3 * 0.8 * RATE, igtfBs: 0, ivaBs: 0,
      exchangeRate: RATE, paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z', discountBs: 0, status: 'completed',
    });
    mockSaleItems.push({
      id: 'i-s', saleId: 's-s', productId: 'p-s', productName: 'Coca-Cola', productSku: 'CC',
      quantity: 3, unitMultiplier: 1, unitPriceUsd: 0.8, costUsdPerUnit: 0.8,
    });

    const result = await reportsService.getExecutiveSummary(TENANT_ID, {
      timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCostUsd).toBe(2.4);
      expect(result.data.totalCostBs).toBe(86.4);
    }
  });

  it('Given: venta pesable (unitMultiplier=1, quantity=0.5kg, costUsdPerUnit=$1/kg). When: getExecutiveSummary. Then: costBs = 0.5×$1×36 = 18 Bs (sin cambio)', async () => {
    mockSales.push({
      id: 's-p', tenantId: TENANT_ID, totalBs: 0.5 * 1 * RATE, igtfBs: 0, ivaBs: 0,
      exchangeRate: RATE, paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z', discountBs: 0, status: 'completed',
    });
    mockSaleItems.push({
      id: 'i-p', saleId: 's-p', productId: 'p-p', productName: 'Arroz', productSku: 'AR',
      quantity: 0.5, unitMultiplier: 1, unitPriceUsd: 1, costUsdPerUnit: 1, isWeighted: true,
    });

    const result = await reportsService.getExecutiveSummary(TENANT_ID, {
      timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCostUsd).toBe(0.5);
      expect(result.data.totalCostBs).toBe(18);
    }
  });

  it('Given: item con costUsdPerUnit=undefined. When: getExecutiveSummary. Then: costBs = 0 (no rompe)', async () => {
    mockSales.push({
      id: 's-u', tenantId: TENANT_ID, totalBs: 10 * RATE, igtfBs: 0, ivaBs: 0,
      exchangeRate: RATE, paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z', discountBs: 0, status: 'completed',
    });
    mockSaleItems.push({
      id: 'i-u', saleId: 's-u', productId: 'p-u', productName: 'SinCosto', productSku: 'SC',
      quantity: 1, unitMultiplier: 1, unitPriceUsd: 10, costUsdPerUnit: undefined,
    });

    const result = await reportsService.getExecutiveSummary(TENANT_ID, {
      timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCostBs).toBe(0);
      expect(result.data.totalCostUsd).toBe(0);
    }
  });
});
