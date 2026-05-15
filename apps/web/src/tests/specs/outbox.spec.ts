/**
 * Outbox Tests — OUTBOX-001..006
 * TDD: Unit tests for outbox service with mocked Dexie + EventBus
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutboxTable = {
  add: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

const mockDb = {
  outbox: mockOutboxTable,
};

function resetMocks() {
  vi.clearAllMocks();
  mockOutboxTable.where.mockReturnValue({
    equals: vi.fn(() => ({
      and: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(null)) })),
      count: vi.fn(() => Promise.resolve(0)),
    })),
  });
}

vi.mock('../../services/dexie/db', () => ({
  getDb: () => mockDb,
  isDbReady: () => true,
}));

vi.mock('@logiscore/core', () => ({
  EventBus: { emit: vi.fn() },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: Error) => ({ ok: false, error: err }) as const,
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'AppError'; }
  },
  OUTBOX_MAX_RETRIES: 3,
  OUTBOX_BASE_BACKOFF_MS: 1000,
  OUTBOX_POLL_INTERVAL_MS: 5000,
}));

describe('OUTBOX-001: Enqueue evento', () => {
  beforeEach(() => { resetMocks(); });

  it('Given: evento valido. When: enqueue. Then: guardado en outbox con status=pending', async () => {
    mockOutboxTable.add.mockResolvedValue(1);

    const { outboxService } = await import('../../services/outbox/outboxService');
    const result = await outboxService.enqueue('SALE.COMPLETED', 'POS', { saleId: 'abc' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockOutboxTable.add).toHaveBeenCalledWith(expect.objectContaining({
      event: 'SALE.COMPLETED',
      module: 'POS',
      status: 'pending',
      retries: 0,
    }));
  });
});

describe('OUTBOX-002: Procesar evento exitoso', () => {
  beforeEach(() => { resetMocks(); });

  it('Given: evento pending. When: processNext. Then: Emit vía EventBus + status=processed', async () => {
    const mockEntry = {
      id: 1, event: 'SALE.COMPLETED', module: 'POS', payload: { saleId: 'abc' },
      status: 'pending', retries: 0, lastError: null, nextRetryAt: null,
      createdAt: new Date().toISOString(), processedAt: null,
    };
    mockOutboxTable.where.mockReturnValue({
      equals: vi.fn(() => ({
        and: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(mockEntry)) })),
      })),
    });
    mockOutboxTable.update.mockResolvedValue(undefined);

    const { outboxService } = await import('../../services/outbox/outboxService');
    const { EventBus } = await import('@logiscore/core');
    const result = await outboxService.processNext();

    expect(result.ok).toBe(true);
    expect(EventBus.emit).toHaveBeenCalledWith('SALE.COMPLETED', { saleId: 'abc' });
    expect(mockOutboxTable.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'processed' }));
  });
});

describe('OUTBOX-003: Reintento en fallo', () => {
  beforeEach(() => { resetMocks(); });

  it('Given: evento falla. When: processNext. Then: retries incrementa, nextRetryAt futuro', async () => {
    const mockEntry = {
      id: 1, event: 'SYNC.FAIL', module: 'SYNC', payload: {},
      status: 'pending', retries: 0, lastError: null, nextRetryAt: null,
      createdAt: new Date().toISOString(), processedAt: null,
    };
    mockOutboxTable.where.mockReturnValue({
      equals: vi.fn(() => ({
        and: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(mockEntry)) })),
      })),
    });
    mockOutboxTable.update.mockResolvedValue(undefined);

    const { EventBus } = await import('@logiscore/core');
    (EventBus.emit as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('Network error'); });

    const { outboxService } = await import('../../services/outbox/outboxService');
    const result = await outboxService.processNext();

    expect(result.ok).toBe(true);
    expect(mockOutboxTable.update).toHaveBeenCalledWith(1, expect.objectContaining({
      status: 'pending',
      retries: 1,
      lastError: 'Network error',
      nextRetryAt: expect.any(Number),
    }));
  });
});

describe('OUTBOX-004: Max reintentos -> failed', () => {
  beforeEach(() => { resetMocks(); });

  it('Given: evento con retries=2 (max=3). When: falla. Then: status=failed', async () => {
    const mockEntry = {
      id: 1, event: 'SYNC.FAIL', module: 'SYNC', payload: {},
      status: 'pending', retries: 2, lastError: null, nextRetryAt: null,
      createdAt: new Date().toISOString(), processedAt: null,
    };
    mockOutboxTable.where.mockReturnValue({
      equals: vi.fn(() => ({
        and: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(mockEntry)) })),
      })),
    });
    mockOutboxTable.update.mockResolvedValue(undefined);

    const { EventBus } = await import('@logiscore/core');
    (EventBus.emit as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('Timeout'); });

    const { outboxService } = await import('../../services/outbox/outboxService');
    const result = await outboxService.processNext();

    expect(result.ok).toBe(true);
    expect(mockOutboxTable.update).toHaveBeenCalledWith(1, expect.objectContaining({
      status: 'failed',
      retries: 3,
    }));
  });
});

describe('OUTBOX-005: Evento con nextRetryAt futuro', () => {
  beforeEach(() => { resetMocks(); });

  it('Given: evento con nextRetryAt en futuro. When: processNext. Then: lo salta (none)', async () => {
    mockOutboxTable.where.mockReturnValue({
      equals: vi.fn(() => ({
        and: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(null)) })),
      })),
    });

    const { outboxService } = await import('../../services/outbox/outboxService');
    const result = await outboxService.processNext();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBe('none');
  });
});

describe('OUTBOX-006: Enqueue falla', () => {
  beforeEach(() => { resetMocks(); });

  it('Given: DB.add lanza error. When: enqueue. Then: OUTBOX_ENQUEUE_FAILED', async () => {
    mockOutboxTable.add.mockRejectedValue(new Error('DB full'));

    const { outboxService } = await import('../../services/outbox/outboxService');
    const result = await outboxService.enqueue('TEST.EVENT', 'TEST', {});

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('OUTBOX_ENQUEUE_FAILED');
  });
});
