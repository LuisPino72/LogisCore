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
  onPrint: (scope: string) => void;
  isGeneratingPdf?: boolean;
  fetchMoreTabData?: () => Promise<void>;
  activeTab: string;
  activeTabLabel: string;
  lowStockProducts?: { productId: string; name: string; sku: string; stock: number; minStock: number; categoryName?: string }[];
  worstProducts?: TopProductData[];
  worstCategories?: TopCategoryData[];
  topByVolume?: TopProductData[];
  deliverySettlement?: { name: string; deliveryCount: number; totalFees: number; paidAmount: number; pendingAmount: number }[];
}

export function ExportButton({
  summary, profitOverTime, topProducts, topCategories, paymentBreakdown, cashAnalysis, expenseBreakdown, customersSummary, customersRanking, productionSummary, recipeProfitability, loading, onPrint, isGeneratingPdf = false, fetchMoreTabData, activeTab, activeTabLabel, lowStockProducts = [], worstProducts = [], worstCategories = [], topByVolume = [], deliverySettlement = [],
}: ExportButtonProps) {
  const { exportExcelAll } = useExport();
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const [dropdownTarget, setDropdownTarget] = useState<'excel' | 'pdf' | null>(null);

  const isDropdownOpen = dropdownTarget !== null;

  const handleExcel = () => {
    setDropdownTarget('excel');
  };

  const handlePrint = () => {
    setDropdownTarget('pdf');
  };

  const closeDropdown = () => {
    setDropdownTarget(null);
  };

  const handleExportOption = async (target: 'excel' | 'pdf', scope: 'all' | 'current') => {
    closeDropdown();

    if (target === 'excel') {
      setIsExportingExcel(true);
      try {
        await fetchMoreTabData?.();
        await exportExcelAll(
          { summary, profitOverTime, topProducts, topCategories, paymentBreakdown, cashAnalysis, expenseBreakdown, customersSummary, customersRanking, productionSummary, recipeProfitability, lowStockProducts, worstProducts, worstCategories, topByVolume, deliverySettlement },
          scope === 'current' ? activeTab : undefined,
        );
      } finally {
        setIsExportingExcel(false);
      }
    } else {
      await fetchMoreTabData?.();
      onPrint(scope === 'all' ? 'all' : activeTab);
    }
  };

  const icon = dropdownTarget === 'excel' ? <Download size={14} /> : <Printer size={14} />;

  return (
    <div className="relative" tabIndex={-1} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closeDropdown(); }}>
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

      {isDropdownOpen && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-50 min-w-[200px] overflow-hidden">
          <button
            className="w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 flex items-center gap-2 transition-colors"
            onClick={() => handleExportOption(dropdownTarget, 'all')}
          >
            {icon}
            Exportar todo
          </button>
          <button
            className="w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100 transition-colors"
            onClick={() => handleExportOption(dropdownTarget, 'current')}
          >
            {icon}
            Exportar solo {activeTabLabel}
          </button>
        </div>
      )}
    </div>
  );
}
