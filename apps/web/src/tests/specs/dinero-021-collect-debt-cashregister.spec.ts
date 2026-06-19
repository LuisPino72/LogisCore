import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCustomers: Array<Record<string, unknown>> = [];
const mockSales: Array<Record<string, unknown>> = [];
const mockCashRegisters: Array<Record<string, unknown>> = [];
const mockCreditPayments: Array<Record<string, unknown>> = [];
let mockTxLog: Array<string> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockCustomers.length = 0;
  mockSales.length = 0;
  mockCashRegisters.length = 0;
  mockCreditPayments.length = 0;
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
vi.mock('@logiscore/shared', () => ({
  preciseRound: (n: number, d: number) => {
    const factor = Math.pow(10, d);
    return Math.round(n * factor) / factor;
  },
  generateId: () => 'mock-id-' + Date.now(),
  toSnake,
  MAX_CENTS_DIFFERENCE: 0.01,
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

  const txCashReg = makeTable(mockCashRegisters);
  const txCustomers = makeTable(mockCustomers);
  const txSales = makeTable(mockSales);
  const txCreditPayments = makeTable(mockCreditPayments);

  return {
    customers: makeTable(mockCustomers),
    sales: makeTable(mockSales),
    cashRegisters: makeTable(mockCashRegisters),
    creditPayments: makeTable(mockCreditPayments),
    syncQueue: { enqueue: vi.fn() },
    outbox: {},
    transaction: vi.fn(async (_mode: string, _tables: string[], cb: (tx: Record<string, unknown>) => Promise<void>) => {
      await cb({
        customers: txCustomers,
        sales: txSales,
        cashRegisters: txCashReg,
        creditPayments: txCreditPayments,
      });
    }),
  };
}

import { customerService } from '../../features/customers/services/customerService';

const TENANT_ID = 't1';
const CUSTOMER_ID = 'cust-1';
const SALE_ID = 'sale-1';

describe('FUGA-1: collectDebt actualiza collectedDebtBs en cashRegister', () => {
  beforeEach(() => resetMockDb());

  it('Given: caja abierta + venta crédito. When: cobrar deuda. Then: collectedDebtBs se incrementa', async () => {
    mockCustomers.push({
      id: CUSTOMER_ID, tenantId: TENANT_ID, name: 'Cliente A',
      balance: 100, deletedAt: null, createdAt: '2026-01-01T00:00:00Z',
    });
    mockSales.push({
      id: SALE_ID, tenantId: TENANT_ID, customerId: CUSTOMER_ID,
      isCreditSale: true, creditCollected: false,
      subtotalBs: 100, ivaBs: 16, igtfBs: 0, totalBs: 116,
      totalUsd: 10, exchangeRate: 11.6,
      status: 'completed', deletedAt: null, createdAt: '2026-06-18T10:00:00Z',
    });
    mockCashRegisters.push({
      id: 'reg-1', tenantId: TENANT_ID, isOpen: true,
      openingBalanceBs: 0, totalSalesBs: 0, collectedDebtBs: 0,
      deletedAt: null, createdAt: '2026-06-18T08:00:00Z',
    });

    const result = await customerService.collectDebt(CUSTOMER_ID, SALE_ID, 100, 'efectivo_bs', TENANT_ID, 11.6);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newBalance).toBe(0);
      const reg = mockCashRegisters.find((r) => r.id === 'reg-1');
      expect(reg).toBeDefined();
      expect(reg!.collectedDebtBs).toBe(1160);
    }
  });

  it('Given: NO hay caja abierta. When: cobrar deuda. Then: éxito pero no falla por caja', async () => {
    mockCustomers.push({
      id: CUSTOMER_ID, tenantId: TENANT_ID, name: 'Cliente B',
      balance: 50, deletedAt: null, createdAt: '2026-01-01T00:00:00Z',
    });
    mockSales.push({
      id: SALE_ID, tenantId: TENANT_ID, customerId: CUSTOMER_ID,
      isCreditSale: true, creditCollected: false,
      subtotalBs: 50, ivaBs: 8, igtfBs: 0, totalBs: 58,
      totalUsd: 5, exchangeRate: 11.6,
      status: 'completed', deletedAt: null, createdAt: '2026-06-18T10:00:00Z',
    });
    // No open cash register

    const result = await customerService.collectDebt(CUSTOMER_ID, SALE_ID, 50, 'efectivo_bs', TENANT_ID, 11.6);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newBalance).toBe(0);
      // No cash register to update, but function should succeed
      expect(mockCashRegisters.length).toBe(0);
    }
  });

  it('Given: caja abierta + pago parcial. When: abonar $30 de $100. Then: collectedDebtBs incrementa $30', async () => {
    mockCustomers.push({
      id: CUSTOMER_ID, tenantId: TENANT_ID, name: 'Cliente C',
      balance: 100, deletedAt: null, createdAt: '2026-01-01T00:00:00Z',
    });
    mockSales.push({
      id: SALE_ID, tenantId: TENANT_ID, customerId: CUSTOMER_ID,
      isCreditSale: true, creditCollected: false,
      subtotalBs: 100, ivaBs: 16, igtfBs: 0, totalBs: 116,
      totalUsd: 10, exchangeRate: 11.6,
      status: 'completed', deletedAt: null, createdAt: '2026-06-18T10:00:00Z',
    });
    mockCashRegisters.push({
      id: 'reg-2', tenantId: TENANT_ID, isOpen: true,
      openingBalanceBs: 0, totalSalesBs: 0, collectedDebtBs: 0,
      deletedAt: null, createdAt: '2026-06-18T08:00:00Z',
    });

    const result = await customerService.collectDebt(CUSTOMER_ID, SALE_ID, 30, 'efectivo_usd', TENANT_ID, 11.6);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newBalance).toBe(70);
      const reg = mockCashRegisters.find((r) => r.id === 'reg-2');
      expect(reg).toBeDefined();
      expect(reg!.collectedDebtBs).toBe(348);
    }
  });
});
