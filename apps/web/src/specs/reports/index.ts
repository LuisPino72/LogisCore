import { z } from 'zod';
import { isoDateTime } from '../helpers';

/** Reports Spec - REPORT-001..007 - MED-7: Schemas sincronizados con tipos reales */

export const REPORT_TIME_RANGES = ['today', 'yesterday', 'last7days', 'thisMonth', 'lastMonth', 'custom'] as const;
export type ReportTimeRange = typeof REPORT_TIME_RANGES[number];

export const PaymentMethodBreakdownSchema = z.object({
  method: z.string(),
  label: z.string(),
  count: z.number().int().min(0),
  totalBs: z.number().min(0),
  totalUsd: z.number().min(0),
  percentage: z.number().min(0).max(100),
});

export type PaymentMethodBreakdown = z.infer<typeof PaymentMethodBreakdownSchema>;

export const TopProductSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  sku: z.string(),
  quantitySold: z.number().min(0),
  revenueBs: z.number().min(0),
  revenueUsd: z.number().min(0),
  costBs: z.number().min(0),
  costUsd: z.number().min(0),
  profitBs: z.number(),
  profitUsd: z.number(),
  marginPercent: z.number(),
});

export type TopProduct = z.infer<typeof TopProductSchema>;

export const DailyProfitPointSchema = z.object({
  date: isoDateTime,
  label: z.string(),
  salesBs: z.number().min(0),
  salesUsd: z.number().min(0),
  costBs: z.number().min(0),
  costUsd: z.number().min(0),
  profitBs: z.number(),
  profitUsd: z.number(),
  transactions: z.number().int().min(0),
  lastRate: z.number(),
});

export type DailyProfitPoint = z.infer<typeof DailyProfitPointSchema>;

export const AdjustmentLossExpensesSchema = z.object({
  perdida: z.object({ totalUsd: z.number(), count: z.number(), estimatedCount: z.number() }),
  robo: z.object({ totalUsd: z.number(), count: z.number(), estimatedCount: z.number() }),
  vencido: z.object({ totalUsd: z.number(), count: z.number(), estimatedCount: z.number() }),
  consumo_interno: z.object({ totalUsd: z.number(), count: z.number(), estimatedCount: z.number() }),
  otros: z.object({ totalUsd: z.number(), count: z.number(), estimatedCount: z.number() }),
  totalUsd: z.number(),
  totalBs: z.number(),
  estimatedTotalUsd: z.number(),
});

export const CashRegisterSummarySchema = z.object({
  registerId: z.string().uuid(),
  openedAt: isoDateTime,
  closedAt: isoDateTime.optional(),
  openingBalanceBs: z.number().min(0),
  openingBalanceUsd: z.number().min(0),
  closingBalanceBs: z.number().optional(),
  closingBalanceUsd: z.number().optional(),
  expectedClosingBs: z.number().optional(),
  expectedClosingUsd: z.number().optional(),
  differenceBs: z.number().optional(),
  differenceUsd: z.number().optional(),
  totalSalesCount: z.number().int().min(0),
  totalSalesBs: z.number().min(0),
  totalSalesUsd: z.number().min(0),
  collectedDebtBs: z.number(),
  status: z.enum(['open', 'closed']),
});

export type CashRegisterSummary = z.infer<typeof CashRegisterSummarySchema>;

export const CategoryProfitSchema = z.object({
  categoryId: z.string().uuid().optional(),
  categoryName: z.string(),
  productCount: z.number().int().min(0),
  quantitySold: z.number().min(0),
  revenueBs: z.number().min(0),
  revenueUsd: z.number().min(0),
  costBs: z.number().min(0),
  costUsd: z.number().min(0),
  profitBs: z.number(),
  profitUsd: z.number(),
  marginPercent: z.number(),
});

export type CategoryProfit = z.infer<typeof CategoryProfitSchema>;

export const ExecutiveSummarySchema = z.object({
  totalSalesBs: z.number().min(0),
  totalSalesUsd: z.number().min(0),
  totalCostBs: z.number().min(0),
  totalCostUsd: z.number().min(0),
  grossProfitBs: z.number(),
  grossProfitUsd: z.number(),
  profitMarginPercent: z.number(),
  totalTransactions: z.number().int().min(0),
  averageTicketBs: z.number().min(0),
  averageTicketUsd: z.number().min(0),
  topProductName: z.string().optional(),
  salesVsYesterdayPercent: z.number().optional(),
  nonSellableExpensesUsd: z.number().min(0),
  nonSellableExpensesBs: z.number().min(0),
  adjustmentLossExpenses: AdjustmentLossExpensesSchema,
  operatingExpensesUsd: z.number().min(0),
  operatingExpensesBs: z.number().min(0),
  totalExpensesUsd: z.number().min(0),
  totalExpensesBs: z.number().min(0),
  netProfitUsd: z.number(),
  netProfitBs: z.number(),
  totalDiscountBs: z.number().min(0),
  totalDiscountUsd: z.number().min(0),
  totalIvaBs: z.number().min(0),
  totalIvaUsd: z.number().min(0),
  pendingCreditUsd: z.number().min(0),
  collectedCreditUsd: z.number().min(0),
  customersWithDebt: z.number().int().min(0),
});

export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

export const ReportsFiltersSchema = z.object({
  timeRange: z.enum(REPORT_TIME_RANGES),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).refine(
  (data) => {
    if (data.timeRange === 'custom') {
      return !!data.startDate && !!data.endDate;
    }
    return true;
  },
  { message: 'Rango personalizado requiere fecha inicio y fin.' },
).refine(
  (data) => {
    if (data.timeRange === 'custom' && data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'La fecha de inicio no puede ser posterior a la fecha fin.' },
);

export type ReportsFilters = z.infer<typeof ReportsFiltersSchema>;

export const ValidateTenantInputSchema = z.string().min(1, 'El ID del tenant es requerido.');

export const TopProductsLimitSchema = z.number().int().min(1, 'El límite debe ser al menos 1.').max(1000, 'El límite no puede exceder 1000.').default(10);
