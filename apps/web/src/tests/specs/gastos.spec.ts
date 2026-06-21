/**
 * Gastos BDD Tests — GASTOS-001..014
 * TDD: Unit tests for gastosService with mocked Dexie + syncQueue + outbox
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockExpense {
  id: string;
  tenantId: string;
  createdByUserId: string;
  category: string;
  amountUsd: number;
  exchangeRate: number;
  amountBs: number;
  description?: string;
  date: string;
  isRecurring: boolean;
  recurrenceType?: string;
  nextDueDate?: string;
  parentExpenseId?: string;
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
      sortBy: async (field: string) => [...currentItems].sort((a, b) => ((b as Record<string, unknown>)[field] as string ?? '').localeCompare(((a as Record<string, unknown>)[field] as string ?? ''))),
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
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockExpenses.findIndex((e) => e.id === id);
        if (idx >= 0) Object.assign(mockExpenses[idx], changes);
      }),
      where: vi.fn((field: string) => ({
        equals: vi.fn((value: string) => {
          const base = mockExpenses.filter((e) => (e as Record<string, unknown>)[field] === value);
          return filterChain(base);
        }),
        between: vi.fn(([valA1, valA2]: [string, string], [valB1, valB2]: [string, string]) => {
          // Composite index [tenantId+date]: where returns items matching the first key,
          // then between filters on the composite range
          const base = mockExpenses.filter((e) => {
            const composite = `${(e as Record<string, unknown>).tenantId}|${(e as Record<string, unknown>).date}`;
            return composite >= `${valA1}|${valA2}` && composite <= `${valB1}|${valB2}`;
          });
          return filterChain(base);
        }),
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
    getState: () => ({
      setTenantId: vi.fn(),
      addNotification: vi.fn(),
    }),
  },
}));

vi.mock('../../features/exchange/stores/exchangeRateStore', () => ({
  useExchangeRateStore: { getState: () => ({ rate: 480 }) },
}));

vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ session: { userId: '550e8400-e29b-41d4-a716-446655440001', role: 'owner' } }) },
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
  toSnake: (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = v;
    }
    return out;
  },
}));

const TENANT_ID = 'test-tenant';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    category: 'LUZ' as const,
    amountUsd: 50,
    exchangeRate: 480,
    description: 'Pago luz mensual',
    date: '2026-05-01',
    isRecurring: false,
    ...overrides,
  };
}

function insertExpense(overrides: Partial<MockExpense> = {}): MockExpense {
  const expense: MockExpense = {
    id: '550e8400-e29b-41d4-a716-446655440099',
    tenantId: TENANT_ID,
    createdByUserId: USER_ID,
    category: 'LUZ',
    amountUsd: 50,
    exchangeRate: 480,
    amountBs: 24000,
    description: 'Pago luz',
    date: '2026-05-01',
    isRecurring: false,
    status: 'paid',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
  mockExpenses.push(expense);
  return expense;
}

describe('GASTOS-001: Crear gasto — happy path', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: input válido. When: crear. Then: gasto creado con amountBs calculado', async () => {
    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.create(TENANT_ID, USER_ID, makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.category).toBe('LUZ');
    expect(result.data.amountUsd).toBe(50);
    expect(result.data.amountBs).toBe(24000);
    expect(result.data.status).toBe('paid');
  });
});

describe('GASTOS-002: Crear gasto recurrente', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: isRecurring=true. When: crear. Then: recurrenceType=monthly, nextDueDate=fecha', async () => {
    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.create(TENANT_ID, USER_ID, makeInput({
      isRecurring: true,
      recurrenceType: 'monthly',
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isRecurring).toBe(true);
    expect(result.data.recurrenceType).toBe('monthly');
    expect(result.data.nextDueDate).toBe('2026-05-01');
  });

  it('Given: recurrente sin recurrenceType. When: crear. Then: default monthly', async () => {
    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.create(TENANT_ID, USER_ID, makeInput({ isRecurring: true }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recurrenceType).toBe('monthly');
  });
});

describe('GASTOS-003: Crear gasto — Zod validation via specs', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: amountUsd=0. When: validate CreateGastoInputSchema. Then: falla', async () => {
    const { CreateGastoInputSchema } = await import('../../specs/gastos/index');
    const result = CreateGastoInputSchema.safeParse(makeInput({ amountUsd: 0 }));
    expect(result.success).toBe(false);
  });

  it('Given: amountUsd negativo. When: validate. Then: falla', async () => {
    const { CreateGastoInputSchema } = await import('../../specs/gastos/index');
    const result = CreateGastoInputSchema.safeParse(makeInput({ amountUsd: -10 }));
    expect(result.success).toBe(false);
  });

  it('Given: categoría inválida. When: validate. Then: falla', async () => {
    const { CreateGastoInputSchema } = await import('../../specs/gastos/index');
    const result = CreateGastoInputSchema.safeParse(makeInput({ category: 'INVALIDA' }));
    expect(result.success).toBe(false);
  });

  it('Given: date vacío. When: validate. Then: falla', async () => {
    const { CreateGastoInputSchema } = await import('../../specs/gastos/index');
    const result = CreateGastoInputSchema.safeParse(makeInput({ date: '' }));
    expect(result.success).toBe(false);
  });
});

describe('GASTOS-004: Obtener todos los gastos', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: 3 gastos. When: getAll. Then: retorna 3', async () => {
    insertExpense({ id: 'exp-1', date: '2026-05-01' });
    insertExpense({ id: 'exp-2', date: '2026-05-02' });
    insertExpense({ id: 'exp-3', date: '2026-05-03' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getAll(TENANT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(3);
  });

  it('Given: gasto deleted. When: getAll. Then: no lo incluye', async () => {
    insertExpense({ id: 'exp-1', deletedAt: '2026-05-01T00:00:00Z' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getAll(TENANT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(0);
  });

  it('Given: template recurrente sin parentExpenseId. When: getAll. Then: no lo incluye', async () => {
    insertExpense({ id: 'tpl-1', isRecurring: true, parentExpenseId: undefined });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getAll(TENANT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(0);
  });

  it('Given: gasto categoría LUZ. When: filter category=AGUA. Then: 0 resultados', async () => {
    insertExpense({ id: 'exp-1', category: 'LUZ' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getAll(TENANT_ID, { category: 'AGUA' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(0);
  });

  it('Given: gasto status=pending. When: filter status=paid. Then: 0 resultados', async () => {
    insertExpense({ id: 'exp-1', status: 'pending' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getAll(TENANT_ID, { status: 'paid' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(0);
  });
});

describe('GASTOS-005: Obtener gasto por ID', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: gasto existe. When: getById. Then: retorna el gasto', async () => {
    insertExpense({ id: 'exp-1' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getById(TENANT_ID, 'exp-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).not.toBeNull();
    expect(result.data!.id).toBe('exp-1');
  });

  it('Given: gasto no existe. When: getById. Then: null', async () => {
    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getById(TENANT_ID, 'nonexistent');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeNull();
  });

  it('Given: gasto deleted. When: getById. Then: null', async () => {
    insertExpense({ id: 'exp-1', deletedAt: '2026-05-01T00:00:00Z' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getById(TENANT_ID, 'exp-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeNull();
  });
});

describe('GASTOS-006: Actualizar gasto', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: gasto existe. When: cambiar categoría. Then: categoría actualizada', async () => {
    insertExpense({ id: 'exp-1', category: 'LUZ' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.update(TENANT_ID, 'exp-1', { category: 'AGUA' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.category).toBe('AGUA');
  });

  it('Given: gasto no existe. When: actualizar. Then: GASTOS_NOT_FOUND', async () => {
    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.update(TENANT_ID, 'nonexistent', { category: 'AGUA' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('GASTOS_NOT_FOUND');
  });

  it('Given: gasto de otro tenant. When: actualizar. Then: GASTOS_NOT_FOUND', async () => {
    insertExpense({ id: 'exp-1', tenantId: 'other-tenant' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.update(TENANT_ID, 'exp-1', { category: 'AGUA' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('GASTOS_NOT_FOUND');
  });
});

describe('GASTOS-007: Pagar gasto pendiente', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: gasto pending. When: status=paid. Then: amountBs recalculado con tasa actual', async () => {
    insertExpense({ id: 'exp-1', status: 'pending', amountUsd: 100, exchangeRate: 400 });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.update(TENANT_ID, 'exp-1', { status: 'paid' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('paid');
    expect(result.data.amountBs).toBe(48000);
  });
});

describe('GASTOS-008: Eliminar gasto (soft delete)', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: gasto existe. When: remove. Then: deletedAt seteado', async () => {
    insertExpense({ id: 'exp-1' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.remove(TENANT_ID, 'exp-1');

    expect(result.ok).toBe(true);
    const updated = mockExpenses.find((e) => e.id === 'exp-1');
    expect(updated?.deletedAt).toBeDefined();
  });

  it('Given: gasto no existe. When: remove. Then: GASTOS_NOT_FOUND', async () => {
    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.remove(TENANT_ID, 'nonexistent');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('GASTOS_NOT_FOUND');
  });
});

describe('GASTOS-009: Templates recurrentes', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: 2 templates. When: getRecurringTemplates. Then: retorna 2', async () => {
    insertExpense({ id: 'tpl-1', isRecurring: true, nextDueDate: '2026-06-01' });
    insertExpense({ id: 'tpl-2', isRecurring: true, nextDueDate: '2026-05-15' });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getRecurringTemplates(TENANT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(2);
  });

  it('Given: 1 template + 1 gasto normal. When: getRecurringTemplates. Then: solo el template', async () => {
    insertExpense({ id: 'tpl-1', isRecurring: true, nextDueDate: '2026-06-01' });
    insertExpense({ id: 'exp-1', isRecurring: false });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.getRecurringTemplates(TENANT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe('tpl-1');
  });
});

describe('GASTOS-010: Generar ocurrencia recurrente', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: template vencido. When: checkAndGenerate. Then: crea instancia + avanza nextDueDate', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    insertExpense({
      id: 'tpl-1', isRecurring: true, recurrenceType: 'monthly',
      nextDueDate: today, status: 'paid', amountUsd: 100, exchangeRate: 480,
    });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.checkAndGenerateRecurring(TENANT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(1);
    expect(result.data[0].isRecurring).toBe(false);
    expect(result.data[0].parentExpenseId).toBe('tpl-1');
    expect(result.data[0].status).toBe('pending');
  });
});

describe('GASTOS-011: Prevenir duplicados de ocurrencia', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: instancia ya existe hoy. When: checkAndGenerate. Then: no crea duplicado', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    insertExpense({
      id: 'tpl-1', isRecurring: true, recurrenceType: 'monthly',
      nextDueDate: today, status: 'paid',
    });
    insertExpense({
      id: 'inst-1', isRecurring: false, parentExpenseId: 'tpl-1',
      date: today, status: 'pending',
    });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.checkAndGenerateRecurring(TENANT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBe(0);
  });
});

describe('GASTOS-012: Cancelar ocurrencia', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: instancia pending. When: cancelOccurrence. Then: status=cancelled', async () => {
    insertExpense({
      id: 'inst-1', isRecurring: false, parentExpenseId: 'tpl-1',
      date: '2026-05-15', status: 'pending',
    });

    const { gastosService } = await import('../../features/gastos/services/gastosService');
    const result = await gastosService.cancelOccurrence(TENANT_ID, 'tpl-1', '2026-05-15');

    expect(result.ok).toBe(true);
    const updated = mockExpenses.find((e) => e.id === 'inst-1');
    expect(updated?.status).toBe('cancelled');
  });
});

describe('GASTOS-014: Categorías válidas', () => {
  beforeEach(() => { resetMockDb(); });

  const VALID_CATEGORIES = ['LUZ', 'AGUA', 'GAS', 'INTERNET', 'ALQUILER', 'NOMINA', 'IMPUESTOS', 'OTROS'] as const;

  for (const cat of VALID_CATEGORIES) {
    it(`Given: categoría=${cat}. When: crear. Then: exitoso`, async () => {
      const { gastosService } = await import('../../features/gastos/services/gastosService');
      const result = await gastosService.create(TENANT_ID, USER_ID, makeInput({ category: cat }));
      expect(result.ok).toBe(true);
    });
  }
});
