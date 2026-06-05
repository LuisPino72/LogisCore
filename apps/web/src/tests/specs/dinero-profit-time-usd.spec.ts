import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSales: Array<Record<string, unknown>> = [];
const mockSaleItems: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockSales.length = 0;
  mockSaleItems.length = 0;
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
    expenses: {
      where: vi.fn(() => ({ between: vi.fn(() => makeChain([])) })),
    },
    exchangeRates: { where: vi.fn(() => ({ equals: vi.fn(() => makeChain([])) })) },
  };
}

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ gte: vi.fn(() => ({ lte: vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ data: [], error: null })) })) })) })),
      })),
    })),
  },
}));

vi.mock('../../services/dexie/db', () => ({ getDb: () => mockDb, isDbReady: () => true }));
vi.mock('../../services/sync/syncQueue', () => ({ syncQueue: { enqueue: vi.fn() } }));
vi.mock('../../services/sync/syncEngine', () => ({}));
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

describe('DINERO-006 (A1): getProfitOverTime acumula USD directo, no convierte desde Bs', () => {
  beforeEach(() => resetMockDb());

  it('Given: 3 ventas mismo día con tasas 30, 35, 40 Bs/USD. When: getProfitOverTime. Then: profitUsd del día = sum ventas USD − sum costos USD (no depende de lastRate)', async () => {
    mockSales.push(
      {
        id: 's1', tenantId: TENANT_ID, totalBs: 300, igtfBs: 0, ivaBs: 0,
        exchangeRate: 30, paymentMethod: 'efectivo_usd',
        createdAt: '2026-06-05T09:00:00Z', discountBs: 0, status: 'completed',
      },
      {
        id: 's2', tenantId: TENANT_ID, totalBs: 350, igtfBs: 0, ivaBs: 0,
        exchangeRate: 35, paymentMethod: 'efectivo_usd',
        createdAt: '2026-06-05T12:00:00Z', discountBs: 0, status: 'completed',
      },
      {
        id: 's3', tenantId: TENANT_ID, totalBs: 400, igtfBs: 0, ivaBs: 0,
        exchangeRate: 40, paymentMethod: 'efectivo_usd',
        createdAt: '2026-06-05T15:00:00Z', discountBs: 0, status: 'completed',
      },
    );
    mockSaleItems.push(
      { id: 'i1', saleId: 's1', productId: 'p1', productName: 'A', productSku: 'A',
        quantity: 1, unitPriceUsd: 10, costUsdPerUnit: 5 },
      { id: 'i2', saleId: 's2', productId: 'p1', productName: 'A', productSku: 'A',
        quantity: 1, unitPriceUsd: 10, costUsdPerUnit: 5 },
      { id: 'i3', saleId: 's3', productId: 'p1', productName: 'A', productSku: 'A',
        quantity: 1, unitPriceUsd: 10, costUsdPerUnit: 5 },
    );

    const result = await reportsService.getProfitOverTime(TENANT_ID, {
      timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBe(1);
      const point = result.data[0];
      expect(point.salesUsd).toBe(30);
      expect(point.costUsd).toBe(15);
      expect(point.profitUsd).toBe(15);
    }
  });

  it('Caso edge: 1 venta 1 item. When: getProfitOverTime. Then: profitUsd correcto', async () => {
    mockSales.push({
      id: 's1', tenantId: TENANT_ID, totalBs: 100, igtfBs: 0, ivaBs: 0,
      exchangeRate: 36.5, paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z', discountBs: 0, status: 'completed',
    });
    mockSaleItems.push({
      id: 'i1', saleId: 's1', productId: 'p1', productName: 'Test', productSku: 'T',
      quantity: 1, unitPriceUsd: 10, costUsdPerUnit: 5,
    });

    const result = await reportsService.getProfitOverTime(TENANT_ID, {
      timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const point = result.data[0];
      expect(point.salesUsd).toBe(10);
      expect(point.costUsd).toBe(5);
      expect(point.profitUsd).toBe(5);
    }
  });
});
