import { z } from 'zod';
import { isoDateTime } from '../helpers';

/** Reports Spec - REPORT-001..007 */

export const REPORT_TIME_RANGES = ['today', 'yesterday', 'last7days', 'thisMonth', 'lastMonth', 'custom'] as const;
export type ReportTimeRange = typeof REPORT_TIME_RANGES[number];

export const PaymentMethodBreakdownSchema = z.object({
  method: z.string(),
  label: z.string(),
  count: z.number().int().min(0),
  totalBs: z.number().min(0),
  percentage: z.number().min(0).max(100),
});

export type PaymentMethodBreakdown = z.infer<typeof PaymentMethodBreakdownSchema>;

export const TopProductSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  sku: z.string(),
  quantitySold: z.number().min(0),
  revenueBs: z.number().min(0),
  costBs: z.number().min(0),
  profitBs: z.number(),
  marginPercent: z.number(),
});

export type TopProduct = z.infer<typeof TopProductSchema>;

export const DailyProfitPointSchema = z.object({
  date: isoDateTime,
  label: z.string(),
  salesBs: z.number().min(0),
  costBs: z.number().min(0),
  profitBs: z.number(),
  transactions: z.number().int().min(0),
});

export type DailyProfitPoint = z.infer<typeof DailyProfitPointSchema>;

export const CashRegisterSummarySchema = z.object({
  registerId: z.string().uuid(),
  openedAt: isoDateTime,
  closedAt: isoDateTime.optional(),
  openingBalanceBs: z.number().min(0),
  closingBalanceBs: z.number().optional(),
  expectedClosingBs: z.number().optional(),
  differenceBs: z.number().optional(),
  totalSalesCount: z.number().int().min(0),
  totalSalesBs: z.number().min(0),
  totalIgtfBs: z.number().min(0),
  status: z.enum(['open', 'closed']),
});

export type CashRegisterSummary = z.infer<typeof CashRegisterSummarySchema>;

export const CategoryProfitSchema = z.object({
  categoryId: z.string().uuid().optional(),
  categoryName: z.string(),
  revenueBs: z.number().min(0),
  costBs: z.number().min(0),
  profitBs: z.number(),
  marginPercent: z.number(),
});

export type CategoryProfit = z.infer<typeof CategoryProfitSchema>;

export const ExecutiveSummarySchema = z.object({
  totalSalesBs: z.number().min(0),
  totalCostBs: z.number().min(0),
  grossProfitBs: z.number(),
  profitMarginPercent: z.number(),
  totalTransactions: z.number().int().min(0),
  averageTicketBs: z.number().min(0),
  totalIgtfBs: z.number().min(0),
  topProductName: z.string().optional(),
  salesVsYesterdayPercent: z.number().optional(),
  nonSellableExpensesUsd: z.number().min(0),
  nonSellableExpensesBs: z.number().min(0),
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
