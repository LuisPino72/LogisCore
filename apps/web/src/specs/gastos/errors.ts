export const GASTOS_ERRORS = {
  GASTOS_FETCH_FAILED: { code: 'GASTOS_FETCH_FAILED', message: 'Error al obtener gastos.' },
  GASTOS_CREATE_FAILED: { code: 'GASTOS_CREATE_FAILED', message: 'Error al crear el gasto.' },
  GASTOS_UPDATE_FAILED: { code: 'GASTOS_UPDATE_FAILED', message: 'Error al actualizar el gasto.' },
  GASTOS_DELETE_FAILED: { code: 'GASTOS_DELETE_FAILED', message: 'Error al eliminar el gasto.' },
  GASTOS_NOT_FOUND: { code: 'GASTOS_NOT_FOUND', message: 'Gasto no encontrado.' },
  GASTOS_RECURRING_FAILED: { code: 'GASTOS_RECURRING_FAILED', message: 'Error al generar gastos recurrentes.' },
  GASTOS_CANCEL_FAILED: { code: 'GASTOS_CANCEL_FAILED', message: 'Error al cancelar la ocurrencia.' },
  GASTOS_INVALID_CATEGORY: { code: 'GASTOS_INVALID_CATEGORY', message: 'Categoría inválida.' },
  GASTOS_AMOUNT_INVALID: { code: 'GASTOS_AMOUNT_INVALID', message: 'El monto debe ser mayor a 0.' },
  GASTOS_RATE_INVALID: { code: 'GASTOS_RATE_INVALID', message: 'La tasa debe ser mayor a 0.' },
  GASTOS_DATE_REQUIRED: { code: 'GASTOS_DATE_REQUIRED', message: 'Selecciona una fecha.' },
} as const;

export type GastosErrorCode = keyof typeof GASTOS_ERRORS;
