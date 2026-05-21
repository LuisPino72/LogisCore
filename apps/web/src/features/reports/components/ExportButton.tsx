import { useState } from 'react';
import { Download, Printer, Loader2 } from 'lucide-react';
import { Button } from '@/common/components';
import { useExport } from '../hooks/useExport';
import type {
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
} from '../types';

interface ExportButtonProps {
  summary: ExecutiveSummaryData | null;
  profitOverTime: DailyProfitPoint[];
  topProducts: TopProductData[];
  paymentBreakdown: PaymentBreakdownData[];
  cashAnalysis: CashRegisterSummaryData[];
  loading: boolean;
  onPrint: () => void;
  isGeneratingPdf?: boolean;
}

export function ExportButton({
  summary, profitOverTime, topProducts, paymentBreakdown, cashAnalysis, loading, onPrint, isGeneratingPdf = false,
}: ExportButtonProps) {
  const { exportExcelAll } = useExport();
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleExcel = async () => {
    setIsExportingExcel(true);
    try {
      await exportExcelAll({ summary, profitOverTime, topProducts, paymentBreakdown, cashAnalysis });
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExcel} disabled={loading || isExportingExcel}>
        {isExportingExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        <span className="hidden sm:inline">{isExportingExcel ? 'Exportando...' : 'Excel'}</span>
      </Button>
      <Button variant="primary" size="sm" onClick={onPrint} disabled={loading || isGeneratingPdf}>
        {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
        <span className="hidden sm:inline">{isGeneratingPdf ? 'Generando...' : 'PDF'}</span>
      </Button>
    </div>
  );
}
