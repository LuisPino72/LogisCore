// ═══════════════════════════════════════════════════════════════
// AppError - Sistema de errores tipados para LogisCore ERP
// Regla de Oro #3: Toda operación asíncrona retorna Result<T, AppError>
// ═══════════════════════════════════════════════════════════════

export class AppError extends Error {
  public readonly code: string;
  public readonly module: string;
  public readonly statusCode?: number;
  public readonly details?: unknown;
  public readonly timestamp: string;

  constructor(code: string, message: string, options?: {
    statusCode?: number;
    details?: unknown;
  }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.module = code.split('_')[0] ?? 'UNKNOWN';
    this.statusCode = options?.statusCode;
    this.details = options?.details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      module: this.module,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

export type AppErrorInput = {
  code: string;
  message: string;
  statusCode?: number;
  details?: unknown;
};

export function createAppError(input: AppErrorInput): AppError {
  return new AppError(input.code, input.message, {
    statusCode: input.statusCode,
    details: input.details,
  });
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}