import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })) })) },
}));

const mockRecipes: Array<Record<string, unknown>> = [
  // Sub-receta B→A (ciclo A→B→A si A incluye B)
  { id: 'rec-b', productId: 'prod-B', lines: [{ productId: 'prod-A', quantity: 1, unit: 'unidad' }], deletedAt: null, isActive: true },
];

const mockDb = {
  recipes: {
    get: vi.fn(async (id: string) => mockRecipes.find((r) => r.id === id) ?? null),
    where: vi.fn((criteria: Record<string, unknown> = {}) => {
      const matches = (item: Record<string, unknown>) =>
        Object.entries(criteria).every(([k, v]) => item[k] === v);
      const pre = Object.keys(criteria).length > 0 ? mockRecipes.filter(matches) : mockRecipes;
      return {
        filter: (predicate: (i: unknown) => boolean) => ({
          first: async () => pre.filter(predicate)[0] ?? null,
          toArray: async () => pre.filter(predicate),
        }),
        toArray: async () => pre,
      };
    }),
  },
  transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<unknown>) => fn()),
  outbox: { add: vi.fn(async () => 'id') },
  syncQueue: { add: vi.fn(async () => 'id') },
  recipeLines: {
    where: vi.fn((criteria: Record<string, unknown> = {}) => {
      const matches = (item: Record<string, unknown>) =>
        Object.entries(criteria).every(([k, v]) => item[k] === v);
      const mockLines: Array<Record<string, unknown>> = [
        { id: 'rl-b1', recipeId: 'rec-b', productId: 'prod-A', quantity: 1, unit: 'unidad' },
      ];
      const pre = Object.keys(criteria).length > 0 ? mockLines.filter(matches) : mockLines;
      return {
        filter: (predicate: (i: unknown) => boolean) => ({
          toArray: async () => pre.filter(predicate),
          first: async () => pre.filter(predicate)[0] ?? null,
        }),
        toArray: async () => pre,
      };
    }),
  },
};

vi.mock('../../services/dexie/db', () => ({ getDb: () => mockDb, isDbReady: () => true }));
vi.mock('../../services/sync/syncQueue', () => ({ syncQueue: { enqueue: vi.fn() } }));
vi.mock('../../services/outbox/outboxService', () => ({
  outboxService: { enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })) },
}));
vi.mock('../../services/network/requireNetwork', () => ({
  requireNetwork: vi.fn(() => ({ ok: true, data: undefined })),
}));
vi.mock('../../services/network/networkAwareService', () => ({
  networkAware: { isOnline: () => true },
}));

import { validateCycles } from '../../features/production/services/productionService';
import { ProductionErrors } from '../../specs/production/errors';

describe('DINERO-011 (M1): validateCycles detecta ciclos A→B→A', () => {
  it('Given: producto A con sub-receta B (BFS debe alcanzar A). When: validateCycles. Then: failure(RECIPE_CYCLE_DETECTED)', async () => {
    const result = await validateCycles('prod-A', [
      { productId: 'prod-B', quantity: 1, unit: 'unidad' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ProductionErrors.RECIPE_CYCLE_DETECTED);
    }
  });
});
