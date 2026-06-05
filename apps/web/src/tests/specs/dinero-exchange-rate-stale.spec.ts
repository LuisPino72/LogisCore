import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRates: Array<Record<string, unknown>> = [];

let mockDb: ReturnType<typeof createMockDb>;

function resetMockDb() {
  vi.clearAllMocks();
  mockRates.length = 0;
  mockDb = createMockDb();
}

function createMockDb() {
  const makeChain = (items: unknown[]) => ({
    toArray: async () => items,
    first: async () => items[0] ?? null,
  });
  return {
    exchangeRates: {
      where: vi.fn((field: string) => ({
        equals: vi.fn((value: unknown) => makeChain(
          mockRates.filter((r) => (r as Record<string, unknown>)[field] === value),
        )),
        anyOf: vi.fn(() => makeChain(mockRates)),
      })),
      reverse: vi.fn(() => ({
        sortBy: vi.fn(async (key: string) => {
          return [...mockRates].sort((a, b) =>
            ((a as Record<string, unknown>)[key] as string) <
            ((b as Record<string, unknown>)[key] as string) ? 1 : -1,
          );
        }),
      })),
    },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<unknown>) => fn()),
  };
}

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
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

vi.mock('../../lib/logger', () => ({
  logger: { error: (...args: unknown[]) => console.error('LOGGER_ERROR', ...args) },
}));

import { isRateStale, requireExchangeRate } from '../../lib/exchangeRateValidator';

describe('DINERO-003: requireExchangeRate + isRateStale (regla BCV L-V 1x/día)', () => {
  beforeEach(() => resetMockDb());

  describe('requireExchangeRate', () => {
    it('Given: rate=0. When: requireExchangeRate. Then: returns failure (no permite crear/recibir orden)', () => {
      const result = requireExchangeRate(0);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('tasa de cambio');
      }
    });

    it('Given: rate=36.5. When: requireExchangeRate. Then: returns success', () => {
      const result = requireExchangeRate(36.5);
      expect(result.ok).toBe(true);
    });

    it('Given: rate negativo. When: requireExchangeRate. Then: returns failure', () => {
      const result = requireExchangeRate(-1);
      expect(result.ok).toBe(false);
    });
  });

  describe('isRateStale (regla BCV: L-V 1x/día, V-D se mantiene)', () => {
    it('Given: rateDate = hace 1 día, now. When: isRateStale. Then: false (no stale)', () => {
      const now = new Date('2026-06-05T15:00:00Z');
      const rateDate = new Date('2026-06-04T15:00:00Z');
      expect(isRateStale(rateDate, now)).toBe(false);
    });

    it('Given: rateDate = hace 3 días, now. When: isRateStale. Then: false (dentro de L-V)', () => {
      const now = new Date('2026-06-05T15:00:00Z');
      const rateDate = new Date('2026-06-02T15:00:00Z');
      expect(isRateStale(rateDate, now)).toBe(false);
    });

    it('Given: rateDate = hace 8 días, now. When: isRateStale. Then: true (stale, >7 días)', () => {
      const now = new Date('2026-06-05T15:00:00Z');
      const rateDate = new Date('2026-05-28T15:00:00Z');
      expect(isRateStale(rateDate, now)).toBe(true);
    });
  });
});
