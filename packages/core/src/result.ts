import { AppError, isAppError } from './app-error';

/** Result<T, E>: Patrón de respuesta obligatorio (Regla de Oro #3). */
export type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E };

export function success<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function failure<E extends AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isSuccess<T, E>(result: Result<T, E>): result is { ok: true; data: T } {
  return result.ok === true;
}

export function isFailure<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}

export { AppError, isAppError };