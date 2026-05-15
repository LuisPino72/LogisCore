import { vi } from 'vitest';

type MockTable = Record<string, ReturnType<typeof vi.fn>>;

function mockTable(fns: Record<string, unknown> = {}): MockTable {
  const defaults = {
    get: vi.fn(),
    add: vi.fn(),
    put: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    where: vi.fn(),
    toArray: vi.fn(),
    first: vi.fn(),
    filter: vi.fn(),
    sortBy: vi.fn(),
    count: vi.fn(),
    modify: vi.fn(),
    clear: vi.fn(),
    bulkAdd: vi.fn(),
    bulkDelete: vi.fn(),
    bulkGet: vi.fn(),
    bulkPut: vi.fn(),
  };
  return { ...defaults, ...fns };
}

export function createMockDb(tables?: Record<string, MockTable>) {
  const db = {
    products: mockTable(),
    categories: mockTable(),
    inventoryMovements: mockTable(),
    inventoryLots: mockTable(),
    sales: mockTable(),
    saleItems: mockTable(),
    cashRegisters: mockTable(),
    suppliers: mockTable(),
    purchaseOrders: mockTable(),
    purchaseOrderItems: mockTable(),
    parkedCarts: mockTable(),
    productFavorites: mockTable(),
    syncQueue: mockTable({ add: vi.fn(), enqueue: vi.fn() }),
    outbox: mockTable({ add: vi.fn() }),
    tenantRefs: mockTable(),
    transaction: vi.fn((_mode: unknown, _tables: unknown[], fn: () => Promise<void>) => fn()),
  };

  if (tables) {
    for (const [key, overrides] of Object.entries(tables)) {
      if (db[key as keyof typeof db]) {
        Object.assign(db[key as keyof typeof db], overrides);
      }
    }
  }

  return db;
}

type MockDb = ReturnType<typeof createMockDb>;

export function setupCommonMocks(mockDb: MockDb) {
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
  }));

  vi.mock('../../services/supabase/client', () => ({
    supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null })) })) })) })) },
  }));

  vi.mock('@logiscope/core', () => ({
    AppError: class AppError extends Error {
      code: string;
      constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'AppError'; }
    },
    success: <T>(data: T) => ({ ok: true, data }) as const,
    failure: (err: Error) => ({ ok: false, error: err }) as const,
    EventBus: { on: vi.fn(() => ({ event: '', listener: vi.fn() })), off: vi.fn(), emit: vi.fn() },
    SystemEvents: { USER_LOGIN: 'USER_LOGIN', USER_LOGOUT: 'USER_LOGOUT' },
    isAppError: (err: Error) => err.name === 'AppError',
  }));
}

export function resetMockDbChains(mockDb: MockDb) {
  vi.clearAllMocks();

  const emptyFilter = () => ({ toArray: vi.fn(() => Promise.resolve([])), count: vi.fn(() => Promise.resolve(0)) });

  for (const table of ['products', 'categories', 'suppliers', 'purchaseOrders', 'inventoryMovements', 'inventoryLots', 'sales', 'saleItems', 'cashRegisters'] as const) {
    if (mockDb[table]?.where) {
      mockDb[table].where.mockReturnValue({ filter: vi.fn(emptyFilter) });
    }
  }
}

export type { MockDb };
