import type {
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
} from '../types';
import { formatBs } from '@/lib/formatBs';

interface PrintViewProps {
  summary: ExecutiveSummaryData | null;
  profitOverTime: DailyProfitPoint[];
  topProducts: TopProductData[];
  paymentBreakdown: PaymentBreakdownData[];
  cashAnalysis: CashRegisterSummaryData[];
}

function Table({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number | undefined | null)[][] }) {
  return (
    <div className="print-section" style={{ breakInside: 'avoid', marginBottom: 24, pageBreakInside: 'avoid' }}>
      <h2 className="print-section-title">{title}</h2>
      <table className="print-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell ?? '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiRow({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="print-kpi">
      <div className="print-kpi-label">{label}</div>
      <div className="print-kpi-value">{value}</div>
      {subtitle && <div className="print-kpi-subtitle">{subtitle}</div>}
    </div>
  );
}

export function PrintView({ summary, profitOverTime, topProducts, paymentBreakdown, cashAnalysis }: PrintViewProps) {
  const reportDate = new Date().toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="print-all-report">
      <div className="print-header">
        <h1 className="print-title">LogisCore - Reporte</h1>
        <p className="print-date">Generado el {reportDate}</p>
      </div>

      {/* Section 1: Resumen Ejecutivo */}
      <div className="print-section" style={{ breakInside: 'avoid', marginBottom: 24, pageBreakInside: 'avoid' }}>
        <h2 className="print-section-title">Resumen Ejecutivo</h2>
        {summary ? (
          <div className="print-kpi-grid">
            <KpiRow label="Ventas Totales" value={formatBs(summary.totalSalesBs)} subtitle={`${summary.totalTransactions} transacciones`} />
            <KpiRow label="Ganancia Bruta" value={formatBs(summary.grossProfitBs)} subtitle={`Margen ${summary.profitMarginPercent}%`} />
            <KpiRow label="Costo Total" value={formatBs(summary.totalCostBs)} />
            <KpiRow label="Ticket Promedio" value={formatBs(summary.averageTicketBs)} />
            <KpiRow label="IGTF Total" value={formatBs(summary.totalIgtfBs)} />
            <KpiRow label="Gastos de Consumo" value={`${formatBs(summary.nonSellableExpensesBs)} / USD ${summary.nonSellableExpensesUsd.toFixed(2)}`} />
            {summary.topProductName && <KpiRow label="Top Producto" value={summary.topProductName} />}
            {summary.salesVsYesterdayPercent !== undefined && (
              <KpiRow label="Vs Ayer" value={`${summary.salesVsYesterdayPercent}%`} />
            )}
          </div>
        ) : (
          <p style={{ color: '#666', fontStyle: 'italic' }}>Sin datos de resumen</p>
        )}
      </div>

      {/* Section 2: Ganancias */}
      {profitOverTime.length > 0 && (
        <Table
          title="Ganancias en el Tiempo"
          headers={['Fecha', 'Ventas Bs', 'Costo Bs', 'Ganancia Bs', 'Transacciones']}
          rows={profitOverTime.map((p) => [p.label, formatBs(p.salesBs), formatBs(p.costBs), formatBs(p.profitBs), p.transactions])}
        />
      )}

      {/* Section 3: Top Productos */}
      {topProducts.length > 0 && (
        <Table
          title="Top Productos por Ganancia"
          headers={['Producto', 'SKU', 'Vendidos', 'Ingreso Bs', 'Costo Bs', 'Ganancia Bs', 'Margen %']}
          rows={topProducts.map((p) => [p.name, p.sku, p.quantitySold, formatBs(p.revenueBs), formatBs(p.costBs), formatBs(p.profitBs), `${p.marginPercent}%`])}
        />
      )}

      {/* Section 4: Métodos de Pago */}
      {paymentBreakdown.length > 0 && (
        <Table
          title="Métodos de Pago"
          headers={['Método', 'Transacciones', 'Total Bs', '%']}
          rows={paymentBreakdown.map((p) => [p.label, p.count, formatBs(p.totalBs), `${p.percentage}%`])}
        />
      )}

      {/* Section 5: Caja */}
      {cashAnalysis.length > 0 && (
        <Table
          title="Análisis de Caja"
          headers={['Caja', 'Apertura Bs', 'Ventas Bs', 'IGTF Bs', 'Esperado Bs', 'Cierre Bs', 'Diferencia Bs', 'Estado']}
          rows={cashAnalysis.map((r) => [
            r.registerId.slice(0, 8),
            formatBs(r.openingBalanceBs),
            formatBs(r.totalSalesBs),
            formatBs(r.totalIgtfBs),
            r.expectedClosingBs !== undefined ? formatBs(r.expectedClosingBs) : '-',
            r.closingBalanceBs !== undefined ? formatBs(r.closingBalanceBs) : '-',
            r.differenceBs !== undefined ? formatBs(r.differenceBs) : '-',
            r.status === 'open' ? 'Abierta' : 'Cerrada',
          ])}
        />
      )}

      <div className="print-footer">
        <p>LogisCore ERP &mdash; Reporte generado automáticamente</p>
      </div>
    </div>
  );
}
