import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockProducts: Array<Record<string, unknown>> = [];
const mockInventoryLots: Array<Record<string, unknown>> = [];
const mockInventoryMovements: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;
let txDb: Record<string, unknown>;

function resetMockDb() {
  vi.clearAllMocks();
  mockProducts.length = 0;
  mockInventoryLots.length = 0;
  mockInventoryMovements.length = 0;
  txDb = {};
  mockDb = createMockDb();
}

function createMockDb() {
  function makeTable(arr: Array<Record<string, unknown>>) {
    return {
      get: vi.fn(async (id: string) => arr.find((r) => r.id === id) ?? null),
      add: vi.fn(async (item: Record<string, unknown>) => { arr.push(item); }),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = arr.findIndex((r) => r.id === id);
        if (idx >= 0) Object.assign(arr[idx], changes);
      }),
      where: vi.fn((criteria: Record<string, unknown>) => {
        const base = () => arr.filter((r) =>
          Object.entries(criteria).every(([k, v]) => r[k] === v)
        );
        return {
          filter: (predicate: (r: Record<string, unknown>) => boolean) => ({
            first: async () => base().filter(predicate)[0] ?? null,
            toArray: async () => base().filter(predicate),
            sortBy: async (field: string) =>
              base().filter(predicate).sort((a, b) => {
                if (a[field] < b[field]) return -1;
                if (a[field] > b[field]) return 1;
                return 0;
              }),
          }),
          first: async () => base()[0] ?? null,
          toArray: async () => base(),
        };
      }),
    };
  }

  return {
    products: makeTable(mockProducts),
    inventoryLots: makeTable(mockInventoryLots),
    inventoryMovements: makeTable(mockInventoryMovements),
    syncQueue: { enqueue: vi.fn() },
    outbox: {},
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: (tx: Record<string, unknown>) => Promise<unknown>) => fn(txDb)),
  };
}

vi.mock('../../services/dexie/db', () => ({ getDb: () => mockDb, isDbReady: () => true, isDbClosing: () => false }));
vi.mock('../../services/sync/syncQueue', () => ({ syncQueue: { enqueue: vi.fn() } }));
vi.mock('../../services/outbox/outboxService', () => ({ outboxService: { enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })) } }));
vi.mock('../../services/audit/emitWithAudit', () => ({ logAuditEventOnly: vi.fn(async () => undefined), emitEngineEvent: vi.fn() }));
vi.mock('../../services/network/requireNetwork', () => ({ requireNetwork: vi.fn(() => ({ ok: true, data: undefined })) }));
vi.mock('../../services/network/networkAwareService', () => ({ networkAware: { isOnline: () => true } }));
vi.mock('../../features/auth/services/roleGuard', () => ({ requireRole: vi.fn() }));
vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ session: { userId: 'u-1', tenantId: 'tenant-1' } }) },
}));
vi.mock('../../services/tenantTranslator', () => ({ TenantTranslator: { slugToUuid: vi.fn(() => Promise.resolve('tenant-uuid')) } }));
vi.mock('../../lib/logger', () => ({ logger: { error: (...args: unknown[]) => console.error(...args), warn: (...args: unknown[]) => console.warn(...args) } }));
vi.mock('@logiscope/core', () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'AppError'; }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: Error) => ({ ok: false, error: err }) as const,
}));
vi.mock('@logiscope/shared', () => ({
  preciseRound: (n: number, d: number) => { const f = Math.pow(10, d); return Math.round(n * f) / f; },
  generateId: () => { const ids = ['dddddddd-dddd-4ddd-adbd-dddddddddddd', 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee']; return ids[Date.now() % 2]; },
  toSnake: (o: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())] = v;
    return out;
  },
}));
vi.mock('../../features/inventory/types', () => ({
  convertToStorage: (qty: number, _type: string) => qty * 1000,
  unitToStorageType: () => 'g',
  gramsToKg: (g: number) => g / 1000,
  kgToGrams: (kg: number) => kg * 1000,
}));

import { inventoryService } from '../../features/inventory/services/inventoryService';

const TENANT_ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const PRODUCT_ID = 'b2b2b2b2-b2b2-4b2b-9b2b-b2b2b2b2b2b2';
const USER_ID = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';

function seedProduct(stock = 10, overrides?: Record<string, unknown>) {
  mockProducts.push({
    id: PRODUCT_ID, tenantId: TENANT_ID, name: 'Test Product', sku: 'T-001',
    isWeighted: false, unit: 'unidad', stock, costPrice: 0, priceUsd: 10,
    isSellable: true, productType: 'producto_terminado', deletedAt: null,
    ...overrides,
  });
}

function seedLots() {
  mockInventoryLots.push({
    id: 'lot-1', tenantId: TENANT_ID, productId: PRODUCT_ID,
    quantityAdded: 5, remainingQuantity: 5, costUsdPerUnit: 2,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', version: 1, deletedAt: null,
  });
  mockInventoryLots.push({
    id: 'lot-2', tenantId: TENANT_ID, productId: PRODUCT_ID,
    quantityAdded: 5, remainingQuantity: 5, costUsdPerUnit: 4,
    createdAt: '2026-01-15T00:00:00Z', updatedAt: '2026-01-15T00:00:00Z', version: 1, deletedAt: null,
  });
}

describe('DINERO-024: adjustStock — WAC recalculation & FIFO consumption', () => {
  beforeEach(() => resetMockDb());

  it('Ajuste positivo CON costTotal — costPerUnit=costTotal/storageQty, WAC=(10*0+5*5)/15=1.6667, stock=15', async () => {
    seedProduct(10);
    const result = await inventoryService.adjustStock({
      productId: PRODUCT_ID,
      quantity: 5,
      reasonType: 'ajuste_manual',
      costTotal: 25,
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.quantity).toBe(5);
    expect(result.data.previousStock).toBe(10);
    expect(result.data.newStock).toBe(15);

    const product = mockProducts.find((p) => p.id === PRODUCT_ID);
    expect(product?.stock).toBe(15);
    expect(product?.costPrice).toBe(1.6667);
  });

  it('Ajuste positivo SIN costTotal, con lote previo — usa último costUsdPerUnit>0 del lote, WAC=1, stock=15', async () => {
    seedProduct(10);
    mockInventoryLots.push({
      id: 'prev-lot', tenantId: TENANT_ID, productId: PRODUCT_ID,
      quantityAdded: 5, remainingQuantity: 5, costUsdPerUnit: 3,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', version: 1, deletedAt: null,
    });

    const result = await inventoryService.adjustStock({
      productId: PRODUCT_ID,
      quantity: 5,
      reasonType: 'ajuste_manual',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.newStock).toBe(15);

    const product = mockProducts.find((p) => p.id === PRODUCT_ID);
    expect(product?.stock).toBe(15);
    expect(product?.costPrice).toBe(1);
  });

  it('Ajuste positivo SIN costTotal y SIN lotes previos — costPerUnit=0, WAC=0, stock=10', async () => {
    seedProduct(0);

    const result = await inventoryService.adjustStock({
      productId: PRODUCT_ID,
      quantity: 10,
      reasonType: 'ajuste_manual',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.newStock).toBe(10);

    const product = mockProducts.find((p) => p.id === PRODUCT_ID);
    expect(product?.stock).toBe(10);
    expect(product?.costPrice).toBe(0);
  });

  it('Ajuste negativo con consumeFifo — consume 3 del lote más antiguo, stock=7, NO actualiza costPrice', async () => {
    seedProduct(10);
    seedLots();

    const result = await inventoryService.adjustStock({
      productId: PRODUCT_ID,
      quantity: -3,
      reasonType: 'ajuste_manual',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.quantity).toBe(-3);
    expect(result.data.previousStock).toBe(10);
    expect(result.data.newStock).toBe(7);

    const product = mockProducts.find((p) => p.id === PRODUCT_ID);
    expect(product?.stock).toBe(7);
    expect(product?.costPrice).toBe(0);

    const lot1 = mockInventoryLots.find((l) => l.id === 'lot-1');
    expect(lot1?.remainingQuantity).toBe(2);
    expect(lot1?.version).toBe(2);

    const lot2 = mockInventoryLots.find((l) => l.id === 'lot-2');
    expect(lot2?.remainingQuantity).toBe(5);
    expect(lot2?.version).toBe(1);
  });

  it('Producto pesable (kg) — stock=2kg (2000g), quantity=0.5kg, costTotal=2.5 → storageQty=500g, WAC en g, stock=2500g, costPrice=1', async () => {
    seedProduct(2000, { isWeighted: true, unit: 'kg', costPrice: 0 });

    const result = await inventoryService.adjustStock({
      productId: PRODUCT_ID,
      quantity: 0.5,
      reasonType: 'ajuste_manual',
      costTotal: 2.5,
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.quantity).toBe(500);
    expect(result.data.previousStock).toBe(2000);
    expect(result.data.newStock).toBe(2500);

    const product = mockProducts.find((p) => p.id === PRODUCT_ID);
    expect(product?.stock).toBe(2500);
    expect(product?.costPrice).toBe(1);
  });

  it('reasonType pérdida con quantity positiva — INVENTORY_ADJUSTMENT_INVALID', async () => {
    seedProduct(10);

    const result = await inventoryService.adjustStock({
      productId: PRODUCT_ID,
      quantity: 5,
      reasonType: 'perdida',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVENTORY_ADJUSTMENT_INVALID');
  });

  it('Stock negativo — stock=5, quantity=-10 → PRODUCT_STOCK_NEGATIVE', async () => {
    seedProduct(5);

    const result = await inventoryService.adjustStock({
      productId: PRODUCT_ID,
      quantity: -10,
      reasonType: 'ajuste_manual',
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PRODUCT_STOCK_NEGATIVE');
  });
});
