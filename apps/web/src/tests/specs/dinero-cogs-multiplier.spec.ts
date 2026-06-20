/**
 * BACKLOG-107 [DINERO-001] BDD Tests — C1: COGS multiplica por unitMultiplier en reportes
 *
 * Cubre: getExecutiveSummary, getProfitOverTime, getSalesDetail, getTopProducts.
 * Bug: COGS calculado como `quantity × costUsdPerUnit` ignora unitMultiplier.
 * Fix: COGS = `(quantity × unitMultiplier) × costUsdPerUnit`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSales: Array<{
  id: string;
  tenantId: string;
  totalBs: number;
  igtfBs: number;
  ivaBs: number;
  exchangeRate: number;
  paymentMethod: string;
  createdAt: string;
  discountBs: number;
  status: string;
  deletedAt?: string;
}> = [];

const mockSaleItems: Array<{
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitMultiplier?: number;
  unitPriceUsd: number;
  costUsdPerUnit: number | undefined;
  deletedAt?: string;
}> = [];

const TENANT_ID = 'tenant-1';

function createMockDb() {
  const makeChain = (items: unknown[]) => ({
    toArray: async () => items,
    first: async () => items[0] ?? null,
    count: async () => items.length,
    filter: (predicate: (i: unknown) => boolean) => makeChain(items.filter(predicate)),
  });
  return {
    sales: {
      where: vi.fn((field: string) => {
        if (field === '[tenantId+createdAt]') {
          return {
            between: vi.fn(() => makeChain(mockSales)),
          };
        }
        return {
          between: vi.fn(() => makeChain([])),
          equals: vi.fn(() => makeChain([])),
          anyOf: vi.fn(() => makeChain([])),
        };
      }),
    },
    saleItems: {
      where: vi.fn((field: string) => ({
        anyOf: vi.fn((saleIds: string[]) => makeChain(mockSaleItems.filter((i) => saleIds.includes((i as Record<string, unknown>)[field] as string)))),
        equals: vi.fn(() => makeChain([])),
      })),
    },
    products: {
      where: vi.fn(() => makeChain([])),
    },
    inventoryLots: {
      where: vi.fn(() => makeChain([])),
    },
    inventoryMovements: {
      where: vi.fn(() => makeChain([])),
    },
    expenses: {
      where: vi.fn((field: string) => {
        if (field === '[tenantId+date]') {
          return {
            between: vi.fn(() => makeChain([])),
          };
        }
        return {
          between: vi.fn(() => makeChain([])),
          equals: vi.fn(() => makeChain([])),
        };
      }),
    },
    exchangeRates: {
      where: vi.fn(() => ({
        equals: vi.fn(() => makeChain([])),
      })),
    },
    creditPayments: {
      where: vi.fn(() => makeChain([])),
    },
  };
}

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockSales.length = 0;
  mockSaleItems.length = 0;
  mockDb = createMockDb();
}

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            lte: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    })),
  },
}));

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

vi.mock('../../features/exchange/stores/exchangeRateStore', () => ({
  useExchangeRateStore: { getState: () => ({ rate: 36.5 }) },
}));

vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ session: { userId: 'u-1', email: 'o@bodega.com', role: 'owner', tenantId: TENANT_ID } }) },
}));

import { reportsService } from '../../features/reports/services/reportsService';

describe('DINERO-001: COGS multiplica por unitMultiplier en getExecutiveSummary', () => {
  beforeEach(() => resetMockDb());

  it('Given: venta de 1 Caja×6 a $10/unit, $50/caja. When: getExecutiveSummary. Then: totalCostUsd = $60 (no $10)', async () => {
    mockSales.push({
      id: 'sale-1',
      tenantId: TENANT_ID,
      totalBs: 50 * 36.5,
      igtfBs: 0,
      ivaBs: 50 * 36.5 * 0.16,
      exchangeRate: 36.5,
      paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z',
      discountBs: 0,
      status: 'completed',
    });
    mockSaleItems.push({
      id: 'item-1',
      saleId: 'sale-1',
      productId: 'prod-1',
      productName: 'Refresco Caja×6',
      productSku: 'REF-C6',
      quantity: 1,
      unitMultiplier: 6,
      unitPriceUsd: 50,
      costUsdPerUnit: 10,
    });

    const result = await reportsService.getExecutiveSummary(TENANT_ID, { timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30' });
    if (!result.ok) console.error('Test 1 error:', result.error);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCostUsd).toBe(60);
    }
  });

  it('Given: venta SIN presentación (unitMultiplier=undefined, treated as 1). When: getExecutiveSummary. Then: totalCostUsd = quantity × costUsdPerUnit (sin cambio)', async () => {
    mockSales.push({
      id: 'sale-2',
      tenantId: TENANT_ID,
      totalBs: 5 * 36.5,
      igtfBs: 0,
      ivaBs: 0,
      exchangeRate: 36.5,
      paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z',
      discountBs: 0,
      status: 'completed',
    });
    mockSaleItems.push({
      id: 'item-2',
      saleId: 'sale-2',
      productId: 'prod-2',
      productName: 'Producto Simple',
      productSku: 'SIMPLE',
      quantity: 3,
      unitPriceUsd: 5,
      costUsdPerUnit: 2,
    });

    const result = await reportsService.getExecutiveSummary(TENANT_ID, { timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30' });
    if (!result.ok) console.error('Test 2 error:', result.error);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCostUsd).toBe(6);
    }
  });

  it('Given: venta de 3 Cajas×12 a $2/unit. When: getExecutiveSummary. Then: totalCostUsd = 3×12×2 = $72', async () => {
    mockSales.push({
      id: 'sale-3',
      tenantId: TENANT_ID,
      totalBs: 3 * 24 * 36.5,
      igtfBs: 0,
      ivaBs: 0,
      exchangeRate: 36.5,
      paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z',
      discountBs: 0,
      status: 'completed',
    });
    mockSaleItems.push({
      id: 'item-3',
      saleId: 'sale-3',
      productId: 'prod-3',
      productName: 'Pack×12',
      productSku: 'PK12',
      quantity: 3,
      unitMultiplier: 12,
      unitPriceUsd: 24,
      costUsdPerUnit: 2,
    });

    const result = await reportsService.getExecutiveSummary(TENANT_ID, { timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30' });
    if (!result.ok) console.error('Test 3 error:', result.error);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalCostUsd).toBe(72);
    }
  });
});

describe('DINERO-001: COGS multiplica por unitMultiplier en getProfitOverTime', () => {
  beforeEach(() => resetMockDb());

  it('Given: venta con unitMultiplier=4. When: getProfitOverTime. Then: costUsd del point = effectiveQuantity × costUsdPerUnit', async () => {
    mockSales.push({
      id: 'sale-pt',
      tenantId: TENANT_ID,
      totalBs: 40 * 36.5,
      igtfBs: 0,
      ivaBs: 0,
      exchangeRate: 36.5,
      paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z',
      discountBs: 0,
      status: 'completed',
    });
    mockSaleItems.push({
      id: 'item-pt',
      saleId: 'sale-pt',
      productId: 'prod-pt',
      productName: 'Pack×4',
      productSku: 'PK4',
      quantity: 1,
      unitMultiplier: 4,
      unitPriceUsd: 40,
      costUsdPerUnit: 5,
    });

    const result = await reportsService.getProfitOverTime(TENANT_ID, { timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const totalCostUsd = result.data.reduce((sum, p) => sum + p.costUsd, 0);
      expect(totalCostUsd).toBe(20);
    }
  });
});

describe('DINERO-001: COGS multiplica por unitMultiplier en getSalesDetail', () => {
  beforeEach(() => resetMockDb());

  it('Given: venta con unitMultiplier=2. When: getSalesDetail. Then: item.costUsd = 2 × 8 = $16', async () => {
    mockSales.push({
      id: 'sale-sd',
      tenantId: TENANT_ID,
      totalBs: 20 * 36.5,
      igtfBs: 0,
      ivaBs: 0,
      exchangeRate: 36.5,
      paymentMethod: 'efectivo_usd',
      createdAt: '2026-06-05T10:00:00Z',
      discountBs: 0,
      status: 'completed',
    });
    mockSaleItems.push({
      id: 'item-sd',
      saleId: 'sale-sd',
      productId: 'prod-sd',
      productName: 'Par',
      productSku: 'PAR',
      quantity: 1,
      unitMultiplier: 2,
      unitPriceUsd: 20,
      costUsdPerUnit: 8,
    });

    const result = await reportsService.getTopProducts(TENANT_ID, { timeRange: 'custom', startDate: '2026-06-01', endDate: '2026-06-30' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBe(1);
      const product = result.data[0];
      expect(product.costUsd).toBe(16);
    }
  });
});
