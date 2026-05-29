export { syncEngine, SyncEngine } from './syncEngine';
export { syncQueue } from './syncQueue';
export { resolveConflict, detectConflict } from './conflictResolver';
export { realtimeService } from './realtimeService';
export type { RealtimeTable } from './realtimeService';
export type {
  SyncOperationType,
  SyncStatus,
  ConflictStrategy,
  SyncTableType,
  SyncQueueItem,
  SyncMeta,
  SyncTableConfig,
  SyncConflict,
  SyncBatchResult,
} from './types';
export {
  DEFAULT_BATCH_SIZE,
  MAX_RETRIES,
  BASE_BACKOFF_MS,
  SYNC_INTERVAL_MS,
} from './types';
