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
    expenses: { where: vi.fn(() => ({ between: vi.fn(() => makeChain([])) })) },
    exchangeRates: { where: vi.fn(() => ({ equals: vi.fn(() => makeChain([])) })) },
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

describe('DINERO-014 (M4): getSalesDetail separa subtotal de IVA', () => {
  beforeEach(() => resetMockDb());

  it('Given: venta con subtotalBs=100, ivaBs=16, totalBs=116, rate=10. When: getSalesDetail. Then: subtotalUsd=10, ivaUsd=1.6, totalUsd=11.6', async () => {
    mockSales.push({
      id: 's1', tenantId: TENANT_ID, totalBs: 116, ivaBs: 16, igtfBs: 0,
      exchangeRate: 10, paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z', discountBs: 0, status: 'completed',
    });
    mockSaleItems.push({
      id: 'i1', saleId: 's1', productId: 'p1', productName: 'Test', productSku: 'T',
      quantity: 1, unitPriceUsd: 10, costUsdPerUnit: 5,
    });

    const result = await reportsService.getSalesDetail(TENANT_ID, {
      timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sale = result.data[0];
      expect(sale.subtotalBs).toBe(100);
      expect(sale.subtotalUsd).toBe(10);
      expect(sale.ivaBs).toBe(16);
      expect(sale.ivaUsd).toBe(1.6);
      expect(sale.totalBs).toBe(116);
      expect(sale.totalUsd).toBe(11.6);
    }
  });
});
