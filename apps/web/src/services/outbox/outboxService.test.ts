import { describe, it, expect, vi, beforeEach } from 'vitest';
import { outboxService } from './outboxService';

vi.mock('../dexie/db', () => {
  const mockOutbox: Record<string, unknown>[] = [];
  let destroyed = false;
  return {
    getDb: () => {
      if (destroyed) throw new Error('Dexie no inicializado. Llama a initDb(tenantSlug) primero.');
      return {
        outbox: {
          add: vi.fn(async (entry: Record<string, unknown>) => {
            const id = mockOutbox.length + 1;
            mockOutbox.push({ ...entry, id });
            return id;
          }),
          where: vi.fn(() => ({
            equals: vi.fn(() => ({
              and: vi.fn(() => ({
                first: vi.fn(async () => mockOutbox.find(e => e.id === undefined && !e.nextRetryAt) ?? null),
                count: vi.fn(async () => mockOutbox.filter(e => e.status === 'pending').length),
              })),
              count: vi.fn(async () => mockOutbox.length),
            })),
          })),
          update: vi.fn(async () => {}),
          delete: vi.fn(async () => 0),
        },
      };
    },
    initDb: vi.fn((_slug: string) => {
      destroyed = false;
      mockOutbox.length = 0;
    }),
    destroyDb: vi.fn(() => {
      destroyed = true;
      mockOutbox.length = 0;
    }),
  };
});

describe('OutboxService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { initDb } = await import('../dexie/db');
    initDb('test-' + Date.now());
  });

  describe('enqueue()', () => {
    it('OUTBOX-001: debe encolar un evento pendiente', async () => {
      const result = await outboxService.enqueue('TEST.EVENT', 'TEST', { foo: 'bar' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.data).toBe('number');
      }
    });

    it('OUTBOX-001: debe retornar error si Dexie no está inicializado', async () => {
      const { destroyDb } = await import('../dexie/db');
      destroyDb();
      const result = await outboxService.enqueue('TEST.EVENT', 'TEST', {});
      expect(result.ok).toBe(false);
    });
  });

  describe('processNext()', () => {
    it('OUTBOX-001: debe retornar "none" si no hay eventos', async () => {
      const result = await outboxService.processNext();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('none');
      }
    });
  });

  describe('getPendingCount()', () => {
    it('OUTBOX-001: debe contar eventos pendientes', async () => {
      await outboxService.enqueue('TEST.EVENT', 'TEST', {});
      const result = await outboxService.getPendingCount();
      expect(result.ok).toBe(true);
    });
  });
});
