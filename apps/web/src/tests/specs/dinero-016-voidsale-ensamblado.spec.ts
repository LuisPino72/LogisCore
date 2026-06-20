import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSales: Array<Record<string, unknown>> = [];
const mockSaleItems: Array<Record<string, unknown>> = [];
const mockProducts: Array<Record<string, unknown>> = [];
const mockRecipes: Array<Record<string, unknown>> = [];
const mockRecipeLines: Array<Record<string, unknown>> = [];
const mockInventoryLots: Array<Record<string, unknown>> = [];
const mockInventoryMovements: Array<Record<string, unknown>> = [];
const mockCashRegisters: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockSales.length = 0;
  mockSaleItems.length = 0;
  mockProducts.length = 0;
  mockRecipes.length = 0;
  mockRecipeLines.length = 0;
  mockInventoryLots.length = 0;
  mockInventoryMovements.length = 0;
  mockCashRegisters.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  return {
    sales: {
      get: vi.fn(async (id: string) => mockSales.find((s) => s.id === id) ?? null),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockSales.findIndex((s) => s.id === id);
        if (idx >= 0) mockSales[idx] = { ...mockSales[idx], ...changes };
        return 1;
      }),
      where: vi.fn((criteria?: Record<string, unknown>) => {
        const filtered = () => criteria ? mockSales.filter((s) => Object.entries(criteria).every(([k, v]) => s[k] === v)) : mockSales;
        return {
          filter: (predicate: (s: Record<string, unknown>) => boolean) => ({
            first: async () => filtered().filter(predicate)[0] ?? null,
            toArray: async () => filtered().filter(predicate),
          }),
          first: async () => filtered()[0] ?? null,
          toArray: async () => filtered(),
        };
      }),
    },
    saleItems: {
      where: vi.fn((criteria: Record<string, unknown>) => ({
        toArray: async () => mockSaleItems.filter((i) => Object.entries(criteria).every(([k, v]) => i[k] === v)),
      })),
    },
    products: {
      get: vi.fn(async (id: string) => mockProducts.find((p) => p.id === id) ?? null),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockProducts.findIndex((p) => p.id === id);
        if (idx >= 0) mockProducts[idx] = { ...mockProducts[idx], ...changes };
        return 1;
      }),
      where: vi.fn(() => ({
        filter: () => ({ first: async () => null, toArray: async () => [] }),
        first: async () => null,
        toArray: async () => [],
      })),
    },
    recipes: {
      where: vi.fn((criteria: Record<string, unknown>) => ({
        filter: (predicate: (r: Record<string, unknown>) => boolean) => ({
          first: async () => {
            const pre = mockRecipes.filter((r) => Object.entries(criteria).every(([k, v]) => r[k] === v));
            const filtered = pre.filter(predicate);
            return filtered[0] ?? null;
          },
        }),
      })),
    },
    recipeLines: {
      where: vi.fn((criteria: Record<string, unknown>) => ({
        filter: (predicate: (l: Record<string, unknown>) => boolean) => ({
          toArray: async () => {
            const pre = mockRecipeLines.filter((l) => Object.entries(criteria).every(([k, v]) => l[k] === v));
            return pre.filter(predicate);
          },
        }),
      })),
    },
    inventoryLots: {
      get: vi.fn(async (id: string) => mockInventoryLots.find((l) => l.id === id) ?? null),
      where: vi.fn((criteria: Record<string, unknown>) => ({
        filter: (predicate: (l: Record<string, unknown>) => boolean) => ({
          toArray: async () => {
            const pre = mockInventoryLots.filter((l) => Object.entries(criteria).every(([k, v]) => l[k] === v));
            return pre.filter(predicate);
          },
          sortBy: vi.fn(async () => []),
        }),
        toArray: async () => mockInventoryLots,
      })),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = mockInventoryLots.findIndex((l) => l.id === id);
        if (idx >= 0) mockInventoryLots[idx] = { ...mockInventoryLots[idx], ...changes };
        return 1;
      }),
    },
    inventoryMovements: {
      add: vi.fn(async (m: Record<string, unknown>) => {
        mockInventoryMovements.push(m);
        return m.id as string;
      }),
    },
    cashRegisters: {
      where: vi.fn((criteria: Record<string, unknown>) => ({
        filter: (predicate: (r: Record<string, unknown>) => boolean) => ({
          toArray: async () => mockCashRegisters.filter((r) => Object.entries(criteria).every(([k, v]) => r[k] === v)).filter(predicate),
        }),
      })),
      update: vi.fn(async () => 1),
    },
    syncQueue: { enqueue: vi.fn(async () => undefined) },
    outbox: { add: vi.fn(async () => 'id') },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<unknown>) => fn()),
  };
}

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })) })) },
}));
vi.mock('../../services/dexie/db', () => ({ getDb: () => mockDb, isDbReady: () => true, isDbClosing: () => false }));
vi.mock('../../services/sync/syncQueue', () => ({ syncQueue: { enqueue: vi.fn() } }));
vi.mock('../../services/sync/syncEngine', () => ({ syncEngine: { triggerSync: vi.fn() } }));
vi.mock('../../services/outbox/outboxService', () => ({
  outboxService: { enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })) },
}));
vi.mock('../../services/network/requireNetwork', () => ({
  requireNetwork: vi.fn(() => ({ ok: true, data: undefined })),
}));
vi.mock('../../services/network/networkAwareService', () => ({
  networkAware: { isOnline: () => true },
}));
vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithAudit: vi.fn(async () => undefined),
  logAuditEventOnly: vi.fn(async () => undefined),
  emitEngineEvent: vi.fn(),
}));
vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      session: { userId: 'u-1', email: 'o@bodega.com', role: 'owner', tenantId: 'tenant-1' },
    }),
  },
}));
vi.mock('../../features/auth/services/roleGuard', () => ({
  requireRole: vi.fn(),
}));
vi.mock('../../services/tenantTranslator', () => ({
  TenantTranslator: { slugToUuid: vi.fn(() => Promise.resolve('tenant-uuid')) },
}));
vi.mock('../../lib/logger', () => ({
  logger: { error: (...args: unknown[]) => console.error('LOGGER_ERROR', ...args), warn: (...args: unknown[]) => console.warn('LOGGER_WARN', ...args) },
}));
vi.mock('../../lib/date', () => ({
  isSameDayVzla: () => true,
  startOfDayVzla: () => new Date(),
  endOfDayVzla: () => new Date(),
}));

import { posService } from '../../features/pos/services/posService';

const TENANT_ID = 'tenant-1';
const TODAY_ISO = new Date().toISOString();

function seedEnsambladoPesable() {
  mockProducts.push(
    { id: 'prod-pan', tenantId: TENANT_ID, name: 'Pan de queso', productType: 'ensamblado', isWeighted: true, unit: 'kg', stock: 10, deletedAt: null, costPrice: 0, priceUsd: 5, isSellable: true },
    { id: 'prod-harina', tenantId: TENANT_ID, name: 'Harina', productType: 'materia_prima', isWeighted: true, unit: 'kg', stock: 10, deletedAt: null, costPrice: 0, priceUsd: 1.5, isSellable: false },
  );
  mockRecipes.push({ id: 'rec-pan', tenantId: TENANT_ID, productId: 'prod-pan', mode: 'assembly', wastePct: 0, isActive: true, deletedAt: null });
  mockRecipeLines.push({ id: 'line-pan-1', recipeId: 'rec-pan', productId: 'prod-harina', quantity: 1, unit: 'kg', sortOrder: 0, deletedAt: null });
  mockSales.push({ id: 'sale-pesable', tenantId: TENANT_ID, userId: 'u-1', status: 'completed', createdAt: TODAY_ISO, totalBs: 100, igtfBs: 0, ivaBs: 0, exchangeRate: 1, paymentMethod: 'efectivo_usd', discountBs: 0, deletedAt: null });
  mockSaleItems.push({ id: 'si-pesable', tenantId: TENANT_ID, saleId: 'sale-pesable', productId: 'prod-pan', productName: 'Pan de queso', productSku: 'P1', quantity: 0.5, unitMultiplier: 1, unitPriceUsd: 5, isWeighted: true, unit: 'kg' });
}

function seedEnsambladoPresentacion() {
  mockProducts.push(
    { id: 'prod-combo', tenantId: TENANT_ID, name: 'Combo 12 refrescos', productType: 'ensamblado', isWeighted: false, unit: 'unidad', stock: 0, deletedAt: null, costPrice: 0, priceUsd: 24, isSellable: true },
    { id: 'prod-refresco', tenantId: TENANT_ID, name: 'Refresco lata', productType: 'materia_prima', isWeighted: false, unit: 'unidad', stock: 100, deletedAt: null, costPrice: 0, priceUsd: 1, isSellable: false },
  );
  mockRecipes.push({ id: 'rec-combo', tenantId: TENANT_ID, productId: 'prod-combo', mode: 'assembly', wastePct: 0, isActive: true, deletedAt: null });
  mockRecipeLines.push({ id: 'line-combo-1', recipeId: 'rec-combo', productId: 'prod-refresco', quantity: 12, unit: 'unidad', sortOrder: 0, deletedAt: null });
  mockSales.push({ id: 'sale-combo', tenantId: TENANT_ID, userId: 'u-1', status: 'completed', createdAt: TODAY_ISO, totalBs: 240, igtfBs: 0, ivaBs: 0, exchangeRate: 10, paymentMethod: 'efectivo_usd', discountBs: 0, deletedAt: null });
  mockSaleItems.push({ id: 'si-combo', tenantId: TENANT_ID, saleId: 'sale-combo', productId: 'prod-combo', productName: 'Combo 12 refrescos', productSku: 'C12', quantity: 1, unitMultiplier: 1, unitPriceUsd: 24, isWeighted: false, unit: 'unidad' });
}

function seedEnsambladoMateriaPrima() {
  mockProducts.push(
    { id: 'prod-burger', tenantId: TENANT_ID, name: 'Hamburguesa', productType: 'ensamblado', isWeighted: false, unit: 'unidad', stock: 0, deletedAt: null, costPrice: 0, priceUsd: 4, isSellable: true },
    { id: 'prod-pan', tenantId: TENANT_ID, name: 'Pan', productType: 'materia_prima', isWeighted: false, unit: 'unidad', stock: 50, deletedAt: null, costPrice: 0, priceUsd: 0.3, isSellable: false },
    { id: 'prod-carne', tenantId: TENANT_ID, name: 'Carne', productType: 'materia_prima', isWeighted: true, unit: 'kg', stock: 5, deletedAt: null, costPrice: 0, priceUsd: 6, isSellable: false },
    { id: 'prod-queso', tenantId: TENANT_ID, name: 'Queso', productType: 'materia_prima', isWeighted: true, unit: 'kg', stock: 2, deletedAt: null, costPrice: 0, priceUsd: 8, isSellable: false },
  );
  mockRecipes.push({ id: 'rec-burger', tenantId: TENANT_ID, productId: 'prod-burger', mode: 'assembly', wastePct: 5, isActive: true, deletedAt: null });
  mockRecipeLines.push(
    { id: 'line-burger-pan', recipeId: 'rec-burger', productId: 'prod-pan', quantity: 1, unit: 'unidad', sortOrder: 0, deletedAt: null },
    { id: 'line-burger-carne', recipeId: 'rec-burger', productId: 'prod-carne', quantity: 0.15, unit: 'kg', sortOrder: 1, deletedAt: null },
    { id: 'line-burger-queso', recipeId: 'rec-burger', productId: 'prod-queso', quantity: 0.03, unit: 'kg', sortOrder: 2, deletedAt: null },
  );
  mockSales.push({ id: 'sale-burger', tenantId: TENANT_ID, userId: 'u-1', status: 'completed', createdAt: TODAY_ISO, totalBs: 80, igtfBs: 0, ivaBs: 0, exchangeRate: 1, paymentMethod: 'efectivo_usd', discountBs: 0, deletedAt: null });
  mockSaleItems.push({ id: 'si-burger', tenantId: TENANT_ID, saleId: 'sale-burger', productId: 'prod-burger', productName: 'Hamburguesa', productSku: 'H1', quantity: 2, unitMultiplier: 1, unitPriceUsd: 4, isWeighted: false, unit: 'unidad' });
}

describe('DINERO-016: voidSale ensamblado usa recipeQtyToStorage para sub-unidades', () => {
  beforeEach(() => resetMockDb());

  it('Given: ensamblado pesable (Pan de queso, receta 1kg harina por 1kg pan), venta 0.5kg. When: voidSale. Then: harina vuelve a 10500g = 10.5kg (NO 11000g = 11kg)', async () => {
    seedEnsambladoPesable();
    const harinaIdx = mockProducts.findIndex((p) => p.id === 'prod-harina');
    mockProducts[harinaIdx] = { ...mockProducts[harinaIdx], stock: 10000 };
    const result = await posService.voidSale('sale-pesable', TENANT_ID, 'u-1');
    expect(result.ok).toBe(true);
    if (!result.ok) console.error('Test 1 error:', result.error, 'movs:', mockInventoryMovements);
    const harina = mockProducts.find((p) => p.id === 'prod-harina');
    expect(harina?.stock).toBe(10500);
  });

  it('Given: ensamblado presentación (Combo 12 refrescos, receta 12 latas), venta 1 combo. When: voidSale. Then: refrescos vuelve a 112 latas (NO 101)', async () => {
    seedEnsambladoPresentacion();
    const result = await posService.voidSale('sale-combo', TENANT_ID, 'u-1');
    expect(result.ok).toBe(true);
    if (!result.ok) console.error('Test 2 error:', result.error, 'movs:', mockInventoryMovements);
    const refresco = mockProducts.find((p) => p.id === 'prod-refresco');
    expect(refresco?.stock).toBe(112);
  });

  it('Given: ensamblado materia_prima (Hamburguesa, 1 pan + 150g carne + 30g queso), wastePct=5%, venta 2 burgers. When: voidSale. Then: devuelve 3 panes (ceil de 2×1×1.05) + 315g carne + 63g queso al stock', async () => {
    seedEnsambladoMateriaPrima();
    const carneIdx = mockProducts.findIndex((p) => p.id === 'prod-carne');
    mockProducts[carneIdx] = { ...mockProducts[carneIdx], stock: 5000 };
    const quesoIdx = mockProducts.findIndex((p) => p.id === 'prod-queso');
    mockProducts[quesoIdx] = { ...mockProducts[quesoIdx], stock: 2000 };
    const result = await posService.voidSale('sale-burger', TENANT_ID, 'u-1');
    expect(result.ok).toBe(true);
    if (!result.ok) console.error('Test 3 error:', result.error, 'movs:', mockInventoryMovements);
    const pan = mockProducts.find((p) => p.id === 'prod-pan');
    const carne = mockProducts.find((p) => p.id === 'prod-carne');
    const queso = mockProducts.find((p) => p.id === 'prod-queso');
    expect(pan?.stock).toBe(53);
    expect(carne?.stock).toBe(5315);
    expect(queso?.stock).toBe(2063);
  });
});
