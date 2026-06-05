import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSales: Array<Record<string, unknown>> = [];
const mockCustomers: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockSales.length = 0;
  mockCustomers.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  return {
    sales: {
      where: vi.fn((criteria: Record<string, unknown>) => ({
        filter: (predicate: (s: Record<string, unknown>) => boolean) => ({
          toArray: async () => mockSales.filter((s) => Object.entries(criteria).every(([k, v]) => s[k] === v)).filter(predicate),
        }),
      })),
    },
    customers: {
      get: vi.fn(async (id: string) => mockCustomers.find((c) => c.id === id) ?? null),
      where: vi.fn(() => ({
        anyOf: vi.fn((ids: string[]) => ({
          filter: (predicate: (c: Record<string, unknown>) => boolean) => ({
            toArray: async () => mockCustomers.filter((c) => ids.includes(c.id as string)).filter(predicate),
          }),
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
vi.mock('../../lib/logger', () => ({
  logger: { error: (...args: unknown[]) => console.error('LOGGER_ERROR', ...args) },
}));

import { customerService } from '../../features/customers/services/customerService';

const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'cust-1';

describe('DINERO-020: CLV refleja subtotal facturado (sin IGTF+IVA)', () => {
  beforeEach(() => resetMockDb());

  it('Given: cliente con 5 ventas (subtotalBs=100, ivaBs=16, igtfBs=10, totalBs=126, rate=10). When: getCustomerStats. Then: totalSpentUsd = 50 (5×$10), NO $63 (que incluiría impuestos)', async () => {
    mockCustomers.push({ id: CUSTOMER_ID, tenantId: TENANT_ID, name: 'Cliente A', deletedAt: null, createdAt: '2026-01-01T00:00:00Z' });
    for (let i = 1; i <= 5; i++) {
      mockSales.push({
        id: `s-${i}`, tenantId: TENANT_ID, customerId: CUSTOMER_ID,
        subtotalBs: 100, ivaBs: 16, igtfBs: 10, totalBs: 126,
        exchangeRate: 10, status: 'completed', deletedAt: null,
        createdAt: `2026-05-${10 + i}T10:00:00Z`,
      });
    }

    const result = await customerService.getCustomerStats(CUSTOMER_ID, TENANT_ID);
    if (!result.ok) console.error('Test 1 error:', result.error);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalSpentUsd).toBe(50);
      expect(result.data.purchaseCount).toBe(5);
    }
  });

  it('Given: cliente sin ventas. When: getCustomerStats. Then: totalSpentUsd = 0', async () => {
    mockCustomers.push({ id: CUSTOMER_ID, tenantId: TENANT_ID, name: 'Cliente B', deletedAt: null, createdAt: '2026-01-01T00:00:00Z' });

    const result = await customerService.getCustomerStats(CUSTOMER_ID, TENANT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalSpentUsd).toBe(0);
      expect(result.data.totalSpentBs).toBe(0);
      expect(result.data.purchaseCount).toBe(0);
    }
  });

  it('Given: cliente con 2 ventas USD (subtotalBs=200, rate=10 → $20 c/u) + 1 venta VES (subtotalBs=150, rate=10 → $15). When: getCustomerStats. Then: totalSpentUsd = 55 (suma en USD estable)', async () => {
    mockCustomers.push({ id: CUSTOMER_ID, tenantId: TENANT_ID, name: 'Cliente C', deletedAt: null, createdAt: '2026-01-01T00:00:00Z' });
    mockSales.push(
      { id: 's-1', tenantId: TENANT_ID, customerId: CUSTOMER_ID, subtotalBs: 200, ivaBs: 32, igtfBs: 20, totalBs: 252, exchangeRate: 10, status: 'completed', deletedAt: null, createdAt: '2026-05-10T10:00:00Z' },
      { id: 's-2', tenantId: TENANT_ID, customerId: CUSTOMER_ID, subtotalBs: 200, ivaBs: 32, igtfBs: 0, totalBs: 232, exchangeRate: 10, status: 'completed', deletedAt: null, createdAt: '2026-05-15T10:00:00Z' },
      { id: 's-3', tenantId: TENANT_ID, customerId: CUSTOMER_ID, subtotalBs: 150, ivaBs: 24, igtfBs: 0, totalBs: 174, exchangeRate: 10, status: 'completed', deletedAt: null, createdAt: '2026-05-20T10:00:00Z' },
    );

    const result = await customerService.getCustomerStats(CUSTOMER_ID, TENANT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalSpentUsd).toBe(55);
    }
  });
});
