import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockOrders: Array<Record<string, unknown>> = [];
const mockOrderItems: Array<Record<string, unknown>> = [];
const mockProducts: Array<Record<string, unknown>> = [];
const mockMovements: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockOrders.length = 0;
  mockOrderItems.length = 0;
  mockProducts.length = 0;
  mockMovements.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  const makeChain = (items: unknown[]) => ({
    toArray: async () => items,
    first: async () => items[0] ?? null,
    count: async () => items.length,
    filter: (predicate: (i: unknown) => boolean) => makeChain(items.filter(predicate)),
  });
  return {
    products: {
      get: vi.fn(async (id: string) => mockProducts.find((p) => p.id === id) ?? null),
      where: vi.fn(() => makeChain(mockProducts)),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockProducts.findIndex((p) => p.id === id);
        if (idx >= 0) mockProducts[idx] = { ...mockProducts[idx], ...changes };
        return 1;
      }),
    },
    purchaseOrders: {
      add: vi.fn(async (o: Record<string, unknown>) => {
        mockOrders.push(o);
        return o.id as string;
      }),
      get: vi.fn(async (id: string) => mockOrders.find((o) => o.id === id) ?? null),
      where: vi.fn(() => ({
        filter: (predicate: (i: unknown) => boolean) => ({
          first: async () => {
            const filtered = mockOrders.filter(predicate);
            return filtered[0] ?? null;
          },
          toArray: async () => mockOrders.filter(predicate),
        }),
        toArray: async () => mockOrders,
      })),
      put: vi.fn(async (o: Record<string, unknown>) => {
        const idx = mockOrders.findIndex((x) => x.id === o.id);
        if (idx >= 0) mockOrders[idx] = o;
        else mockOrders.push(o);
        return o.id as string;
      }),
      update: vi.fn(async () => 1),
    },
    purchaseOrderItems: {
      bulkAdd: vi.fn(async (items: Array<Record<string, unknown>>) => {
        mockOrderItems.push(...items);
        return items.map((i) => (i.id as string));
      }),
      get: vi.fn(async (id: string) => mockOrderItems.find((i) => i.id === id) ?? null),
      where: vi.fn(() => ({
        filter: (predicate: (i: unknown) => boolean) => ({
          first: async () => {
            const filtered = mockOrderItems.filter(predicate);
            return filtered[0] ?? null;
          },
          toArray: async () => mockOrderItems.filter(predicate),
        }),
        toArray: async () => mockOrderItems,
      })),
      put: vi.fn(async (i: Record<string, unknown>) => {
        const idx = mockOrderItems.findIndex((x) => x.id === i.id);
        if (idx >= 0) mockOrderItems[idx] = i;
        else mockOrderItems.push(i);
        return i.id as string;
      }),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockOrderItems.findIndex((i) => i.id === id);
        if (idx >= 0) mockOrderItems[idx] = { ...mockOrderItems[idx], ...changes };
        return 1;
      }),
    },
    inventoryMovements: {
      add: vi.fn(async (m: Record<string, unknown>) => {
        mockMovements.push(m);
        return m.id as string;
      }),
    },
    outbox: {
      add: vi.fn(async () => 'id'),
    },
    syncQueue: {
      add: vi.fn(async () => 'id'),
    },
    expenses: {
      add: vi.fn(async () => 'id'),
    },
    inventoryLots: {
      where: vi.fn(() => makeChain([])),
      add: vi.fn(async (lot: Record<string, unknown>) => {
        return lot.id as string;
      }),
    },
    suppliers: {
      where: vi.fn(() => ({
        filter: (predicate: (i: unknown) => boolean) => ({
          first: async () => {
            const arr: Array<Record<string, unknown>> = [
              { id: 'sup-1', tenantId: TENANT_ID, deletedAt: null, name: 'Test Supplier' },
            ];
            const filtered = arr.filter(predicate);
            return filtered[0] ?? null;
          },
        }),
      })),
    },
    exchangeRates: {
      where: vi.fn(() => ({
        equals: vi.fn(() => makeChain([])),
      })),
    },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<unknown>) => fn()),
  };
}

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

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

vi.mock('../../features/auth/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({
      session: {
        userId: 'user-1',
        email: 'test@logiscore.test',
        role: 'owner',
        tenantId: 'tenant-1',
      },
    }),
  },
}));

vi.mock('../../services/utils/id', () => ({
  generateId: () => `id-${Math.random().toString(36).slice(2, 10)}`,
}));

vi.mock('../../features/inventory/services/inventoryService', () => ({
  inventoryService: {
    getProductById: vi.fn(),
  },
}));

vi.mock('../../services/network/requireNetwork', () => ({
  requireNetwork: vi.fn(() => ({ ok: true, data: undefined })),
}));

vi.mock('../../services/network/networkAwareService', () => ({
  networkAware: { isOnline: () => true },
}));

vi.mock('../../lib/logger', () => ({
  logger: { error: (...args: unknown[]) => console.error('LOGGER_ERROR', ...args) },
}));

import { purchaseService } from '../../features/purchases/services/purchaseService';

const TENANT_ID = 'tenant-1';

describe('DINERO-002: WAC en compras divide costUsdPerUnit por unitMultiplier', () => {
  beforeEach(() => resetMockDb());

  it('Given: producto stock=0, compra 2 Cajas×6 a $24/caja ($48 total). When: receiveOrder. Then: costPrice = $4/unit (no $24)', async () => {
    mockProducts.push({
      id: 'prod-c2',
      tenantId: TENANT_ID,
      name: 'Refresco Caja×6',
      sku: 'REF-C6',
      stock: 0,
      costPrice: 0,
      priceUsd: 60,
      isWeighted: false,
      isSellable: true,
    });
    mockOrders.push({
      id: 'po-c2',
      tenantId: TENANT_ID,
      supplierId: 'sup-1',
      status: 'confirmed',
      exchangeRate: 36.5,
      totalUsd: 48,
      createdAt: '2026-06-05T10:00:00Z',
    });
    mockOrderItems.push({
      id: 'poi-c2',
      tenantId: TENANT_ID,
      orderId: 'po-c2',
      productId: 'prod-c2',
      presentationId: 'pres-1',
      unitMultiplier: 6,
      productName: 'Refresco Caja×6',
      quantity: 2,
      costUsdPerUnit: 24,
      receivedQuantity: 0,
      totalUsd: 48,
      createdAt: '2026-06-05T10:00:00Z',
    });

    const result = await purchaseService.receiveOrder('po-c2', {
      items: [{ itemId: 'poi-c2', receivedQuantity: 2 }],
    }, TENANT_ID, 'user-1', 36.5);
    if (!result.ok) console.error('Test error:', result.error, 'orders:', mockOrders.length, 'items:', mockOrderItems.length, 'products:', mockProducts.length);

    expect(result.ok).toBe(true);
    const updated = mockProducts.find((p) => p.id === 'prod-c2');
    expect(updated).toBeDefined();
    expect(updated?.costPrice).toBe(4);
    expect(updated?.stock).toBe(12);
  });
});
