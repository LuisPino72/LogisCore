import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSuppliers: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockSuppliers.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  return {
    suppliers: {
      add: vi.fn(async (s: Record<string, unknown>) => {
        mockSuppliers.push(s);
        return s.id as string;
      }),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockSuppliers.findIndex((s) => s.id === id);
        if (idx >= 0) mockSuppliers[idx] = { ...mockSuppliers[idx], ...changes };
        return 1;
      }),
      where: vi.fn((criteria: Record<string, unknown> = {}) => {
        const tenantId = criteria.tenantId as string | undefined;
        const tenantFiltered = tenantId !== undefined
          ? mockSuppliers.filter((s) => s.tenantId === tenantId)
          : mockSuppliers;
        return {
          filter: (predicate: (i: unknown) => boolean) => ({
            first: async () => {
              const filtered = tenantFiltered.filter(predicate);
              return filtered[0] ?? null;
            },
            toArray: async () => tenantFiltered.filter(predicate),
          }),
          toArray: async () => tenantFiltered,
        };
      }),
    },
    purchaseOrders: { where: vi.fn(() => ({ count: vi.fn(async () => 0), filter: () => ({ count: async () => 0 }) })) },
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
vi.mock('../../services/utils/id', () => ({
  generateId: () => `id-${Math.random().toString(36).slice(2, 10)}`,
}));
vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithAudit: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../services/audit/auditService', () => ({
  queueAuditLocally: vi.fn(async () => undefined),
  logAuditEvent: vi.fn(async () => undefined),
}));

import { purchaseService } from '../../features/purchases/services/purchaseService';
import { PurchaseErrors } from '../../specs/purchases/errors';

const TENANT_ID = 'tenant-1';

describe('DINERO-007 (A2): RIF único por tenant activo', () => {
  beforeEach(() => resetMockDb());

  it('Given: supplier activo con RIF=J123456789. When: createSupplier(J123456789). Then: failure(SUPPLIER_RIF_DUPLICATE)', async () => {
    mockSuppliers.push({
      id: 'sup-existing', tenantId: TENANT_ID, name: 'Distribuidora XYZ',
      rif: 'J123456789', deletedAt: null, createdAt: '2026-01-01',
    });

    const result = await purchaseService.createSupplier(TENANT_ID, 'user-1', {
      name: 'Otra Distribuidora', rif: 'J123456789',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(PurchaseErrors.SUPPLIER_RIF_DUPLICATE);
    }
  });

  it('Given: supplier soft-deleted con RIF=J123456789. When: createSupplier(J123456789). Then: success (permite reusar)', async () => {
    mockSuppliers.push({
      id: 'sup-deleted', tenantId: TENANT_ID, name: 'Distribuidora Borrada',
      rif: 'J123456789', deletedAt: '2026-05-01', createdAt: '2026-01-01',
    });

    const result = await purchaseService.createSupplier(TENANT_ID, 'user-1', {
      name: 'Distribuidora Nueva', rif: 'J123456789',
    });

    expect(result.ok).toBe(true);
  });

  it('Given: 2 tenants con mismo RIF. When: cada uno crea supplier. Then: ambos success (aislamiento por tenant)', async () => {
    mockSuppliers.push({
      id: 'sup-tenant-a', tenantId: 'tenant-A', name: 'A',
      rif: 'J123456789', deletedAt: null, createdAt: '2026-01-01',
    });

    const resultB = await purchaseService.createSupplier('tenant-B', 'user-1', {
      name: 'B', rif: 'J123456789',
    });
    if (!resultB.ok) console.error('Test 3 error:', resultB.error);

    expect(resultB.ok).toBe(true);
  });

  it('Given: supplier activo con RIF distinto. When: createSupplier(nuevo RIF). Then: success', async () => {
    mockSuppliers.push({
      id: 'sup-existing', tenantId: TENANT_ID, name: 'A',
      rif: 'J111111111', deletedAt: null, createdAt: '2026-01-01',
    });

    const result = await purchaseService.createSupplier(TENANT_ID, 'user-1', {
      name: 'B', rif: 'J222222222',
    });

    expect(result.ok).toBe(true);
  });
});
