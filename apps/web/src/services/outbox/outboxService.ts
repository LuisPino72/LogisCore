import { EventBus, success, failure, AppError, type Result, type OutboxEntry, OUTBOX_MAX_RETRIES, OUTBOX_BASE_BACKOFF_MS } from '@logiscore/core';
import { getDb } from '../dexie/db';

class OutboxService {
  async enqueue(
    event: OutboxEntry['event'],
    module: OutboxEntry['module'],
    payload: OutboxEntry['payload'],
  ): Promise<Result<number, AppError>> {
    try {
      const db = getDb();
      const entry: Omit<OutboxEntry, 'id'> = {
        event,
        module,
        payload,
        status: 'pending',
        retries: 0,
        lastError: null,
        nextRetryAt: null,
        createdAt: new Date().toISOString(),
        processedAt: null,
      };
      const id = await db.outbox.add(entry as OutboxEntry);
      return success(id);
    } catch (err) {
      return failure(new AppError('OUTBOX_ENQUEUE_FAILED', 'Error al encolar evento outbox', { details: { event, module, error: String(err) } }));
    }
  }

  async processNext(): Promise<Result<'processed' | 'failed' | 'none', AppError>> {
    try {
      const db = getDb();
      const now = Date.now();

      const entry = await db.outbox
        .where('status')
        .equals('pending')
        .and(e => !e.nextRetryAt || e.nextRetryAt <= now)
        .first();

      if (!entry) return success('none');

      await db.outbox.update(entry.id!, { status: 'processing' });

      try {
        EventBus.emit(entry.event, entry.payload);
      } catch (err) {
        const newRetries = entry.retries + 1;
        if (newRetries >= OUTBOX_MAX_RETRIES) {
          const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
          await db.outbox.update(entry.id!, {
            status: 'failed',
            retries: newRetries,
            lastError: errorMsg,
            nextRetryAt: null,
          });
          return success('failed');
        }

        const backoffMs = OUTBOX_BASE_BACKOFF_MS * Math.pow(2, newRetries - 1);
        const nextRetryAt = Date.now() + backoffMs;
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';

        await db.outbox.update(entry.id!, {
          status: 'pending',
          retries: newRetries,
          lastError: errorMsg,
          nextRetryAt,
        });
        return success('failed');
      }

      await db.outbox.update(entry.id!, {
        status: 'processed',
        processedAt: new Date().toISOString(),
      });
      return success('processed');
    } catch (err) {
      return failure(new AppError('OUTBOX_PROCESS_FAILED', 'Error al procesar outbox', { details: { error: String(err) } }));
    }
  }

  async retry(id: number): Promise<Result<void, AppError>> {
    try {
      const db = getDb();
      await db.outbox.update(id, {
        status: 'pending',
        retries: 0,
        lastError: null,
        nextRetryAt: Date.now(),
      });
      return success(undefined);
    } catch {
      return failure(new AppError('OUTBOX_RETRY_FAILED', 'Error al reintentar evento outbox'));
    }
  }

  async getPendingCount(): Promise<Result<number, AppError>> {
    try {
      const db = getDb();
      const count = await db.outbox.where('status').equals('pending').count();
      return success(count);
    } catch {
      return failure(new AppError('OUTBOX_COUNT_FAILED', 'Error al contar eventos outbox'));
    }
  }

  async cleanProcessed(olderThanDays: number = 7): Promise<Result<number, AppError>> {
    try {
      const db = getDb();
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
      const deleted = await db.outbox
        .where('status')
        .equals('processed')
        .and(e => e.processedAt !== null && e.processedAt < cutoff)
        .delete();
      return success(deleted);
    } catch {
      return failure(new AppError('OUTBOX_CLEAN_FAILED', 'Error al limpiar outbox'));
    }
  }
}

export const outboxService = new OutboxService();
