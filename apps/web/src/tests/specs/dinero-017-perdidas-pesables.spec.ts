import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMovements: Array<Record<string, unknown>> = [];
const mockProducts: Array<Record<string, unknown>> = [];
const mockRates: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockMovements.length = 0;
  mockProducts.length = 0;
  mockRates.length = 0;
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
      where: vi.fn(() => ({ filter: () => ({ toArray: async () => [] }), toArray: async () => [] })),
    },
    exchangeRates: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          filter: () => ({ toArray: async () => mockRates }),
          toArray: async () => mockRates,
        })),
      })),
    },
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

describe('DINERO-017: pérdidas pesables dividen por 1000 cuando costUsd undefined', () => {
  beforeEach(() => resetMockDb());

  it('Given: pérdida 1kg arroz pesable, costUsd=undefined, priceUsd=1.50. When: getAdjustmentLossExpenses. Then: costUsd = $0.75 (1×$1.50×0.5), NO $750', async () => {
    mockMovements.push({
      id: 'mov-p', tenantId: TENANT_ID, productId: 'prod-arroz',
      type: 'adjustment', quantity: -1000, reasonType: 'perdida',
      costUsd: undefined, createdAt: '2026-06-05T10:00:00Z', deletedAt: null,
    });
    mockProducts.push({
      id: 'prod-arroz', tenantId: TENANT_ID, name: 'Arroz',
      priceUsd: 1.5, isWeighted: true, isSellable: true, unit: 'kg', stock: 0,
    });
    mockRates.push({ id: 'r1', tenantId: TENANT_ID, rate: 36, createdAt: '2026-06-05T10:00:00Z' });

    const result = await reportsService.getAdjustmentLossExpenses(TENANT_ID, '2026-06-01', '2026-06-30');
    if (!result.ok) console.error('Test 1 error:', result.error);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.perdida.count).toBe(1);
      expect(result.data.perdida.estimatedCount).toBe(1);
      expect(result.data.perdida.totalUsd).toBe(0.75);
    }
  });

  it('Given: pérdida 200g arroz pesable con costUsd=$0.30 (WAC capturado). When: getAdjustmentLossExpenses. Then: costUsd = $0.30 (usa costUsd, no estimación)', async () => {
    mockMovements.push({
      id: 'mov-2', tenantId: TENANT_ID, productId: 'prod-arroz',
      type: 'adjustment', quantity: -200, reasonType: 'robo',
      costUsd: 0.3, createdAt: '2026-06-05T10:00:00Z', deletedAt: null,
    });
    mockRates.push({ id: 'r1', tenantId: TENANT_ID, rate: 36, createdAt: '2026-06-05T10:00:00Z' });

    const result = await reportsService.getAdjustmentLossExpenses(TENANT_ID, '2026-06-01', '2026-06-30');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.robo.count).toBe(1);
      expect(result.data.robo.estimatedCount).toBe(0);
      expect(result.data.robo.totalUsd).toBe(0.3);
    }
  });

  it('Given: pérdida 5 unidades de "Lata atún" (no pesable), costUsd=undefined, priceUsd=$1. When: getAdjustmentLossExpenses. Then: costUsd = $2.50 (sin cambio regresión PLAN-107)', async () => {
    mockMovements.push({
      id: 'mov-3', tenantId: TENANT_ID, productId: 'prod-atun',
      type: 'adjustment', quantity: -5, reasonType: 'vencido',
      costUsd: undefined, createdAt: '2026-06-05T10:00:00Z', deletedAt: null,
    });
    mockProducts.push({
      id: 'prod-atun', tenantId: TENANT_ID, name: 'Lata atún',
      priceUsd: 1, isWeighted: false, isSellable: true, unit: 'unidad', stock: 0,
    });
    mockRates.push({ id: 'r1', tenantId: TENANT_ID, rate: 36, createdAt: '2026-06-05T10:00:00Z' });

    const result = await reportsService.getAdjustmentLossExpenses(TENANT_ID, '2026-06-01', '2026-06-30');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.vencido.count).toBe(1);
      expect(result.data.vencido.estimatedCount).toBe(1);
      expect(result.data.vencido.totalUsd).toBe(2.5);
    }
  });
});
