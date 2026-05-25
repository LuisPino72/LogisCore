export type ReportTimeRange = 'today' | 'yesterday' | 'last7days' | 'thisMonth' | 'lastMonth' | 'custom';

export interface ReportFilters {
  timeRange: ReportTimeRange;
  startDate?: string;
  endDate?: string;
}

export interface AdjustmentLossExpenses {
  perdida: { totalUsd: number; count: number };
  robo: { totalUsd: number; count: number };
  vencido: { totalUsd: number; count: number };
  consumo_interno: { totalUsd: number; count: number };
  otros: { totalUsd: number; count: number };
  totalUsd: number;
  totalBs: number;
}

export interface ExecutiveSummaryData {
  totalSalesBs: number;
  totalSalesUsd: number;
  totalCostBs: number;
  totalCostUsd: number;
  grossProfitBs: number;
  grossProfitUsd: number;
  profitMarginPercent: number;
  totalTransactions: number;
  averageTicketBs: number;
  averageTicketUsd: number;
  topProductName?: string;
  salesVsYesterdayPercent?: number;
  nonSellableExpensesUsd: number;
  nonSellableExpensesBs: number;
  adjustmentLossExpenses: AdjustmentLossExpenses;
  totalExpensesUsd: number;
  totalExpensesBs: number;
  netProfitUsd: number;
  netProfitBs: number;
  totalDiscountBs: number;
  totalDiscountUsd: number;
}

export interface DailyProfitPoint {
  date: string;
  label: string;
  salesBs: number;
  salesUsd: number;
  costBs: number;
  costUsd: number;
  profitBs: number;
  profitUsd: number;
  transactions: number;
  lastRate: number;
}

export interface TopCategoryData {
  categoryId: string;
  categoryName: string;
  productCount: number;
  quantitySold: number;
  revenueBs: number;
  revenueUsd: number;
  costBs: number;
  costUsd: number;
  profitBs: number;
  profitUsd: number;
  marginPercent: number;
}

export interface TopProductData {
  productId: string;
  name: string;
  sku: string;
  quantitySold: number;
  revenueBs: number;
  revenueUsd: number;
  costBs: number;
  costUsd: number;
  profitBs: number;
  profitUsd: number;
  marginPercent: number;
}

export interface PaymentBreakdownData {
  method: string;
  label: string;
  count: number;
  totalBs: number;
  totalUsd: number;
  percentage: number;
}

export interface CashRegisterSummaryData {
  registerId: string;
  openedAt: string;
  closedAt?: string;
  openingBalanceBs: number;
  openingBalanceUsd: number;
  closingBalanceBs?: number;
  closingBalanceUsd?: number;
  expectedClosingBs?: number;
  expectedClosingUsd?: number;
  differenceBs?: number;
  differenceUsd?: number;
  totalSalesCount: number;
  totalSalesBs: number;
  totalSalesUsd: number;
  status: 'open' | 'closed';
}



export type ReportTab = 'summary' | 'profits' | 'products' | 'cash';

export type DrillDownType = 'ventas' | 'ganancia' | 'gastos' | 'ticket' | 'topProducto';

export interface SaleDetail {
  id: string;
  date: string;
  time: string;
  itemCount: number;
  totalBs: number;
  totalUsd: number;
  paymentMethod: string;
}

export interface ExpenseBreakdownItem {
  type: string;
  label: string;
  amountBs: number;
  amountUsd: number;
}

export interface TicketDistributionItem {
  range: string;
  count: number;
  percentage: number;
  cumulative: number;
}


