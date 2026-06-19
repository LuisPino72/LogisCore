export type ReportTimeRange = 'today' | 'yesterday' | 'last7days' | 'thisMonth' | 'lastMonth' | 'custom';

export interface ReportFilters {
  timeRange: ReportTimeRange;
  startDate?: string;
  endDate?: string;
}

export interface AdjustmentLossExpenses {
  perdida: { totalUsd: number; count: number; estimatedCount: number };
  robo: { totalUsd: number; count: number; estimatedCount: number };
  vencido: { totalUsd: number; count: number; estimatedCount: number };
  consumo_interno: { totalUsd: number; count: number; estimatedCount: number };
  otros: { totalUsd: number; count: number; estimatedCount: number };
  totalUsd: number;
  totalBs: number;
  estimatedTotalUsd: number;
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
  operatingExpensesUsd: number;
  operatingExpensesBs: number;
  totalExpensesUsd: number;
  totalExpensesBs: number;
  netProfitUsd: number;
  netProfitBs: number;
  totalDiscountBs: number;
  totalDiscountUsd: number;
  totalIvaBs: number;
  totalIvaUsd: number;
  pendingCreditUsd: number;
  collectedCreditUsd: number;
  customersWithDebt: number;
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
  collectedDebtBs: number;
  status: 'open' | 'closed';
}



export type ReportTab = 'summary' | 'profits' | 'products' | 'cash' | 'more';

export type DrillDownType = 'ventas' | 'ganancia' | 'gastos' | 'ticket' | 'topProducto' | 'descuentos' | 'topClientes' | 'clientesRanking' | 'produccionRecetas' | 'produccionOrdenes';

export interface SaleDetail {
  id: string;
  createdAt: string;
  date: string;
  time: string;
  itemCount: number;
  subtotalBs: number;
  subtotalUsd: number;
  ivaBs: number;
  ivaUsd: number;
  totalBs: number;
  totalUsd: number;
  paymentMethod: string;
}

export interface DiscountBreakdownItem {
  saleId: string;
  date: string;
  discountBs: number;
  discountUsd: number;
  subtotalPreDiscountBs: number;
  totalBs: number;
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

// ===== CUSTOMERS REPORT =====

export interface CustomerRankingItem {
  customerId: string;
  customerName: string;
  cedula?: string;
  purchaseCount: number;
  totalSpentUsd: number;
  totalSpentBs: number;
  averageTicketUsd: number;
  lastPurchaseAt: string | null;
  firstPurchaseAt: string | null;
}

export interface CustomersSummaryData {
  totalCustomers: number;
  activeCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  retentionRate: number;
  averageTicketUsd: number;
  averageTicketBs: number;
  topCustomerName?: string;
  topCustomerSpentUsd?: number;
}

// ===== PRODUCTION REPORT =====

export interface RecipeProfitabilityItem {
  recipeId: string;
  recipeName: string;
  productName: string;
  mode: 'batch' | 'assembly';
  totalCostUsd: number;
  totalCostBs: number;
  timesProduced: number;
  totalQuantityProduced: number;
  yieldUnit: string;
  costPerUnitUsd: number;
  wastePct: number;
}

export interface ProductionSummaryData {
  totalRecipes: number;
  activeRecipes: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalQuantityProduced: number;
  mostProducedRecipe?: string;
  mostProducedQuantity?: number;
  averageWastePct: number;
  totalIngredientCostUsd: number;
  totalIngredientCostBs: number;
}


