import { useState } from 'react';
import { Download, Printer, Loader2 } from 'lucide-react';
import { Button } from '@/common/components';
import { useExport } from '../hooks/useExport';
import type {
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  TopCategoryData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
  ExpenseBreakdownItem,
  CustomersSummaryData,
  CustomerRankingItem,
  ProductionSummaryData,
  RecipeProfitabilityItem,
} from '../types';

interface ExportButtonProps {
  summary: ExecutiveSummaryData | null;
  profitOverTime: DailyProfitPoint[];
  topProducts: TopProductData[];
  topCategories: TopCategoryData[];
  paymentBreakdown: PaymentBreakdownData[];
  cashAnalysis: CashRegisterSummaryData[];
  expenseBreakdown: ExpenseBreakdownItem[];
  customersSummary: CustomersSummaryData | null;
  customersRanking: CustomerRankingItem[];
  productionSummary: ProductionSummaryData | null;
  recipeProfitability: RecipeProfitabilityItem[];
  loading: boolean;
  onPrint: () => void;
  isGeneratingPdf?: boolean;
  fetchMoreTabData?: () => Promise<void>;
}

export function ExportButton({
  summary, profitOverTime, topProducts, topCategories, paymentBreakdown, cashAnalysis, expenseBreakdown, customersSummary, customersRanking, productionSummary, recipeProfitability, loading, onPrint, isGeneratingPdf = false, fetchMoreTabData,
}: ExportButtonProps) {
  const { exportExcelAll } = useExport();
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleExcel = async () => {
    setIsExportingExcel(true);
    try {
      await fetchMoreTabData?.();
      await exportExcelAll({ summary, profitOverTime, topProducts, topCategories, paymentBreakdown, cashAnalysis, expenseBreakdown, customersSummary, customersRanking, productionSummary, recipeProfitability });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handlePrint = async () => {
    await fetchMoreTabData?.();
    onPrint();
  };

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExcel}
        disabled={loading || isExportingExcel}
        className="min-h-11 rounded-r-none border-r-0 active:scale-[0.98]"
      >
        {isExportingExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        <span className="hidden sm:inline">{isExportingExcel ? 'Exportando...' : 'Excel'}</span>
      </Button>
      <div className="w-px h-6 bg-border" />
      <Button
        variant="primary"
        size="sm"
        onClick={handlePrint}
        disabled={loading || isGeneratingPdf}
        className="min-h-11 rounded-l-none active:scale-[0.98]"
      >
        {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
        <span className="hidden sm:inline">{isGeneratingPdf ? 'Generando...' : 'PDF'}</span>
      </Button>
    </div>
  );
}
