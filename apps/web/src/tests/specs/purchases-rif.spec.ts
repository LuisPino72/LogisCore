/**
 * BACKLOG-106 [PURCHASES-001] BDD Tests — 5 escenarios del campo RIF en suppliers
 *
 * Cubre: validación Zod, persistencia Dexie, normalización uppercase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = {
  suppliers: { add: vi.fn(), put: vi.fn(), get: vi.fn(), where: vi.fn() },
  syncQueue: { add: vi.fn() },
  outbox: { add: vi.fn() },
  transaction: vi.fn((_mode: unknown, _tables: unknown[], fn: () => Promise<void>) => fn()),
};

function resetMockDb() {
  vi.clearAllMocks();
  mockDb.suppliers.where.mockReturnValue({
    filter: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(null)) })),
  });
}

vi.mock('../../services/dexie/db', () => ({
  getDb: () => mockDb,
  isDbReady: () => true,
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn(), getUser: vi.fn() } },
}));

vi.mock('../../services/sync/syncQueue', () => ({
  syncQueue: { enqueue: vi.fn() },
}));

vi.mock('../../services/outbox/outboxService', () => ({
  outboxService: { enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })) },
}));

vi.mock('../../services/network/requireNetwork', () => ({
  requireNetwork: vi.fn(() => ({ ok: true })),
}));

vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithAudit: vi.fn(),
}));

vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      session: { userId: 'u-1', email: 'o@bodega.com', role: 'owner', tenantId: 't-1' },
    })),
  },
}));

import { purchaseService } from '../../features/purchases/services/purchaseService';
import { SupplierSchema, CreateSupplierInputSchema } from '../../specs/purchases';

describe('PURCH-001: rif válido (J123456789) se acepta en CreateSupplierInput', () => {
  it('Given: input con rif=J123456789. When: safeParse. Then: success', () => {
    const result = CreateSupplierInputSchema.safeParse({
      name: 'Distribuidora XYZ',
      rif: 'J123456789',
      phone: '04121234567',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rif).toBe('J123456789');
    }
  });

  it('acepta prefijos V/E/J/G/P (case-insensitive)', () => {
    const prefixes = ['V123456789', 'E123456789', 'J123456789', 'G123456789', 'P123456789', 'v123456789', 'e123456789'];
    for (const rif of prefixes) {
      const result = CreateSupplierInputSchema.safeParse({ name: 'X', rif });
      expect(result.success).toBe(true);
    }
  });
});

describe('PURCH-002: rif con formato inválido se rechaza', () => {
  const invalidRifs = [
    'X123456789',
    'J12345',
    'J1234567890',
    '123456789',
    'J-12345678-9',
    'JJ12345678',
  ];

  for (const rif of invalidRifs) {
    it(`rechaza rif inválido: "${rif}"`, () => {
      const result = CreateSupplierInputSchema.safeParse({ name: 'X', rif });
      expect(result.success).toBe(false);
    });
  }
});

describe('PURCH-003: rif undefined es aceptable (campo opcional)', () => {
  it('Given: input sin rif. When: validate. Then: success, rif=undefined', () => {
    const result = CreateSupplierInputSchema.safeParse({ name: 'Proveedor Sin RIF' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rif).toBeUndefined();
    }
  });
});

describe('PURCH-004: SupplierSchema (entidad completa) acepta rif válido', () => {
  it('validates full Supplier object con rif', () => {
    const supplier = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Distribuidora ABC',
      rif: 'J123456789',
      phone: '04121234567',
      createdAt: new Date().toISOString(),
    };
    const result = SupplierSchema.safeParse(supplier);
    if (!result.success) {
      console.error('PURCH-004 con rif error:', JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('validates full Supplier object sin rif', () => {
    const supplier = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
      name: 'Distribuidora Informal',
      createdAt: new Date().toISOString(),
    };
    const result = SupplierSchema.safeParse(supplier);
    if (!result.success) {
      console.error('PURCH-004 sin rif error:', JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });
});

describe('PURCH-005: createSupplier normaliza rif a uppercase', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('Given: rif en lowercase. When: createSupplier. Then: persisted as uppercase', async () => {
    const result = await purchaseService.createSupplier(
      'tenant-1',
      'user-1',
      { name: 'Test Supplier', rif: 'j123456789' },
    );
    if (!result.ok) {
      console.error('PURCH-005 lowercase error:', result.error);
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rif).toBe('J123456789');
    }
  });

  it('Given: rif undefined. When: createSupplier. Then: persisted as undefined', async () => {
    const result = await purchaseService.createSupplier(
      'tenant-1',
      'user-1',
      { name: 'Test Sin RIF' },
    );
    if (!result.ok) {
      console.error('PURCH-005 undefined error:', result.error);
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rif).toBeUndefined();
    }
  });
});
