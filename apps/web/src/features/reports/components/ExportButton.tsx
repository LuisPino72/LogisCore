import { Download, Printer } from 'lucide-react';
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
  activeTab: string;
  summary: ExecutiveSummaryData | null;
  profitOverTime: DailyProfitPoint[];
  topProducts: TopProductData[];
  paymentBreakdown: PaymentBreakdownData[];
  cashAnalysis: CashRegisterSummaryData[];
  loading: boolean;
}

function formatBs(n: number): string {
  return n.toFixed(2);
}

export function ExportButton({
  activeTab, summary, profitOverTime, topProducts, paymentBreakdown, cashAnalysis, loading,
}: ExportButtonProps) {
  const { exportCsv, printReport } = useExport();

  const handleExportCsv = () => {
    if (loading) return;

    switch (activeTab) {
      case 'summary':
        if (!summary) return;
        exportCsv('resumen-ejecutivo', ['Métrica', 'Valor'], [
          ['Ventas Totales Bs', formatBs(summary.totalSalesBs)],
          ['Costo Total Bs', formatBs(summary.totalCostBs)],
          ['Ganancia Bruta Bs', formatBs(summary.grossProfitBs)],
          ['Margen %', `${summary.profitMarginPercent}%`],
          ['Transacciones', summary.totalTransactions],
          ['Ticket Promedio Bs', formatBs(summary.averageTicketBs)],
          ['IGTF Total Bs', formatBs(summary.totalIgtfBs)],
          ['Top Producto', summary.topProductName ?? 'N/A'],
          ...(summary.salesVsYesterdayPercent !== undefined
            ? [['Vs Ayer %', `${summary.salesVsYesterdayPercent}%`]]
            : []),
        ]);
        break;

      case 'profits':
        if (profitOverTime.length === 0) return;
        exportCsv('ganancias-en-el-tiempo', ['Fecha', 'Ventas Bs', 'Costo Bs', 'Ganancia Bs', 'Transacciones'],
          profitOverTime.map((p) => [p.label, formatBs(p.salesBs), formatBs(p.costBs), formatBs(p.profitBs), p.transactions]),
        );
        break;

      case 'products':
        if (topProducts.length === 0) return;
        exportCsv('top-productos', ['Producto', 'SKU', 'Vendidos', 'Ingreso Bs', 'Costo Bs', 'Ganancia Bs', 'Margen %'],
          topProducts.map((p) => [p.name, p.sku, p.quantitySold, formatBs(p.revenueBs), formatBs(p.costBs), formatBs(p.profitBs), `${p.marginPercent}%`]),
        );
        break;

      case 'payments':
        if (paymentBreakdown.length === 0) return;
        exportCsv('metodos-de-pago', ['Método', 'Transacciones', 'Total Bs', '%'],
          paymentBreakdown.map((p) => [p.label, p.count, formatBs(p.totalBs), `${p.percentage}%`]),
        );
        break;

      case 'cash':
        if (cashAnalysis.length === 0) return;
        exportCsv('analisis-de-caja', ['Caja', 'Apertura', 'Cierre', 'Esperado', 'Diferencia', 'Ventas', 'Estado'],
          cashAnalysis.map((r) => [
            r.registerId.slice(0, 8),
            r.closedAt ?? '',
            formatBs(r.openingBalanceBs),
            formatBs(r.closingBalanceBs ?? 0),
            formatBs(r.expectedClosingBs ?? 0),
            formatBs(r.differenceBs ?? 0),
            r.totalSalesCount.toString(),
            r.status === 'open' ? 'Abierta' : 'Cerrada',
          ]),
        );
        break;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={handleExportCsv} disabled={loading}>
        <Download size={16} />
        <span className="hidden sm:inline">CSV</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={printReport} disabled={loading}>
        <Printer size={16} />
        <span className="hidden sm:inline">PDF</span>
      </Button>
    </div>
  );
}
