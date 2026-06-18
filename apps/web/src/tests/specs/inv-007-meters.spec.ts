/**
 * @vitest-environment jsdom
 * BDD Unit Tests for INV-007 (Metros Lineales)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mToMm, mmToM, displayStock, convertToStorage } from '../../features/inventory/types';

const mockDb = {
  products: { get: vi.fn(), add: vi.fn(), put: vi.fn(), update: vi.fn(), where: vi.fn() },
  categories: { add: vi.fn(), where: vi.fn(), update: vi.fn(), get: vi.fn() },
  inventoryMovements: { add: vi.fn(), where: vi.fn(), sortBy: vi.fn() },
  inventoryLots: { add: vi.fn(), update: vi.fn(), where: vi.fn(), get: vi.fn() },
  syncQueue: { add: vi.fn() },
  outbox: { add: vi.fn() },
  tenantRefs: { get: vi.fn() },
  transaction: vi.fn((_mode: unknown, _tables: unknown[], fn: () => Promise<void>) => fn()),
};

function resetMockDb() {
  vi.clearAllMocks();
  mockDb.products.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])), count: vi.fn(() => Promise.resolve(0)) })),
  });
  mockDb.categories.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.inventoryMovements.where.mockReturnValue({
    filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.inventoryMovements.sortBy.mockResolvedValue([]);
  mockDb.inventoryLots.where.mockReturnValue({
    filter: vi.fn(() => ({ sortBy: vi.fn(() => Promise.resolve([])) })),
  });
  mockDb.inventoryLots.get.mockResolvedValue(null);
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
  logAuditEventOnly: vi.fn(),
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null })) })) })) })) },
}));

vi.mock('@logiscore/core', () => ({
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

describe('INV-007 [Conversiones]: Métodos de conversión para Metros (m)', () => {
  it('mToMm: convierte metros decimales a milímetros enteros', () => {
    expect(mToMm(1)).toBe(1000);
    expect(mToMm(1.5)).toBe(1500);
    expect(mToMm(0.555)).toBe(555);
    expect(mToMm(1.2346)).toBe(1235); // Redondeo
  });

  it('mmToM: convierte milímetros a metros', () => {
    expect(mmToM(1000)).toBe(1);
    expect(mmToM(1500)).toBe(1.5);
    expect(mmToM(555)).toBe(0.555);
  });

  it('displayStock: muestra metros formateados con 2 decimales', () => {
    expect(displayStock(1500, 'm')).toBe('1.50');
    expect(displayStock(550, 'm')).toBe('0.55');
  });

  it('convertToStorage: procesa pesable_m convirtiendo a mm', () => {
    expect(convertToStorage(1.5, 'pesable_m')).toBe(1500);
    expect(convertToStorage(2.25, 'pesable_m')).toBe(2250);
  });
});

describe('INV-007 [Service]: Crear producto con unidad de metros', () => {
  beforeEach(() => { resetMockDb(); });

  it('Given: producto pesable en metros. When: crear con stock. Then: stock se almacena en milímetros', async () => {
    const { inventoryService } = await import('../../features/inventory/services/inventoryService');
    const result = await inventoryService.createProduct('test-tenant', 'user-1', {
      name: 'Cable Eléctrico 12', sku: 'CBL-012', priceUsd: 1.20,
      isWeighted: true, isTaxable: true, unit: 'm', stockInicial: 10.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockDb.inventoryLots.add).toHaveBeenCalled();
    const lotCall = mockDb.inventoryLots.add.mock.calls[0][0];
    expect(lotCall.quantityAdded).toBe(10500); // 10.5 m = 10500 mm
  });
});
