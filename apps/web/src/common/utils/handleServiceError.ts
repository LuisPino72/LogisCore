import type { Result } from '@logiscore/core';
import { showPermissionDenied } from '../hooks/usePermissionDenied';
import { useToastStore } from '../../stores/toastStore';

const PERMISSION_ERROR_CODES = new Set([
  'AUTH_SCOPE_DENIED',
  'REPORTS_SCOPE_DENIED',
  'SETTINGS_SCOPE_DENIED',
  'AUTH_PERMISSION_DENIED',
  'PERMISSION_DENIED',
]);

export function handleServiceError<T>(
  result: Result<T>,
): boolean {
  if (result.ok) return true;

  if (PERMISSION_ERROR_CODES.has(result.error.code)) {
    showPermissionDenied(result.error.message);
    return false;
  }

  useToastStore.getState().addToast({ type: 'error', message: result.error.message });
  return false;
}
