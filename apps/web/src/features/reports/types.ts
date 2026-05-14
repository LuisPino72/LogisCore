export type ReportTimeRange = 'today' | 'yesterday' | 'last7days' | 'thisMonth' | 'lastMonth' | 'custom';

export interface ReportFilters {
  timeRange: ReportTimeRange;
  startDate?: string;
  endDate?: string;
}

export interface ExecutiveSummaryData {
  totalSalesBs: number;
  totalCostBs: number;
  grossProfitBs: number;
  profitMarginPercent: number;
  totalTransactions: number;
  averageTicketBs: number;
  totalIgtfBs: number;
  topProductName?: string;
  salesVsYesterdayPercent?: number;
}

export interface DailyProfitPoint {
  date: string;
  label: string;
  salesBs: number;
  costBs: number;
  profitBs: number;
  transactions: number;
}

export interface TopProductData {
  productId: string;
  name: string;
  sku: string;
  quantitySold: number;
  revenueBs: number;
  costBs: number;
  profitBs: number;
  marginPercent: number;
}

export interface PaymentBreakdownData {
  method: string;
  label: string;
  count: number;
  totalBs: number;
  percentage: number;
}

export interface CashRegisterSummaryData {
  registerId: string;
  openedAt: string;
  closedAt?: string;
  openingBalanceBs: number;
  closingBalanceBs?: number;
  expectedClosingBs?: number;
  differenceBs?: number;
  totalSalesCount: number;
  totalSalesBs: number;
  totalIgtfBs: number;
  status: 'open' | 'closed';
}

export interface CategoryProfitData {
  categoryId?: string;
  categoryName: string;
  revenueBs: number;
  costBs: number;
  profitBs: number;
  marginPercent: number;
}

export type ReportTab = 'summary' | 'profits' | 'products' | 'payments' | 'cash';
