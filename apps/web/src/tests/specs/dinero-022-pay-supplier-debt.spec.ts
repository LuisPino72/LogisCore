import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSuppliers: Array<Record<string, unknown>> = [];
const mockPurchaseOrders: Array<Record<string, unknown>> = [];
const mockSupplierPayments: Array<Record<string, unknown>> = [];
const mockExpenses: Array<Record<string, unknown>> = [];
let mockTxLog: Array<string> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockSuppliers.length = 0;
  mockPurchaseOrders.length = 0;
  mockSupplierPayments.length = 0;
  mockExpenses.length = 0;
  mockTxLog = [];
  mockDb = createMockDb();
}

function toSnake(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    out[k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())] = v;
  }
  return out;
}

vi.mock('../../services/dexie/db', () => ({
  getDb: () => mockDb,
  isDbReady: () => true,
}));
vi.mock('../../services/sync/syncQueue', () => ({
  syncQueue: {
    enqueue: vi.fn(async (_table: string, _op: string, _id: string, _data: Record<string, unknown>, _tenantId: string) => {
      mockTxLog.push(`syncQueue:${_table}.${_op}`);
    }),
  },
}));
vi.mock('../../services/outbox/outboxService', () => ({
  outboxService: {
    enqueue: vi.fn(async (_event: string, _module: string, _payload: Record<string, unknown>, _tx: unknown) => {
      mockTxLog.push(`outbox:${_event}`);
    }),
  },
}));
vi.mock('../../services/audit/emitWithAudit', () => ({
  logAuditEventOnly: vi.fn(async () => undefined),
  emitEngineEvent: vi.fn(),
}));
vi.mock('../../services/network/requireNetwork', () => ({
  requireNetwork: vi.fn(() => ({ ok: true, data: undefined })),
}));
vi.mock('@logiscope/core', () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'AppError'; }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: Error) => ({ ok: false, error: err }) as const,
}));
vi.mock('../../services/network/networkAwareService', () => ({
  networkAware: { isOnline: () => true },
}));
vi.mock('../../features/auth/services/roleGuard', () => ({
  requireRole: vi.fn(),
}));
vi.mock('../../services/tenantTranslator', () => ({
  TenantTranslator: {
    slugToUuid: vi.fn(async (_slug: string) => 'mock-uuid-' + _slug),
    uuidToSlug: vi.fn(async (_uuid: string) => 't1'),
  },
}));
vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      session: { userId: 'u1', email: 'a@b.c', role: 'owner', tenantId: 't1' },
    }),
  },
}));
vi.mock('../../services/supabase/client', () => ({
  supabase: {} as Record<string, unknown>,
}));
vi.mock('@logiscope/shared', () => ({
  preciseRound: (n: number, d: number) => {
    const factor = Math.pow(10, d);
    return Math.round(n * factor) / factor;
  },
  generateId: () => 'mock-id-' + Date.now(),
  toSnake,
}));

function createMockDb() {
  function makeTable(arr: Array<Record<string, unknown>>) {
    return {
      where: vi.fn((criteria: Record<string, unknown>) => {
        const base = () => arr.filter((r) =>
          Object.entries(criteria).every(([k, v]) => r[k] === v)
        );
        return {
          filter: (predicate: (r: Record<string, unknown>) => boolean) => ({
            first: async () => base().filter(predicate)[0] ?? null,
            toArray: async () => base().filter(predicate),
          }),
          first: async () => base()[0] ?? null,
          toArray: async () => base(),
        };
      }),
      get: vi.fn(async (id: string) => arr.find((r) => r.id === id) ?? null),
      add: vi.fn(async (item: Record<string, unknown>) => {
        arr.push(item);
        mockTxLog.push('add:' + (item.id as string));
      }),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = arr.findIndex((r) => r.id === id);
        if (idx >= 0) Object.assign(arr[idx], changes);
        mockTxLog.push('update:' + id);
      }),
    };
  }

  const txSuppliers = makeTable(mockSuppliers);
  const txPurchaseOrders = makeTable(mockPurchaseOrders);
  const txSupplierPayments = makeTable(mockSupplierPayments);
  const txExpenses = makeTable(mockExpenses);

  return {
    suppliers: txSuppliers,
    purchaseOrders: txPurchaseOrders,
    supplierPayments: txSupplierPayments,
    expenses: txExpenses,
    syncQueue: { enqueue: vi.fn() },
    outbox: {},
    transaction: vi.fn(async (_mode: string, _tables: string[], cb: (tx: Record<string, unknown>) => Promise<void>) => {
      await cb({
        table: (name: string) => {
          const map: Record<string, ReturnType<typeof makeTable>> = {
            suppliers: txSuppliers,
            purchaseOrders: txPurchaseOrders,
            supplierPayments: txSupplierPayments,
            expenses: txExpenses,
          };
          return map[name] ?? makeTable([]);
        },
      });
    }),
  };
}

import { purchaseService } from '../../features/purchases/services/purchaseService';

const TENANT_ID = 't1';
const SUPPLIER_ID = 'supp-1';
const ORDER_ID = 'ord-1';

describe('FUGA-3: paySupplierDebt registra pago a proveedor', () => {
  beforeEach(() => resetMockDb());

  it('Given: proveedor con deuda + orden pendiente. When: pago parcial. Then: newBalance > 0, paymentStatus = partially_paid', async () => {
    mockSuppliers.push({
      id: SUPPLIER_ID, tenantId: TENANT_ID, name: 'Proveedor A',
      balance: 200, deletedAt: null, createdAt: '2026-01-01T00:00:00Z',
    });
    mockPurchaseOrders.push({
      id: ORDER_ID, tenantId: TENANT_ID, supplierId: SUPPLIER_ID,
      totalUsd: 150, paidAmountUsd: 0, paymentStatus: 'pending',
      status: 'completed', deletedAt: null, createdAt: '2026-06-18T10:00:00Z',
    });

    const result = await purchaseService.paySupplierDebt(SUPPLIER_ID, ORDER_ID, 50, 'transferencia', TENANT_ID, 45);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newBalance).toBe(150);
      expect(result.data.newOrderPaidAmount).toBe(50);
    }

    const supplier = mockSuppliers.find((s) => s.id === SUPPLIER_ID);
    expect(supplier!.balance).toBe(150);

    const order = mockPurchaseOrders.find((o) => o.id === ORDER_ID);
    expect(order!.paidAmountUsd).toBe(50);
    expect(order!.paymentStatus).toBe('partially_paid');

    expect(mockTxLog.filter((l) => l.startsWith('syncQueue:')).length).toBe(3);
    expect(mockTxLog.filter((l) => l.startsWith('outbox:')).length).toBe(1);
    expect(mockTxLog.filter((l) => l.startsWith('add:')).length).toBe(1);
    expect(mockTxLog.filter((l) => l.startsWith('update:')).length).toBe(2);
    expect(mockTxLog).not.toContain('update:exp-1');
    expect(mockTxLog).not.toContain('outbox:EXPENSE.UPDATED');
    expect(mockTxLog).not.toContain('syncQueue:expenses.UPDATE');
  });

  it('Given: deuda exacta + expense asociado. When: pago completo. Then: newBalance = 0, paymentStatus = paid, expense.status = paid', async () => {
    mockSuppliers.push({
      id: SUPPLIER_ID, tenantId: TENANT_ID, name: 'Proveedor B',
      balance: 150, deletedAt: null, createdAt: '2026-01-01T00:00:00Z',
    });
    mockPurchaseOrders.push({
      id: ORDER_ID, tenantId: TENANT_ID, supplierId: SUPPLIER_ID,
      totalUsd: 150, paidAmountUsd: 0, paymentStatus: 'pending',
      status: 'completed', deletedAt: null, createdAt: '2026-06-18T10:00:00Z',
    });
    mockExpenses.push({
      id: 'exp-1', tenantId: TENANT_ID, purchaseOrderId: ORDER_ID,
      status: 'pending', deletedAt: null, createdAt: '2026-06-18T10:00:00Z',
    });

    const result = await purchaseService.paySupplierDebt(SUPPLIER_ID, ORDER_ID, 150, 'efectivo_usd', TENANT_ID, 45);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newBalance).toBe(0);
      expect(result.data.newOrderPaidAmount).toBe(150);
    }


    const supplier = mockSuppliers.find((s) => s.id === SUPPLIER_ID);
    expect(supplier!.balance).toBe(0);

    const order = mockPurchaseOrders.find((o) => o.id === ORDER_ID);
    expect(order!.paidAmountUsd).toBe(150);
    expect(order!.paymentStatus).toBe('paid');
    expect(order!.paidAt).toBeDefined();

    const expense = mockExpenses.find((e) => e.id === 'exp-1');
    expect(expense!.status).toBe('paid');

    expect(mockTxLog.filter((l) => l.startsWith('syncQueue:')).length).toBe(4);
    expect(mockTxLog).toContain('syncQueue:expenses.UPDATE');
    expect(mockTxLog.filter((l) => l.startsWith('outbox:')).length).toBe(2);
    expect(mockTxLog).toContain('outbox:EXPENSE.UPDATED');
    expect(mockTxLog.filter((l) => l.startsWith('add:')).length).toBe(1);
    expect(mockTxLog.filter((l) => l.startsWith('update:')).length).toBe(3);
    expect(mockTxLog).toContain('update:exp-1');
  });

  it('Given: supplier no existe. When: paySupplierDebt. Then: SUPPLIER_NOT_FOUND', async () => {
    mockSuppliers.length = 0;

    const result = await purchaseService.paySupplierDebt(SUPPLIER_ID, ORDER_ID, 50, 'transferencia', TENANT_ID, 45);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SUPPLIER_NOT_FOUND');
    }
  });

  it('Given: supplier.balance = 0. When: paySupplierDebt. Then: SUPPLIER_NO_DEBT', async () => {
    mockSuppliers.push({
      id: SUPPLIER_ID, tenantId: TENANT_ID, name: 'Proveedor C',
      balance: 0, deletedAt: null, createdAt: '2026-01-01T00:00:00Z',
    });

    const result = await purchaseService.paySupplierDebt(SUPPLIER_ID, ORDER_ID, 50, 'transferencia', TENANT_ID, 45);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SUPPLIER_NO_DEBT');
    }
  });

  it('Given: amountUsd > supplier.balance. When: paySupplierDebt. Then: PAYMENT_EXCEEDS_DEBT', async () => {
    mockSuppliers.push({
      id: SUPPLIER_ID, tenantId: TENANT_ID, name: 'Proveedor D',
      balance: 50, deletedAt: null, createdAt: '2026-01-01T00:00:00Z',
    });

    const result = await purchaseService.paySupplierDebt(SUPPLIER_ID, ORDER_ID, 100, 'transferencia', TENANT_ID, 45);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PAYMENT_EXCEEDS_DEBT');
    }
  });

  it('Given: order.paymentStatus = paid. When: paySupplierDebt. Then: ORDER_ALREADY_PAID', async () => {
    mockSuppliers.push({
      id: SUPPLIER_ID, tenantId: TENANT_ID, name: 'Proveedor E',
      balance: 100, deletedAt: null, createdAt: '2026-01-01T00:00:00Z',
    });
    mockPurchaseOrders.push({
      id: ORDER_ID, tenantId: TENANT_ID, supplierId: SUPPLIER_ID,
      totalUsd: 100, paidAmountUsd: 100, paymentStatus: 'paid',
      status: 'completed', deletedAt: null, createdAt: '2026-06-18T10:00:00Z',
    });

    const result = await purchaseService.paySupplierDebt(SUPPLIER_ID, ORDER_ID, 50, 'transferencia', TENANT_ID, 45);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ORDER_ALREADY_PAID');
    }
  });

  it('Given: paymentMethod inválido. When: paySupplierDebt. Then: INVALID_PAYMENT_METHOD', async () => {
    const result = await purchaseService.paySupplierDebt(SUPPLIER_ID, ORDER_ID, 50, 'invalid_method', TENANT_ID, 45);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PAYMENT_METHOD');
    }
  });
});
