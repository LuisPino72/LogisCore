import { AppError } from '@logiscore/core';
import type { SyncConflict } from './types';

export function resolveConflict(
  conflict: SyncConflict,
): Record<string, unknown> {
  switch (conflict.strategy) {
    case 'LWW':
      return resolveLWW(conflict);
    case 'REMOTE_WINS':
      return { ...conflict.remotePayload };
    case 'MANUAL':
      throw new AppError(
        'SYNC_MANUAL_RESOLUTION_REQUIRED',
        `Conflicto en ${conflict.table}/${conflict.recordId} requiere resolución manual`,
        { details: { conflict } },
      );
    default:
      return resolveLWW(conflict);
  }
}

function resolveLWW(conflict: SyncConflict): Record<string, unknown> {
  const localUpdated = conflict.localPayload.updatedAt as string | undefined;
  const remoteUpdated = conflict.remotePayload.updatedAt as string | undefined;

  if (!remoteUpdated) return conflict.localPayload;
  if (!localUpdated) return conflict.remotePayload;

  return localUpdated >= remoteUpdated ? conflict.localPayload : conflict.remotePayload;
}

export function detectConflict(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): boolean {
  if (!remote) return false;
  const localUpdated = local.updatedAt as string | undefined;
  const remoteUpdated = remote.updatedAt as string | undefined;

  if (!localUpdated || !remoteUpdated) return false;
  return remoteUpdated > localUpdated;
}
