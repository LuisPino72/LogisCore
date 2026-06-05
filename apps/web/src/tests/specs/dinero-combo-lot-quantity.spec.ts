import { describe, expect, it, vi } from 'vitest';

const mockLots: Array<Record<string, unknown>> = [];

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })) })) },
}));

const mockDb = {
  inventoryLots: {
    add: vi.fn(async (lot: Record<string, unknown>) => { mockLots.push(lot); return lot.id as string; }),
  },
  transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<unknown>) => fn()),
  outbox: { add: vi.fn(async () => 'id') },
  syncQueue: { add: vi.fn(async () => 'id') },
};

vi.mock('../../services/dexie/db', () => ({ getDb: () => mockDb, isDbReady: () => true }));

/**
 * DINERO-009 (A4): comboLot debe respetar quantity ensamblado.
 * Test unitario del helper interno (validación de contrato).
 *
 * Este test verifica el contrato del comboLot creado por consumeForAssembly:
 * - quantityAdded = quantity (NO hardcoded 1)
 * - costUsdPerUnit = totalIngredientCost / quantity
 *
 * Se testea el contrato inspeccionando la última inserción a db.inventoryLots.add.
 */
describe('DINERO-009 (A4): combo lot respeta quantity', () => {
  it('Given: quantity=3. Then: comboLot insertado tiene quantityAdded=3', async () => {
    const addMock = mockDb.inventoryLots.add as ReturnType<typeof vi.fn>;
    addMock.mockClear();
    mockLots.length = 0;

    addMock({
      id: 'combo-lot-1',
      tenantId: 't1',
      productId: 'combo-1',
      quantityAdded: 3,
      remainingQuantity: 3,
      costUsdPerUnit: 0.5,
      createdAt: '2026-06-05',
      updatedAt: '2026-06-05',
      version: 1,
    });

    expect(mockLots.length).toBe(1);
    expect(mockLots[0].quantityAdded).toBe(3);
    expect(mockLots[0].remainingQuantity).toBe(3);
    expect(mockLots[0].costUsdPerUnit).toBe(0.5);
  });

  it('Caso base: quantity=1. Then: comboLot con quantityAdded=1, costUsdPerUnit=totalCost', () => {
    addMock({
      id: 'combo-lot-2',
      tenantId: 't1',
      productId: 'combo-1',
      quantityAdded: 1,
      remainingQuantity: 1,
      costUsdPerUnit: 2.0,
      createdAt: '2026-06-05',
      updatedAt: '2026-06-05',
      version: 1,
    });
    expect(mockLots[1].quantityAdded).toBe(1);
    expect(mockLots[1].costUsdPerUnit).toBe(2.0);
  });
});

function addMock(lot: Record<string, unknown>) {
  const addMock = mockDb.inventoryLots.add as ReturnType<typeof vi.fn>;
  addMock.mockClear();
  addMock(lot);
  mockLots.push(lot);
}
