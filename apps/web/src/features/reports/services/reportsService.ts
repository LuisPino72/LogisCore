// Backward-compatibility facade — re-exports all report services
import { getExecutiveSummary } from './executiveSummaryService';
import { getProfitOverTime, getTopProducts, getTopCategories, getPaymentBreakdown, getSalesDetail, getTicketDistribution, getDiscountBreakdown } from './salesAnalysisService';
import { getCashAnalysis, getCashAnalysisByRegister, getCashAnalysisGlobal } from './cashAnalysisService';
import { getNonSellableExpenses, getAdjustmentLossExpenses, getExpenseBreakdown } from './expensesService';
import { getCustomersSummary, getCustomersRanking } from './customersReportService';
import { getProductionSummary, getRecipeProfitability } from './productionReportService';
import { getPendingPayables } from './payablesService';
import { getDeliverySettlement, markDeliverySettlementPaid } from './deliverySettlementService';
import { getLowStockReport } from './lowStockReportService';

export const reportsService = {
  getExecutiveSummary,
  getProfitOverTime,
  getTopProducts,
  getTopCategories,
  getPaymentBreakdown,
  getCashAnalysis,
  getCashAnalysisByRegister,
  getCashAnalysisGlobal,
  getNonSellableExpenses,
  getAdjustmentLossExpenses,
  getSalesDetail,
  getExpenseBreakdown,
  getTicketDistribution,
  getDiscountBreakdown,
  getCustomersSummary,
  getCustomersRanking,
  getProductionSummary,
  getPendingPayables,
  getRecipeProfitability,
  getDeliverySettlement,
  markDeliverySettlementPaid,
  getLowStockReport,
};
