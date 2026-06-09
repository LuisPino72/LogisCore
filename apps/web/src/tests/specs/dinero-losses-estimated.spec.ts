import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMovements: Array<Record<string, unknown>> = [];
const mockProducts: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockMovements.length = 0;
  mockProducts.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  return {
    inventoryMovements: {
      where: vi.fn(() => ({
        filter: (predicate: (i: unknown) => boolean) => ({
          toArray: async () => mockMovements.filter(predicate),
        }),
      })),
    },
    products: {
      get: vi.fn(async (id: string) => mockProducts.find((p) => p.id === id) ?? null),
    },
    exchangeRates: { where: vi.fn((_field: string) => ({ equals: vi.fn(() => ({ filter: () => ({ toArray: async () => [] }), toArray: async () => [] })), reverse: vi.fn(() => ({ sortBy: vi.fn(async () => []) })) })) },
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

describe('DINERO-010 (A5): pérdidas con costUsd=null estimadas (priceUsd*0.5)', () => {
  beforeEach(() => resetMockDb());

  it('Given: pérdida 10 unidades con costUsd=undefined, priceUsd=20. When: getAdjustmentLossExpenses. Then: costUsd = 10*20*0.5 = $100 estimado', async () => {
    mockMovements.push({
      id: 'mov-1', tenantId: TENANT_ID, productId: 'prod-1',
      type: 'adjustment', quantity: -10, reasonType: 'perdida',
      costUsd: undefined, createdAt: '2026-06-05T10:00:00Z', deletedAt: null,
    });
    mockProducts.push({
      id: 'prod-1', tenantId: TENANT_ID, name: 'Test',
      priceUsd: 20, isWeighted: false, isSellable: true, unit: 'unidad',
    });

    const result = await reportsService.getAdjustmentLossExpenses(TENANT_ID, '2026-06-01', '2026-06-30');
    if (!result.ok) console.error('Test 1 error:', result.error);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.perdida.count).toBe(1);
      expect(result.data.perdida.estimatedCount).toBe(1);
      expect(result.data.perdida.totalUsd).toBe(100);
      expect(result.data.estimatedTotalUsd).toBe(100);
    }
  });

  it('Given: pérdida con costUsd=5. When: getAdjustmentLossExpenses. Then: costUsd=5 (no estimación)', async () => {
    mockMovements.push({
      id: 'mov-2', tenantId: TENANT_ID, productId: 'prod-2',
      type: 'adjustment', quantity: -2, reasonType: 'robo',
      costUsd: 5, createdAt: '2026-06-05T10:00:00Z', deletedAt: null,
    });

    const result = await reportsService.getAdjustmentLossExpenses(TENANT_ID, '2026-06-01', '2026-06-30');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.robo.count).toBe(1);
      expect(result.data.robo.estimatedCount).toBe(0);
      expect(result.data.robo.totalUsd).toBe(5);
      expect(result.data.estimatedTotalUsd).toBe(0);
    }
  });
});
