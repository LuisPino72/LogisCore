import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockOrders: Array<Record<string, unknown>> = [];
const mockOrderItems: Array<Record<string, unknown>> = [];
const mockProducts: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockOrders.length = 0;
  mockOrderItems.length = 0;
  mockProducts.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  return {
    purchaseOrders: {
      add: vi.fn(async (o: Record<string, unknown>) => { mockOrders.push(o); return o.id as string; }),
      get: vi.fn(async (id: string) => mockOrders.find((o) => o.id === id) ?? null),
      put: vi.fn(async (o: Record<string, unknown>) => {
        const idx = mockOrders.findIndex((x) => x.id === o.id);
        if (idx >= 0) mockOrders[idx] = o; else mockOrders.push(o);
        return o.id as string;
      }),
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
    },
    purchaseOrderItems: {
      bulkAdd: vi.fn(async (items: Array<Record<string, unknown>>) => {
        mockOrderItems.push(...items);
        return items.map((i) => (i.id as string));
      }),
      get: vi.fn(async (id: string) => {
        const item = mockOrderItems.find((i) => i.id === id);
        if (!item) return null;
        return { ...item };
      }),
      put: vi.fn(async (i: Record<string, unknown>) => {
        const idx = mockOrderItems.findIndex((x) => x.id === i.id);
        if (idx >= 0) mockOrderItems[idx] = i; else mockOrderItems.push(i);
        return i.id as string;
      }),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockOrderItems.findIndex((i) => i.id === id);
        if (idx >= 0) mockOrderItems[idx] = { ...mockOrderItems[idx], ...changes };
        return 1;
      }),
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
    },
    products: {
      get: vi.fn(async (id: string) => mockProducts.find((p) => p.id === id) ?? null),
      where: vi.fn(() => ({
        filter: (predicate: (i: unknown) => boolean) => ({
          first: async () => {
            const filtered = mockProducts.filter(predicate);
            return filtered[0] ?? null;
          },
        }),
      })),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockProducts.findIndex((p) => p.id === id);
        if (idx >= 0) mockProducts[idx] = { ...mockProducts[idx], ...changes };
        return 1;
      }),
    },
    inventoryMovements: { add: vi.fn(async () => 'id') },
    inventoryLots: {
      where: vi.fn(() => ({
        filter: () => ({ first: async () => null, toArray: async () => [] }),
        toArray: async () => [],
      })),
      add: vi.fn(async () => 'id'),
    },
    outbox: { add: vi.fn(async () => 'id') },
    syncQueue: { add: vi.fn(async () => 'id') },
    expenses: { add: vi.fn(async () => 'id') },
    suppliers: {
      where: vi.fn(() => ({
        filter: () => ({ first: async () => ({ id: 'sup-1', tenantId: 't1', deletedAt: null, name: 'S' }) }),
      })),
    },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<unknown>) => fn()),
  };
}

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
      })),
    })),
  },
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
vi.mock('../../services/utils/id', () => ({
  generateId: () => `id-${Math.random().toString(36).slice(2, 10)}`,
}));
vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithAudit: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../lib/logger', () => ({
  logger: { error: (...args: unknown[]) => console.error('LOGGER_ERROR', ...args) },
}));

import { purchaseService } from '../../features/purchases/services/purchaseService';
import { PurchaseErrors } from '../../specs/purchases/errors';

const TENANT_ID = 'tenant-1';

describe('DINERO-008 (A3): Validación no exceder dentro de transacción', () => {
  beforeEach(() => resetMockDb());

  it('Given: orden quantity=100, receivedQuantity=50. When: receiveOrder(60). Then: failure(ORDER_RECEIVE_EXCEEDS)', async () => {
    mockOrders.push({
      id: 'po', tenantId: TENANT_ID, supplierId: 'sup-1', status: 'confirmed',
      exchangeRate: 36.5, totalUsd: 100, createdAt: '2026-06-05T10:00:00Z',
    });
    mockOrderItems.push({
      id: 'poi', tenantId: TENANT_ID, orderId: 'po', productId: 'prod-1',
      presentationId: 'pres-1', unitMultiplier: 1, productName: 'Test',
      quantity: 100, costUsdPerUnit: 1, receivedQuantity: 50, totalUsd: 100,
      createdAt: '2026-06-05T10:00:00Z',
    });
    mockProducts.push({
      id: 'prod-1', tenantId: TENANT_ID, name: 'Test', stock: 50, costPrice: 1,
      isWeighted: false, isSellable: true,
    });

    const result = await purchaseService.receiveOrder('po', {
      items: [{ itemId: 'poi', receivedQuantity: 60 }],
    }, TENANT_ID, 'u1', 36.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(PurchaseErrors.ORDER_RECEIVE_EXCEEDS);
  });

  it('Given: orden quantity=100, receivedQuantity=0. When: receiveOrder(100). Then: success, receivedQuantity=100', async () => {
    mockOrders.push({
      id: 'po', tenantId: TENANT_ID, supplierId: 'sup-1', status: 'confirmed',
      exchangeRate: 36.5, totalUsd: 100, createdAt: '2026-06-05T10:00:00Z',
    });
    mockOrderItems.push({
      id: 'poi', tenantId: TENANT_ID, orderId: 'po', productId: 'prod-1',
      presentationId: 'pres-1', unitMultiplier: 1, productName: 'Test',
      quantity: 100, costUsdPerUnit: 1, receivedQuantity: 0, totalUsd: 100,
      createdAt: '2026-06-05T10:00:00Z',
    });
    mockProducts.push({
      id: 'prod-1', tenantId: TENANT_ID, name: 'Test', stock: 0, costPrice: 0,
      isWeighted: false, isSellable: true,
    });

    const result = await purchaseService.receiveOrder('po', {
      items: [{ itemId: 'poi', receivedQuantity: 100 }],
    }, TENANT_ID, 'u1', 36.5);

    expect(result.ok).toBe(true);
    expect(mockOrderItems[0].receivedQuantity).toBe(100);
  });
});
