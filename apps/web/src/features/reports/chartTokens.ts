export const CHART_COLORS = {
  primary: '#0D9488',
  primaryLight: '#14B8A6',
  accent: '#F59E0B',
  danger: '#DC2626',
  info: '#3B82F6',
  purple: '#8B5CF6',
  success: '#059669',
  muted: '#94A3B8',
};

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  efectivo_bs: CHART_COLORS.primary,
  pago_movil: CHART_COLORS.info,
  tarjeta_bs: CHART_COLORS.purple,
  efectivo_usd: CHART_COLORS.accent,
};

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  costo_ventas: '#6366f1',
  no_vendibles: '#8b5cf6',
  consumo_interno: '#a78bfa',
  LUZ: '#f59e0b',
  AGUA: '#3b82f6',
  GAS: '#ef4444',
  INTERNET: '#06b6d4',
  ALQUILER: '#10b981',
  NOMINA: '#ec4899',
  IMPUESTOS: '#f97316',
  OTROS: '#9ca3af',
  perdida: '#dc2626',
  robo: '#b91c1c',
  vencido: '#d97706',
  otros: '#6b7280',
  compra_inventario: '#8b5cf6',
};

export const TOP_PRODUCTS_CHART_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.primaryLight,
  CHART_COLORS.accent,
  CHART_COLORS.danger,
  CHART_COLORS.purple,
  CHART_COLORS.info,
  '#f97316',
  '#84cc16',
  '#ec4899',
  '#6366f1',
];

export const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32'];
