// Backward-compatibility facade — re-exports all report services
import { getExecutiveSummary } from './executiveSummaryService';
import { getProfitOverTime, getTopProducts, getTopCategories, getPaymentBreakdown, getSalesDetail, getTicketDistribution, getDiscountBreakdown } from './salesAnalysisService';
import { getCashAnalysis, getCashAnalysisByRegister, getCashAnalysisGlobal } from './cashAnalysisService';
import { getNonSellableExpenses, getAdjustmentLossExpenses, getExpenseBreakdown } from './expensesService';
import { getCustomersSummary, getCustomersRanking, getPendingCreditDetail } from './customersReportService';
import { getProductionSummary, getRecipeProfitability } from './productionReportService';
import { getPendingPayables, getPayablesDetail } from './payablesService';
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
  getPendingCreditDetail,
  getProductionSummary,
  getPendingPayables,
  getPayablesDetail,
  getRecipeProfitability,
  getDeliverySettlement,
  markDeliverySettlementPaid,
  getLowStockReport,
};
