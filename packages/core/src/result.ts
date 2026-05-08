/** Result<T, E>: Patrón de respuesta obligatorio (Regla de Oro #3). */
export type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E };

export function success<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function failure<E extends AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Códigos de error estandarizados. Formato: {MODULO}_{ENTIDAD}_{ACCION}_{CONDICION} */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}