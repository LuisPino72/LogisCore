export type OutboxStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface OutboxEntry {
  id?: number;
  event: string;
  module: string;
  payload: unknown;
  status: OutboxStatus;
  retries: number;
  lastError: string | null;
  nextRetryAt: number | null;
  createdAt: string;
  processedAt: string | null;
}

export const OUTBOX_MAX_RETRIES = 5;
export const OUTBOX_BASE_BACKOFF_MS = 1000;
export const OUTBOX_POLL_INTERVAL_MS = 5000;
