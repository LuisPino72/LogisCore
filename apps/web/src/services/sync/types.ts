import type { AppError } from '@logiscore/core';

export type SyncOperationType = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncStatus = 'pending' | 'syncing' | 'failed';
export type ConflictStrategy = 'LWW' | 'REMOTE_WINS' | 'MANUAL';
export type SyncTableType = 'catalog' | 'transactional';

export interface SyncQueueItem {
  id?: number;
  table: string;
  operation: SyncOperationType;
  recordId: string;
  payload: Record<string, unknown>;
  tenantId: string;
  status: SyncStatus;
  retries: number;
  lastError: string | null;
  nextRetryAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncMeta {
  table: string;
  lastPullAt: number;
}

export interface SyncTableConfig {
  name: string;
  type: SyncTableType;
  conflictStrategy: ConflictStrategy;
  localIdField: string;
  remoteIdField: string;
}

export interface SyncConflict {
  queueItemId: number;
  table: string;
  recordId: string;
  localPayload: Record<string, unknown>;
  remotePayload: Record<string, unknown>;
  strategy: ConflictStrategy;
}

export interface SyncBatchResult {
  pushed: number;
  failed: number;
  conflicts: number;
  errors: AppError[];
}

export const DEFAULT_BATCH_SIZE = 10;
export const MAX_RETRIES = 5;
export const BASE_BACKOFF_MS = 1000;
