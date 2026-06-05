/**
 * Reports BDD Tests — REPORTS-001
 * TDD: Unit tests for reportsService.getExpenseBreakdown + getExecutiveSummary
 * Verifica que COMPRA_INVENTARIO NO se cuenta como gasto operativo (ya está en COGS).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockExpense {
  id: string;
  tenantId: string;
  createdByUserId: string;
  category: string;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  description?: string;
  date: string;
  isRecurring: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  [key: string]: unknown;
}

const mockExpenses: MockExpense[] = [];

function createMockDb() {
  const filterChain = (baseItems: MockExpense[]) => {
    let currentItems = baseItems;
    const chain: Record<string, unknown> = {
      toArray: async () => [...currentItems],
      first: async () => currentItems[0] ?? null,
      count: async () => currentItems.length,
    };
    chain.filter = (predicate: (item: MockExpense) => boolean) => {
      currentItems = currentItems.filter(predicate);
      return chain;
    };
    return chain;
  };

  return {
    expenses: {
      add: vi.fn(async (e: MockExpense) => {
        mockExpenses.push({ ...e });
        return e.id;
      }),
      get: vi.fn(async (id: string) => mockExpenses.find((e) => e.id === id) ?? null),
      update: vi.fn(),
      where: vi.fn((field: string) => ({
        equals: vi.fn((value: string) => {
          const base = mockExpenses.filter((e) => (e as Record<string, unknown>)[field] === value);
          return filterChain(base);
        }),
        between: vi.fn(([valA1, valA2]: [string, string], [valB1, valB2]: [string, string]) => {
          const base = mockExpenses.filter((e) => {
            const composite = `${(e as Record<string, unknown>).tenantId}|${(e as Record<string, unknown>).date}`;
            return composite >= `${valA1}|${valA2}` && composite <= `${valB1}|${valB2}`;
          });
          return filterChain(base);
        }),
      })),
    },
    sales: {
      where: vi.fn(() => ({
        between: vi.fn(() => ({
          filter: vi.fn(() => ({
            toArray: async () => [],
          })),
        })),
      })),
    },
    saleItems: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          filter: vi.fn(() => ({
            toArray: async () => [],
          })),
        })),
      })),
    },
  };
}

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockExpenses.length = 0;
  mockDb = createMockDb();
}

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

vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithAudit: vi.fn(),
  emitEngineEvent: vi.fn(),
}));

vi.mock('../../stores/notificationStore', () => ({
  useNotificationStore: {
    getState: () => ({ setTenantId: vi.fn(), addNotification: vi.fn() }),
  },
}));

vi.mock('../../features/exchange/stores/exchangeRateStore', () => ({
  useExchangeRateStore: { getState: () => ({ rate: 480 }) },
}));

vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ session: { userId: '550e8400-e29b-41d4-a716-446655440001', email: 'owner@bodega.com', role: 'owner', tenantId: 'test-tenant-uuid' } }) },
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getSession: vi.fn(), signOut: vi.fn() },
  },
}));

vi.mock('@logiscore/core', () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg); this.code = code; this.name = 'AppError';
    }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: Error) => ({ ok: false, error: err }) as const,
  EventBus: { on: vi.fn(() => ({ event: '', listener: vi.fn() })), off: vi.fn(), emit: vi.fn() },
  SystemEvents: { SYNC_REFRESH_TABLE: 'SYNC.REFRESH_TABLE' },
}));

vi.mock('@logiscore/shared', () => ({
  preciseRound: (v: number, d: number) => {
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
  },
  generateId: () => '550e8400-e29b-41d4-a716-446655440099',
  toSnake: (obj: Record<string, unknown>) => obj,
}));

const TENANT_ID = 'test-tenant';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const TODAY = '2026-06-05';

function insertExpense(overrides: Partial<MockExpense> = {}): MockExpense {
  const expense: MockExpense = {
    id: `exp-${Math.random().toString(36).slice(2, 10)}`,
    tenantId: TENANT_ID,
    createdByUserId: USER_ID,
    category: 'LUZ',
    amountUsd: 50,
    amountBs: 24000,
    exchangeRate: 480,
    description: 'Pago luz',
    date: TODAY,
    isRecurring: false,
    status: 'paid',
    createdAt: `${TODAY}T00:00:00Z`,
    updatedAt: `${TODAY}T00:00:00Z`,
    ...overrides,
  };
  mockExpenses.push(expense);
  return expense;
}

describe('REPORTS-001: Filtro COMPRA_INVENTARIO en getExpenseBreakdown', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: 3 gastos operativos + 2 gastos COMPRA_INVENTARIO. When: getExpenseBreakdown. Then: solo los 3 operativos aparecen en breakdown', async () => {
    insertExpense({ id: 'exp-1', category: 'LUZ', amountUsd: 50 });
    insertExpense({ id: 'exp-2', category: 'AGUA', amountUsd: 30 });
    insertExpense({ id: 'exp-3', category: 'INTERNET', amountUsd: 20 });
    insertExpense({ id: 'exp-4', category: 'COMPRA_INVENTARIO', amountUsd: 200 });
    insertExpense({ id: 'exp-5', category: 'COMPRA_INVENTARIO', amountUsd: 150 });

    const { reportsService } = await import('../../features/reports/services/reportsService');
    const result = await reportsService.getExpenseBreakdown(TENANT_ID, {
      timeRange: 'today',
      startDate: undefined,
      endDate: undefined,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const operatingItems = result.data.filter((i: { type: string }) => i.type === 'operating');
    expect(operatingItems.length).toBe(3);
    const totalOperating = operatingItems.reduce(
      (s: number, i: { amountUsd: number }) => s + i.amountUsd,
      0
    );
    expect(totalOperating).toBe(100);
    const categories = operatingItems.map((i: { label: string }) => i.label);
    expect(categories).not.toContain('COMPRA_INVENTARIO');
  });
});

describe('REPORTS-001: Filtro COMPRA_INVENTARIO en getExecutiveSummary', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: gastos operativos $50 + COMPRA_INVENTARIO $200. When: getExecutiveSummary. Then: totalExpensesUsd = $50 (NO $250)', async () => {
    insertExpense({ id: 'exp-1', category: 'LUZ', amountUsd: 50 });
    insertExpense({ id: 'exp-2', category: 'COMPRA_INVENTARIO', amountUsd: 200 });

    const { reportsService } = await import('../../features/reports/services/reportsService');
    const result = await reportsService.getExecutiveSummary(TENANT_ID, {
      timeRange: 'today',
      startDate: undefined,
      endDate: undefined,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.totalExpensesUsd).toBe(50);
  });
});
