import { type Result, success, failure, AppError } from '@logiscore/core';
import { networkAware } from './networkAwareService';

export function requireNetwork(): Result<void, AppError> {
  if (!networkAware.isOnline()) {
    return failure(new AppError(
      'NO_INTERNET',
      'Necesitas conexión a internet para realizar esta acción.'
    ));
  }
  return success(undefined);
}

export function isOnline(): boolean {
  return networkAware.isOnline();
}
