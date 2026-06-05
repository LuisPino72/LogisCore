import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockOrders: Array<Record<string, unknown>> = [];
const mockProducts: Array<Record<string, unknown>> = [];
const mockLots: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockOrders.length = 0;
  mockProducts.length = 0;
  mockLots.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  return {
    productionOrders: {
      where: vi.fn((criteria: Record<string, unknown> = {}) => {
        console.log('MOCK where called with', JSON.stringify(criteria));
        const matches = (item: Record<string, unknown>) =>
          Object.entries(criteria).every(([k, v]) => item[k] === v);
        const pre = mockOrders.filter(matches);
        return {
          filter: (predicate: (i: unknown) => boolean) => ({
            first: async () => {
              const found = pre.filter(predicate);
              console.log('MOCK first returning', found.length, 'matches');
              return found[0] ?? null;
            },
            toArray: async () => pre.filter(predicate),
          }),
          toArray: async () => pre,
        };
      }),
      get: vi.fn(async (id: string) => mockOrders.find((o) => o.id === id) ?? null),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockOrders.findIndex((o) => o.id === id);
        if (idx >= 0) mockOrders[idx] = { ...mockOrders[idx], ...changes };
        return 1;
      }),
    },
    recipes: {
      get: vi.fn(async () => ({
        id: 'rec-test', productId: 'finished', yieldQuantity: 1, yieldUnit: 'unidad',
        wastePct: 0, isActive: true, lines: [],
      })),
    },
    recipeLines: { where: vi.fn(() => ({ filter: () => ({ toArray: async () => [] }) })) },
    products: {
      get: vi.fn(async (id: string) => {
        const p = mockProducts.find((p) => p.id === id);
        console.log('MOCK products.get', id, '→', p ? 'found' : 'NULL');
        return p ?? null;
      }),
      where: vi.fn(() => ({ filter: () => ({ first: async () => null, toArray: async () => [] }) })),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        console.log('MOCK products.update', id, JSON.stringify(changes));
        const idx = mockProducts.findIndex((p) => p.id === id);
        if (idx >= 0) mockProducts[idx] = { ...mockProducts[idx], ...changes };
        return 1;
      }),
    },
    inventoryLots: {
      where: vi.fn((criteria: Record<string, unknown> = {}) => {
        const matches = (item: Record<string, unknown>) =>
          Object.entries(criteria).every(([k, v]) => item[k] === v);
        const pre = mockLots.filter(matches);
        return {
          filter: (predicate: (i: unknown) => boolean) => ({
            toArray: async () => {
              const r = pre.filter(predicate);
              console.log('MOCK lots.where', JSON.stringify(criteria), '→', r.length, 'after filter');
              return r;
            },
            first: async () => pre.filter(predicate)[0] ?? null,
          }),
          toArray: async () => pre,
        };
      }),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockLots.findIndex((l) => l.id === id);
        if (idx >= 0) mockLots[idx] = { ...mockLots[idx], ...changes };
        return 1;
      }),
    },
    inventoryMovements: { add: vi.fn(async () => 'id') },
    outbox: { add: vi.fn(async () => 'id') },
    syncQueue: { add: vi.fn(async () => 'id') },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<unknown>) => fn()),
  };
}

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })) })) },
}));
vi.mock('../../services/dexie/db', () => ({ getDb: () => mockDb, isDbReady: () => true }));
vi.mock('../../services/sync/syncQueue', () => ({ syncQueue: { enqueue: vi.fn() } }));
vi.mock('../../services/outbox/outboxService', () => ({
  outboxService: {
    enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })),
    enqueueInTransaction: vi.fn(async () => undefined),
  },
}));
vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithPersistence: () => ({
    enqueueInTransaction: vi.fn(async () => undefined),
    auditAfterTransaction: vi.fn(async () => undefined),
  }),
  emitWithAudit: vi.fn(async () => undefined),
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
vi.mock('../../lib/logger', () => ({
  logger: { error: (...args: unknown[]) => console.error('LOGGER_ERROR', ...args) },
}));

import { productionService } from '../../features/production/services/productionService';

const TENANT_ID = 'tenant-1';

describe('DINERO-012 (M2) + DINERO-013 (M3): cancelOrder revierte WAC y respeta stock actual', () => {
  beforeEach(() => resetMockDb());

  it('Given: orden 100 und, stock actual=70 (vendidas 30). When: cancelOrder. Then: newStock=0, no resta de más', async () => {
    mockOrders.push({
      id: 'po-1', tenantId: TENANT_ID, productId: 'finished',
      status: 'confirmed', quantityTarget: 100, batchCount: 1, wastePct: 0,
      createdAt: '2026-06-05T10:00:00Z', createdBy: 'u1',
    });
    mockProducts.push({
      id: 'finished', tenantId: TENANT_ID, name: 'Combo',
      stock: 70, costPrice: 0, isWeighted: false, isSellable: true,
    });
    mockLots.push({
      id: 'lot-finished', tenantId: TENANT_ID, productId: 'finished',
      quantityAdded: 100, remainingQuantity: 100, costUsdPerUnit: 5,
      createdAt: '2026-06-05T10:00:00Z', deletedAt: null,
    });

    const result = await productionService.cancelOrder('po-1', TENANT_ID);
    expect(result.ok).toBe(true);

    const product = mockProducts.find((p) => p.id === 'finished');
    expect(product?.stock).toBe(0);
  });

  it('Given: 2 lotes activos (costA=2.5×10, costB=3.0×5). When: cancelOrder de orden que creó lote B. Then: costPrice = 2.5 (WAC recalculado)', async () => {
    mockOrders.push({
      id: 'po-2', tenantId: TENANT_ID, productId: 'finished-2',
      status: 'confirmed', quantityTarget: 5, batchCount: 1, wastePct: 0,
      createdAt: '2026-06-05T10:00:00Z', createdBy: 'u1',
    });
    mockProducts.push({
      id: 'finished-2', tenantId: TENANT_ID, name: 'Combo2',
      stock: 15, costPrice: 2.833, isWeighted: false, isSellable: true,
    });
    mockLots.push(
      { id: 'lot-a', tenantId: TENANT_ID, productId: 'finished-2',
        quantityAdded: 10, remainingQuantity: 10, costUsdPerUnit: 2.5,
        createdAt: '2026-05-01T10:00:00Z', deletedAt: null },
      { id: 'lot-b', tenantId: TENANT_ID, productId: 'finished-2',
        quantityAdded: 5, remainingQuantity: 5, costUsdPerUnit: 3.0,
        createdAt: '2026-06-05T10:00:00Z', deletedAt: null },
    );

    const result = await productionService.cancelOrder('po-2', TENANT_ID);
    if (!result.ok) console.error('Test M2 error:', result.error);
    expect(result.ok).toBe(true);

    const lotB = mockLots.find((l) => l.id === 'lot-b');
    expect(lotB?.deletedAt).toBeDefined();
    const product = mockProducts.find((p) => p.id === 'finished-2');
    expect(product?.costPrice).toBe(2.5);
  });
});
