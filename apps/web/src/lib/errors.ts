import type { AppErrorDefinition, ErrorAction, ErrorSeverity } from '@/types/errors';

// ---------------------------------------------------------------------------
// Inference helpers
// ---------------------------------------------------------------------------

function inferSeverity(code: string, module: string): ErrorSeverity {
  // DLQ es siempre HIGH (sistema crítico)
  if (code.startsWith('DLQ')) return 'HIGH';
  // Módulo INVOICING o errores fiscales siempre HIGH
  if (module === 'INVOICING' || code.includes('FISCAL')) return 'HIGH';
  // Box closed siempre HIGH
  if (code.includes('BOX_CLOSED')) return 'HIGH';
  // Errores de sessión/token: CRITICAL
  if (code.includes('SESSION_EXPIRED') || code.includes('TOKEN_INVALID')) return 'CRITICAL';
  // Módulo AUTH: scope denegado es HIGH, los demás AUTH son CRITICAL
  if (module === 'AUTH') {
    if (code.includes('SCOPE_DENIED')) return 'HIGH';
    return 'CRITICAL';
  }
  // Not found = MEDIUM
  if (code.includes('NOT_FOUND')) return 'MEDIUM';
  // Invalid = MEDIUM
  if (code.includes('INVALID')) return 'MEDIUM';
  // Mismatch: HIGH en SALES, MEDIUM en otros
  if (code.includes('MISMATCH')) return module === 'SALES' ? 'HIGH' : 'MEDIUM';
  return 'MEDIUM';
}

function inferRecoverable(code: string, _module: string): boolean {
  if (code.includes('TOKEN_INVALID') || code.includes('SESSION_EXPIRED')) return true;
  if (code.includes('SYNC_CONFLICT')) return true;
  if (code.includes('DLQ_MAX_RETRIES')) return false;
  if (code.includes('ALREADY_ISSUED') || code.includes('ALREADY_VOIDED')) return false;
  if (code.includes('BOX_CLOSED')) return true;
  if (code.includes('NOT_FOUND')) return false;
  return false;
}

function inferAction(code: string, module: string): ErrorAction {
  if (code.includes('SESSION_EXPIRED')) return 'LOGIN_AGAIN';
  if (code.includes('TOKEN_INVALID')) return 'REFRESH_TOKEN';
  if (code.includes('BOX_CLOSED')) return 'OPEN_CASH_BOX';
  if (code.includes('NOT_FOUND') || code.includes('INVALID') || code.includes('DUPLICATE')) return 'CHECK_INPUT';
  if (code.includes('CONFLICT')) return 'RETRY';
  if (code.includes('MISMATCH')) return 'CHECK_INPUT';
  if (module === 'DLQ' || code.includes('MAX_RETRIES')) return 'CONTACT_SUPPORT';
  if (code.includes('FORBIDDEN') || code.includes('DENIED') || code.includes('PERMISSION')) return 'CONTACT_ADMIN';
  return 'NONE';
}

function inferHttpStatus(code: string, module: string): number | undefined {
  if (module === 'AUTH') return 401;
  if (code.includes('FORBIDDEN') || code.includes('DENIED')) return 403;
  if (code.includes('NOT_FOUND')) return 404;
  if (code.includes('DUPLICATE') || code.includes('CONFLICT') || code.includes('ALREADY')) return 409;
  if (code.includes('INVALID') || code.includes('MISMATCH')) return 422;
  if (module === 'DLQ') return 500;
  return undefined;
}

function makeError(
  code: string,
  id: string,
  message: string,
  module: string,
  overrides?: Partial<AppErrorDefinition>,
): AppErrorDefinition {
  return {
    id,
    code,
    message,
    severity: overrides?.severity ?? inferSeverity(code, module),
    recoverable: overrides?.recoverable ?? inferRecoverable(code, module),
    action: overrides?.action ?? inferAction(code, module),
    httpStatus: overrides?.httpStatus ?? inferHttpStatus(code, module),
    module,
  };
}

// ---------------------------------------------------------------------------
// ERROR CATALOG – generated from Reglas/Validaciones.md
// ---------------------------------------------------------------------------

export const ERROR_CATALOG: Record<string, AppErrorDefinition> = {
  // ===== CORE =====
  AUTH_NO_SESSION: makeError('AUTH_NO_SESSION', 'CORE-001', 'No hay sesión activa. Inicia sesión de nuevo.', 'CORE'),
  TENANT_NOT_FOUND: makeError('TENANT_NOT_FOUND', 'CORE-002', 'El negocio no fue encontrado. Contacta al administrador.', 'CORE'),
  SUBSCRIPTION_INACTIVE: makeError('SUBSCRIPTION_INACTIVE', 'CORE-003', 'La suscripción está vencida. Contacta al 0414-518-0265 para renovar.', 'CORE'),

  // ===== PRODUCTS =====
  PRODUCT_NOT_FOUND: makeError('PRODUCT_NOT_FOUND', 'PROD-001', 'Producto no encontrado.', 'PRODUCTS'),
  PRODUCT_SKU_DUPLICATE: makeError('PRODUCT_SKU_DUPLICATE', 'PROD-003', 'El SKU ya existe en el tenant.', 'PRODUCTS'),

  // ===== INVENTORY =====
  INVENTORY_STOCK_INSUFFICIENT: makeError('INVENTORY_STOCK_INSUFFICIENT', 'INV-001', 'Stock insuficiente para la operación.', 'INVENTORY'),
  INVENTORY_LOT_FIFO_CONFLICT: makeError('INVENTORY_LOT_FIFO_CONFLICT', 'INV-002', 'Error al procesar el inventario.', 'INVENTORY'),
  CATEGORY_HAS_PRODUCTS: makeError('CATEGORY_HAS_PRODUCTS', 'INV-004', 'No se puede eliminar una categoría que tiene productos asociados.', 'INVENTORY'),
  INVENTORY_ADJUSTMENT_INVALID: makeError('INVENTORY_ADJUSTMENT_INVALID', 'INV-005', 'El ajuste de inventario debe incluir un motivo.', 'INVENTORY'),
  INVENTORY_LOT_EXHAUSTED: makeError('INVENTORY_LOT_EXHAUSTED', 'INV-006', 'Lote de inventario agotado.', 'INVENTORY'),
  PRODUCT_STOCK_NEGATIVE: makeError('PRODUCT_STOCK_NEGATIVE', 'INV-007', 'El stock del producto no puede ser negativo.', 'INVENTORY'),

  // ===== SALES =====
  SALE_BOX_CLOSED: makeError('SALE_BOX_CLOSED', 'SALE-001', 'La caja está cerrada. Toca "Abrir Caja" para empezar a vender.', 'SALES'),
  SALE_ITEM_STOCK_INSUFFICIENT: makeError('SALE_ITEM_STOCK_INSUFFICIENT', 'SALE-002', 'Stock insuficiente para un item de la venta.', 'SALES'),
  SALE_IGTF_INVALID: makeError('SALE_IGTF_INVALID', 'SALE-003', 'Cálculo de IGTF incorrecto.', 'SALES'),
  SALE_TOTALS_MISMATCH: makeError('SALE_TOTALS_MISMATCH', 'SALE-004', 'Los totales de la venta no cuadran.', 'SALES'),
  SALE_PAYMENT_EXCEEDS_CHANGE: makeError('SALE_PAYMENT_EXCEEDS_CHANGE', 'SALE-005', 'El pago excede el vuelto disponible.', 'SALES'),
  SALE_PAYMENT_NEGATIVE: makeError('SALE_PAYMENT_NEGATIVE', 'SALE-006', 'El monto de pago es negativo.', 'SALES'),
  SALE_PAYMENT_FORMAT_INVALID: makeError('SALE_PAYMENT_FORMAT_INVALID', 'SALE-007', 'Formato de pago inválido.', 'SALES'),
  SALE_PAYMENT_TENANT_MISMATCH: makeError('SALE_PAYMENT_TENANT_MISMATCH', 'SALE-008', 'El método de pago no coincide con el tenant.', 'SALES'),
  SALE_CASH_PAYMENT_TOO_LARGE: makeError('SALE_CASH_PAYMENT_TOO_LARGE', 'SALE-009', 'Pago en efectivo demasiado grande.', 'SALES'),
  SALE_CHANGE_CALCULATION_ERROR: makeError('SALE_CHANGE_CALCULATION_ERROR', 'SALE-010', 'Error en el cálculo del vuelto.', 'SALES'),
  SALE_PAID_LESS_THAN_TOTAL: makeError('SALE_PAID_LESS_THAN_TOTAL', 'SALE-011', 'El pago es menor que el total de la venta.', 'SALES'),
  SALE_PAID_MORE_THAN_CASH_ON_HAND: makeError('SALE_PAID_MORE_THAN_CASH_ON_HAND', 'SALE-012', 'El pago es mayor que el efectivo disponible.', 'SALES'),
  SALE_PAYMENT_METHOD_INVALID: makeError('SALE_PAYMENT_METHOD_INVALID', 'SALE-013', 'Método de pago inválido.', 'SALES'),
  SALE_PAYMENT_METHOD_NOT_ALLOWED: makeError('SALE_PAYMENT_METHOD_NOT_ALLOWED', 'SALE-014', 'Método de pago no permitido para este tenant.', 'SALES'),
  SALE_TAX_CALCULATION_ERROR: makeError('SALE_TAX_CALCULATION_ERROR', 'SALE-015', 'Error en el cálculo de impuestos.', 'SALES'),
  SALE_DISCOUNT_EXCEEDS_LIMIT: makeError('SALE_DISCOUNT_EXCEEDS_LIMIT', 'SALE-016', 'El descuento excede el límite permitido.', 'SALES'),
  SALE_WEIGHT_PRECISION_ERROR: makeError('SALE_WEIGHT_PRECISION_ERROR', 'SALE-017', 'Error de precisión en producto pesable.', 'SALES'),
  SALE_FIFO_CONSUMPTION_FAILED: makeError('SALE_FIFO_CONSUMPTION_FAILED', 'SALE-018', 'Error al procesar el inventario.', 'SALES'),
  SALE_NEGATIVE_STOCK_ATTEMPTED: makeError('SALE_NEGATIVE_STOCK_ATTEMPTED', 'SALE-019', 'Intento de generar stock negativo.', 'SALES'),
  SALE_ITEM_INVALID: makeError('SALE_ITEM_INVALID', 'SALE-020', 'Item de venta inválido.', 'SALES'),
  SALE_ITEM_NOT_FOUND: makeError('SALE_ITEM_NOT_FOUND', 'SALE-021', 'Item de venta no encontrado.', 'SALES'),
  SALE_ITEM_QUANTITY_INVALID: makeError('SALE_ITEM_QUANTITY_INVALID', 'SALE-022', 'Cantidad de item inválida.', 'SALES'),
  SALE_ITEM_PRICE_INVALID: makeError('SALE_ITEM_PRICE_INVALID', 'SALE-023', 'Precio de item inválido.', 'SALES'),
  SALE_ITEM_TAX_INVALID: makeError('SALE_ITEM_TAX_INVALID', 'SALE-024', 'Impuesto de item inválido.', 'SALES'),
  SALE_ITEM_DISCOUNT_INVALID: makeError('SALE_ITEM_DISCOUNT_INVALID', 'SALE-025', 'Descuento de item inválido.', 'SALES'),
  SALE_ITEM_SUBTOTAL_INVALID: makeError('SALE_ITEM_SUBTOTAL_INVALID', 'SALE-026', 'Subtotal de item inválido.', 'SALES'),
  SALE_ITEM_TOTAL_INVALID: makeError('SALE_ITEM_TOTAL_INVALID', 'SALE-027', 'Total de item inválido.', 'SALES'),
  SALE_CUSTOMER_RIF_INVALID: makeError('SALE_CUSTOMER_RIF_INVALID', 'SALE-028', 'RIF de cliente inválido.', 'SALES'),
  SALE_CUSTOMER_NAME_REQUIRED: makeError('SALE_CUSTOMER_NAME_REQUIRED', 'SALE-029', 'Nombre de cliente requerido.', 'SALES'),
  SALE_CREDIT_SALE_NOT_ALLOWED: makeError('SALE_CREDIT_SALE_NOT_ALLOWED', 'SALE-030', 'Venta al crédito no permitida.', 'SALES'),
  SALE_CREDIT_LIMIT_EXCEEDED: makeError('SALE_CREDIT_LIMIT_EXCEEDED', 'SALE-031', 'Límite de crédito excedido.', 'SALES'),
  SALE_CREDIT_TERMS_INVALID: makeError('SALE_CREDIT_TERMS_INVALID', 'SALE-032', 'Términos de crédito inválidos.', 'SALES'),

  // ===== INVOICING =====
  INVOICE_RIF_INVALID: makeError('INVOICE_RIF_INVALID', 'INVC-001', 'RIF del cliente inválido.', 'INVOICING'),
  INVOICE_MISSING_RIF: makeError('INVOICE_MISSING_RIF', 'INVC-002', 'RIF del cliente obligatorio para emitir factura.', 'INVOICING'),
  INVOICE_RANGE_EXHAUSTED: makeError('INVOICE_RANGE_EXHAUSTED', 'INVC-003', 'No hay números disponibles en el talonario.', 'INVOICING'),
  INVOICE_IGTF_MISMATCH: makeError('INVOICE_IGTF_MISMATCH', 'INVC-004', 'El IGTF almacenado no coincide con el calculado.', 'INVOICING'),
  INVOICE_ALREADY_ISSUED: makeError('INVOICE_ALREADY_ISSUED', 'INVC-005', 'La factura ya fue emitida.', 'INVOICING'),
  INVOICE_ALREADY_VOIDED: makeError('INVOICE_ALREADY_VOIDED', 'INVC-006', 'La factura ya está anulada.', 'INVOICING'),
  INVOICE_VOIDED: makeError('INVOICE_VOIDED', 'INVC-007', 'No se puede emitir una factura anulada.', 'INVOICING'),
  INVOICE_NOT_FOUND: makeError('INVOICE_NOT_FOUND', 'INVC-008', 'La factura no existe.', 'INVOICING'),
  INVOICE_LINKED_TO_SALE: makeError('INVOICE_LINKED_TO_SALE', 'INVC-009', 'No se puede anular una factura vinculada a una venta.', 'INVOICING'),
  INVOICE_CENTS_ADJUSTMENT_NEEDED: makeError('INVOICE_CENTS_ADJUSTMENT_NEEDED', 'INVC-010', 'Ajuste de céntimos necesario en el total.', 'INVOICING'),
  INVOICE_EXCHANGE_RATE_SNAPSHOT_MISSING: makeError('INVOICE_EXCHANGE_RATE_SNAPSHOT_MISSING', 'INVC-011', 'Falta la tasa de cambio para este registro.', 'INVOICING'),
  INVOICING_TENANT_ID_MUST_BE_SLUG: makeError('INVOICING_TENANT_ID_MUST_BE_SLUG', 'INVC-012', 'Error interno de configuración.', 'INVOICING'),
  SALE_LOCAL_ID_REQUIRED: makeError('SALE_LOCAL_ID_REQUIRED', 'INVC-013', 'El ID de venta es obligatorio.', 'INVOICING'),
  INVOICE_LOCAL_ID_REQUIRED: makeError('INVOICE_LOCAL_ID_REQUIRED', 'INVC-014', 'El ID de factura es obligatorio.', 'INVOICING'),
  FISCAL_INVOICE_IMMUTABLE: makeError('FISCAL_INVOICE_IMMUTABLE', 'INVC-015', 'Los campos fiscales son inmutables post-emisión.', 'INVOICING'),
  TAX_RULE_NOT_FOUND: makeError('TAX_RULE_NOT_FOUND', 'INVC-016', 'Regla fiscal no encontrada.', 'INVOICING'),
  TAX_RULES_FETCH_FAILED: makeError('TAX_RULES_FETCH_FAILED', 'INVC-017', 'Error al obtener las reglas fiscales.', 'INVOICING'),
  TAX_RULE_IGTF_MUST_BE_3_PERCENT: makeError('TAX_RULE_IGTF_MUST_BE_3_PERCENT', 'INVC-018', 'IGTF debe ser exactamente 3%.', 'INVOICING'),
  TAX_RULE_JURISDICTION_INVALID: makeError('TAX_RULE_JURISDICTION_INVALID', 'INVC-019', 'Jurisdicción inválida.', 'INVOICING'),
  TAX_RULE_TENANT_ID_MUST_BE_SLUG: makeError('TAX_RULE_TENANT_ID_MUST_BE_SLUG', 'INVC-020', 'Error interno de configuración.', 'INVOICING'),

  // ===== PURCHASES =====
  // ===== REPORTS =====
  EXCHANGE_RATE_NOT_FOUND: makeError('EXCHANGE_RATE_NOT_FOUND', 'RPT-001', 'Tasa de cambio no disponible para el período.', 'REPORTS'),
  BALANCE_SHEET_IMBALANCED: makeError('BALANCE_SHEET_IMBALANCED', 'RPT-002', 'El Balance General no cuadra.', 'REPORTS'),

  // ===== ADMIN =====
  ADMIN_PLAN_PRODUCT_LIMIT_EXCEEDED: makeError('ADMIN_PLAN_PRODUCT_LIMIT_EXCEEDED', 'ADM-001', 'Límite de productos del plan alcanzado.', 'ADMIN'),
  ADMIN_PLAN_INVOICE_LIMIT_EXCEEDED: makeError('ADMIN_PLAN_INVOICE_LIMIT_EXCEEDED', 'ADM-002', 'Límite de facturas mensuales alcanzado.', 'ADMIN'),
  ADMIN_PLAN_USER_LIMIT_EXCEEDED: makeError('ADMIN_PLAN_USER_LIMIT_EXCEEDED', 'ADM-003', 'Límite de usuarios del plan alcanzado.', 'ADMIN'),

  // ===== SECURITY =====
  PERMISSION_DENIED: makeError('PERMISSION_DENIED', 'SEC-001', 'No tienes permiso para esta acción. Contacta al administrador.', 'SECURITY'),
  MISSING_BEARER_TOKEN: makeError('MISSING_BEARER_TOKEN', 'SEC-002', 'Token de autorización no proporcionado.', 'SECURITY'),
  INVALID_JWT: makeError('INVALID_JWT', 'SEC-003', 'Token JWT inválido o expirado.', 'SECURITY'),
  FORBIDDEN_NO_ROLE: makeError('FORBIDDEN_NO_ROLE', 'SEC-004', 'No tienes un rol asignado. Contacta al administrador.', 'SECURITY'),
  ROLE_QUERY_FAILED: makeError('ROLE_QUERY_FAILED', 'SEC-005', 'Error al consultar rol del usuario.', 'SECURITY'),
  FORBIDDEN_ADMIN_ONLY: makeError('FORBIDDEN_ADMIN_ONLY', 'SEC-006', 'Solo los administradores pueden hacer esto. Contacta al administrador.', 'SECURITY'),
  CORS_ORIGIN_DENIED: makeError('CORS_ORIGIN_DENIED', 'SEC-007', 'Origen de petición no permitido.', 'SECURITY'),
  JWT_VERIFICATION_REQUIRED: makeError('JWT_VERIFICATION_REQUIRED', 'SEC-008', 'Acceso anónimo a endpoint protegido.', 'SECURITY'),

  // ===== AUTH =====
  AUTH_SESSION_EXPIRED: makeError('AUTH_SESSION_EXPIRED', 'AUTH-001', 'La sesión ha expirado. Inicie sesión de nuevo.', 'AUTH'),
  AUTH_TOKEN_INVALID: makeError('AUTH_TOKEN_INVALID', 'AUTH-002', 'Token inválido o malformado.', 'AUTH'),
  AUTH_SCOPE_DENIED: makeError('AUTH_SCOPE_DENIED', 'AUTH-003', 'Permiso requerido no disponible.', 'AUTH'),

  // ===== SYNC =====
  SYNC_CONFLICT: makeError('SYNC_CONFLICT', 'SYNC-001', 'Conflicto de sincronización detectado.', 'SYNC'),
  SYNC_TENANT_TRANSLATION_FAILED: makeError('SYNC_TENANT_TRANSLATION_FAILED', 'SYNC-002', 'Fallo al resolver UUID del tenant.', 'SYNC'),
  SYNC_BATCH_FAILED: makeError('SYNC_BATCH_FAILED', 'SYNC-003', 'Fallo parcial o total en lote de sincronización.', 'SYNC'),
  SYNC_REFRESH_REQUIRED: makeError('SYNC_REFRESH_REQUIRED', 'SYNC-004', 'La UI requiere actualización post-sync.', 'SYNC'),
  SYNC_BACKOFF_ACTIVE: makeError('SYNC_BACKOFF_ACTIVE', 'SYNC-005', 'Elemento en espera asíncrono no-bloqueante.', 'SYNC'),

  // ===== DLQ =====
  DLQ_MAX_RETRIES_EXCEEDED: makeError('DLQ_MAX_RETRIES_EXCEEDED', 'DLQ-001', 'Máximo de reintentos alcanzado.', 'DLQ'),
  DLQ_ALREADY_RESOLVED: makeError('DLQ_ALREADY_RESOLVED', 'DLQ-002', 'Entrada DLQ ya resuelta.', 'DLQ'),
  DLQ_CONTEXT_MISSING: makeError('DLQ_CONTEXT_MISSING', 'DLQ-003', 'Contexto requerido para DLQ.', 'DLQ'),
  DLQ_SYNC_FAILED: makeError('DLQ_SYNC_FAILED', 'DLQ-004', 'Error en sincronización de DLQ.', 'DLQ'),
  DLQ_VALIDATION_FAILED: makeError('DLQ_VALIDATION_FAILED', 'DLQ-005', 'Validación de entrada DLQ falló.', 'DLQ'),

  // ===== AUDIT =====
  AUDIT_DETAILS_MISMATCH: makeError('AUDIT_DETAILS_MISMATCH', 'AUD-001', 'Error en los datos del evento.', 'AUDIT'),

  // ===== EVENTBUS =====
  EVENTBUS_PAYLOAD_VALIDATION_FAILED: makeError('EVENTBUS_PAYLOAD_VALIDATION_FAILED', 'EVB-001', 'Error en los datos del evento.', 'EVENTBUS'),
  EVENTBUS_INVALID_EVENT_NAME: makeError('EVENTBUS_INVALID_EVENT_NAME', 'EVB-002', 'Nombre de evento inválido.', 'EVENTBUS'),

  // ===== TENANT TRANSLATOR =====
  TENANT_INVALID_SLUG_FORMAT: makeError('TENANT_INVALID_SLUG_FORMAT', 'TEN-001', 'Formato de slug inválido.', 'TENANT'),
  TENANT_MISMATCH: makeError('TENANT_MISMATCH', 'TEN-002', 'Payload pertenece a un tenant diferente a la sesión.', 'TENANT'),

  // ===== POS =====
  SALE_NO_ITEMS: makeError('SALE_NO_ITEMS', 'POS-004', 'No hay productos en el carrito.', 'POS'),
  SALE_STOCK_INSUFFICIENT: makeError('SALE_STOCK_INSUFFICIENT', 'POS-005', 'Stock insuficiente para completar la venta.', 'POS'),
  SALE_EXCHANGE_RATE_NOT_FOUND: makeError('SALE_EXCHANGE_RATE_NOT_FOUND', 'POS-006', 'No hay tasa de cambio. Ve a "Tasa" y configúrala antes de vender.', 'POS'),
  BOX_ALREADY_OPEN: makeError('BOX_ALREADY_OPEN', 'POS-007', 'Ya existe una caja abierta para este local.', 'POS'),
  BOX_ALREADY_CLOSED: makeError('BOX_ALREADY_CLOSED', 'POS-008', 'La caja ya está cerrada.', 'POS'),
  BOX_OPENING_BALANCE_REQUIRED: makeError('BOX_OPENING_BALANCE_REQUIRED', 'POS-009', 'Debe ingresar un monto inicial para abrir la caja.', 'POS'),
  BOX_CLOSING_BALANCE_REQUIRED: makeError('BOX_CLOSING_BALANCE_REQUIRED', 'POS-010', 'Debe ingresar el monto final para cerrar la caja.', 'POS'),
  CART_ITEM_WEIGHT_REQUIRED: makeError('CART_ITEM_WEIGHT_REQUIRED', 'POS-011', 'Ingrese la cantidad para productos pesables.', 'POS'),
  BOX_QUERY_FAILED: makeError('BOX_QUERY_FAILED', 'POS-012', 'Error al consultar el estado de la caja.', 'POS'),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getErrorByCode(code: string): AppErrorDefinition {
  const error = ERROR_CATALOG[code];
  if (!error) {
    return {
      id: 'UNKNOWN-000',
      code,
      message: 'Error desconocido. Contacte a soporte.',
      severity: 'CRITICAL',
      recoverable: false,
      action: 'CONTACT_SUPPORT',
      httpStatus: 500,
      module: 'UNKNOWN',
    };
  }
  return error;
}
