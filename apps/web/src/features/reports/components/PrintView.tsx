import { forwardRef } from 'react';
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
import { formatBs, formatUsd } from '@/lib/formatBs';
import { displayQty } from '../../inventory/types';

function formatDual(bs: number, usd: number): string {
  return `${formatBs(bs)} / ${formatUsd(usd)}`;
}

interface PrintViewProps {
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
}

const printStyles = `
  .print-all-report {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: #1a1a1a;
    background: white;
    padding: 10mm;
    max-width: 100%;
    box-sizing: border-box;
  }

  .print-header {
    text-align: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 3px solid #0D9488;
  }

  .print-title {
    font-size: 20pt;
    font-weight: 800;
    margin: 0 0 4px;
    color: #111;
    letter-spacing: -0.02em;
  }

  .print-subtitle {
    font-size: 9pt;
    color: #555;
    margin: 0;
  }

  .print-section {
    margin-bottom: 20px;
    page-break-inside: avoid;
    break-inside: avoid;
    overflow: hidden;
  }

  .print-section-title {
    font-size: 12pt;
    font-weight: 700;
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #0D9488;
    color: #111;
  }

  .print-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .print-kpi {
    border: 1px solid #e0e0e0;
    padding: 10px 12px;
    border-radius: 6px;
    background: #fafafa;
  }

  .print-kpi-label {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #666;
    margin-bottom: 4px;
    font-weight: 600;
  }

  .print-kpi-value {
    font-size: 9pt;
    font-weight: 700;
    color: #111;
  }

  .print-kpi-subtitle {
    font-size: 7pt;
    color: #888;
    margin-top: 2px;
  }

  .print-table-wrap {
    overflow: visible;
  }

  .print-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7pt;
    table-layout: auto;
  }

  .print-table th {
    background: #0D9488;
    color: white;
    font-weight: 600;
    text-align: left;
    padding: 5px 6px;
    border: 1px solid #0F766E;
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .print-table td {
    padding: 4px 6px;
    border: 1px solid #d0d0d0;
    word-break: break-word;
    font-size: 7pt;
  }

  .print-table tr:nth-child(even) td {
    background: #f5f7fa;
  }

  .print-table tr:last-child td {
    border-bottom: 2px solid #0D9488;
  }

  .print-empty {
    color: #888;
    font-style: italic;
    padding: 16px;
    text-align: center;
    border: 1px dashed #ccc;
    border-radius: 6px;
  }

  .print-footer {
    text-align: center;
    margin-top: 28px;
    padding-top: 12px;
    border-top: 2px solid #e0e0e0;
    font-size: 7pt;
    color: #999;
  }
`;

export const PrintView = forwardRef<HTMLDivElement, PrintViewProps>(function PrintView(
  { summary, profitOverTime, topProducts, topCategories, paymentBreakdown, cashAnalysis, expenseBreakdown, customersSummary, customersRanking, productionSummary, recipeProfitability },
  ref,
) {
  const reportDate = new Date().toLocaleDateString('es-VE', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div ref={ref} className="print-all-report">
      <style>{printStyles}</style>

      <div className="print-header">
        <h1 className="print-title">Sasa ERP</h1>
        <p className="print-subtitle">Reporte de Gestión — {reportDate}</p>
      </div>

      {/* Resumen Ejecutivo */}
      <div className="print-section">
        <h2 className="print-section-title">Resumen Ejecutivo</h2>
        {summary ? (
          <div className="print-kpi-grid">
            <KpiCard label="Ventas Totales" value={formatDual(summary.totalSalesBs, summary.totalSalesUsd)} subtitle={`${summary.totalTransactions} transacciones`} />
            <KpiCard label="Ganancia Bruta" value={formatDual(summary.grossProfitBs, summary.grossProfitUsd)} subtitle={`Margen ${summary.profitMarginPercent}%`} />
            <KpiCard label="Gasto Total" value={formatDual(summary.totalCostBs + summary.totalExpensesBs, summary.totalCostUsd + summary.totalExpensesUsd)} subtitle={`Costo compras ${formatUsd(summary.totalCostUsd)} + Gastos ${formatUsd(summary.totalExpensesUsd)}`} />
            <KpiCard label="Ticket Promedio" value={formatDual(summary.averageTicketBs, summary.averageTicketUsd)} />
            {summary.topProductName && <KpiCard label="Top Producto" value={summary.topProductName} />}
            {summary.salesVsYesterdayPercent !== undefined && (
              <KpiCard label="Vs Ayer" value={`${summary.salesVsYesterdayPercent}%`} />
            )}
          </div>
        ) : (
          <div className="print-empty">Sin datos de resumen</div>
        )}
      </div>

      {/* Ganancias en el Tiempo */}
      {profitOverTime.length > 0 && (
        <div className="print-section">
          <h2 className="print-section-title">Ganancias en el Tiempo</h2>
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tasa</th>
                  <th>Ventas Bs</th>
                  <th>Ventas $</th>
                  <th>Gasto Bs</th>
                  <th>Gasto $</th>
                  <th>Ganancia Bs</th>
                  <th>Ganancia $</th>
                  <th>Transacciones</th>
                </tr>
              </thead>
              <tbody>
                {profitOverTime.map((p, i) => (
                  <tr key={i}>
                    <td>{p.label}</td>
                    <td>{p.lastRate.toFixed(4)}</td>
                    <td>{formatBs(p.salesBs)}</td>
                    <td>{formatUsd(p.salesUsd)}</td>
                    <td>{formatBs(p.costBs)}</td>
                    <td>{formatUsd(p.costUsd)}</td>
                    <td>{formatBs(p.profitBs)}</td>
                    <td>{formatUsd(p.profitUsd)}</td>
                    <td>{p.transactions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Productos */}
      {topProducts.length > 0 && (
        <div className="print-section">
          <h2 className="print-section-title">Top Productos por Ganancia</h2>
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Vendidos</th>
                  <th>Ingreso Bs</th>
                  <th>Ingreso $</th>
                  <th>Gasto Bs</th>
                  <th>Gasto $</th>
                  <th>Ganancia Bs</th>
                  <th>Ganancia $</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td>{p.quantitySold}</td>
                    <td>{formatBs(p.revenueBs)}</td>
                    <td>{formatUsd(p.revenueUsd)}</td>
                    <td>{formatBs(p.costBs)}</td>
                    <td>{formatUsd(p.costUsd)}</td>
                    <td>{formatBs(p.profitBs)}</td>
                    <td>{formatUsd(p.profitUsd)}</td>
                    <td>{p.marginPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Categorías */}
      {topCategories.length > 0 && (
        <div className="print-section">
          <h2 className="print-section-title">Top Categorías por Ganancia</h2>
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Productos</th>
                  <th>Vendidos</th>
                  <th>Ingreso Bs</th>
                  <th>Ingreso $</th>
                  <th>Gasto Bs</th>
                  <th>Gasto $</th>
                  <th>Ganancia Bs</th>
                  <th>Ganancia $</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {topCategories.map((c, i) => (
                  <tr key={i}>
                    <td>{c.categoryName}</td>
                    <td>{c.productCount}</td>
                    <td>{c.quantitySold}</td>
                    <td>{formatBs(c.revenueBs)}</td>
                    <td>{formatUsd(c.revenueUsd)}</td>
                    <td>{formatBs(c.costBs)}</td>
                    <td>{formatUsd(c.costUsd)}</td>
                    <td>{formatBs(c.profitBs)}</td>
                    <td>{formatUsd(c.profitUsd)}</td>
                    <td>{c.marginPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Métodos de Pago */}
      {paymentBreakdown.length > 0 && (
        <div className="print-section">
          <h2 className="print-section-title">Métodos de Pago</h2>
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Transacciones</th>
                  <th>Total Bs</th>
                  <th>Total $</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {paymentBreakdown.map((p, i) => (
                  <tr key={i}>
                    <td>{p.label}</td>
                    <td>{p.count}</td>
                    <td>{formatBs(p.totalBs)}</td>
                    <td>{formatUsd(p.totalUsd)}</td>
                    <td>{p.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Desglose de Gastos */}
      {expenseBreakdown.length > 0 && (
        <div className="print-section">
          <h2 className="print-section-title">Desglose de Gastos</h2>
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Tipo de Gasto</th>
                  <th>Monto Bs</th>
                  <th>Monto $</th>
                  <th>% del Total</th>
                </tr>
              </thead>
              <tbody>
                {expenseBreakdown.map((e, i) => {
                  const totalBs = expenseBreakdown.reduce((s, x) => s + x.amountBs, 0);
                  const pctBs = totalBs > 0 ? ((e.amountBs / totalBs) * 100).toFixed(1) : '0';
                  return (
                    <tr key={i}>
                      <td>{e.label}</td>
                      <td>{formatBs(e.amountBs)}</td>
                      <td>{formatUsd(e.amountUsd)}</td>
                      <td>{pctBs}%</td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 700, borderTop: '2px solid #0D9488' }}>
                  <td>TOTAL</td>
                  <td>{formatBs(expenseBreakdown.reduce((s, e) => s + e.amountBs, 0))}</td>
                  <td>{formatUsd(expenseBreakdown.reduce((s, e) => s + e.amountUsd, 0))}</td>
                  <td>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Análisis de Caja */}
      {cashAnalysis.length > 0 && (
        <div className="print-section">
          <h2 className="print-section-title">Análisis de Caja</h2>
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Caja</th>
                  <th>Apertura Bs</th>
                  <th>Apertura $</th>
                  <th>Ventas Bs</th>
                  <th>Ventas $</th>
                  <th>Esperado Bs</th>
                  <th>Esperado $</th>
                </tr>
              </thead>
              <tbody>
                {cashAnalysis.map((r, i) => (
                  <tr key={`${i}-a`}>
                    <td style={{ fontWeight: 600 }}>{new Date(r.openedAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}</td>
                    <td>{formatBs(r.openingBalanceBs)}</td>
                    <td>{formatUsd(r.openingBalanceUsd)}</td>
                    <td>{formatBs(r.totalSalesBs)}</td>
                    <td>{formatUsd(r.totalSalesUsd)}</td>
                    <td>{r.expectedClosingBs !== undefined ? formatBs(r.expectedClosingBs) : '-'}</td>
                    <td>{r.expectedClosingUsd !== undefined ? formatUsd(r.expectedClosingUsd) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="print-table-wrap" style={{ marginTop: -1 }}>
            <table className="print-table">
              <thead>
                <tr>
                  <th>Caja</th>
                  <th>Cierre Bs</th>
                  <th>Cierre $</th>
                  <th>Diferencia Bs</th>
                  <th>Diferencia $</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cashAnalysis.map((r, i) => (
                  <tr key={`${i}-b`}>
                    <td style={{ fontWeight: 600 }}>{new Date(r.openedAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}</td>
                    <td>{r.closingBalanceBs !== undefined ? formatBs(r.closingBalanceBs) : '-'}</td>
                    <td>{r.closingBalanceUsd !== undefined ? formatUsd(r.closingBalanceUsd) : '-'}</td>
                    <td>{r.differenceBs !== undefined ? formatBs(r.differenceBs) : '-'}</td>
                    <td>{r.differenceUsd !== undefined ? formatUsd(r.differenceUsd) : '-'}</td>
                    <td>{r.status === 'open' ? 'Abierta' : 'Cerrada'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Clientes */}
      {customersRanking.length > 0 && (
        <div className="print-section">
          <h2 className="print-section-title">Ranking de Clientes</h2>
          {customersSummary && (
            <div className="print-kpi-grid" style={{ marginBottom: 12 }}>
              <KpiCard label="Total Clientes" value={String(customersSummary.totalCustomers)} />
              <KpiCard label="Activos (30d)" value={String(customersSummary.activeCustomers)} />
              <KpiCard label="Retención" value={`${customersSummary.retentionRate}%`} />
              <KpiCard label="Ticket Promedio" value={formatDual(customersSummary.averageTicketBs, customersSummary.averageTicketUsd)} />
            </div>
          )}
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Cédula</th>
                  <th>Compras</th>
                  <th>Total Gastado Bs</th>
                  <th>Total Gastado $</th>
                  <th>Ticket Prom $</th>
                  <th>&Uacute;ltima Compra</th>
                </tr>
              </thead>
              <tbody>
                {customersRanking.map((c, i) => (
                  <tr key={i}>
                    <td>{c.customerName}</td>
                    <td>{c.cedula ?? 'N/A'}</td>
                    <td>{c.purchaseCount}</td>
                    <td>{formatBs(c.totalSpentBs)}</td>
                    <td>{formatUsd(c.totalSpentUsd)}</td>
                    <td>{formatUsd(c.averageTicketUsd)}</td>
                    <td>{c.lastPurchaseAt ? new Date(c.lastPurchaseAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Producción */}
      {recipeProfitability.length > 0 && (
        <div className="print-section">
          <h2 className="print-section-title">Producción — Rentabilidad de Recetas</h2>
          {productionSummary && (
            <div className="print-kpi-grid" style={{ marginBottom: 12 }}>
              <KpiCard label="Recetas Activas" value={String(productionSummary.activeRecipes)} />
              <KpiCard label="Órdenes" value={String(productionSummary.totalOrders)} />
              <KpiCard label="Unidades Producidas" value={String(productionSummary.totalQuantityProduced)} />
              <KpiCard label="Merma Promedio" value={`${productionSummary.averageWastePct}%`} />
              <KpiCard label="Costo Ingredientes" value={formatDual(productionSummary.totalIngredientCostBs, productionSummary.totalIngredientCostUsd)} />
              {productionSummary.mostProducedRecipe && (
                <KpiCard label="Más Producida" value={productionSummary.mostProducedRecipe} subtitle={displayQty(productionSummary.mostProducedQuantity ?? 0, 'unidad')} />
              )}
            </div>
          )}
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Receta</th>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Veces Producida</th>
                  <th>Costo/Unidad $</th>
                  <th>Merma %</th>
                  <th>Unidades</th>
                </tr>
              </thead>
              <tbody>
                {recipeProfitability.map((r, i) => (
                  <tr key={i}>
                    <td>{r.recipeName}</td>
                    <td>{r.productName}</td>
                    <td>{r.mode === 'batch' ? 'Lotes' : 'Ensamblaje'}</td>
                    <td>{r.timesProduced}</td>
                    <td>{formatUsd(r.costPerUnitUsd)}</td>
                    <td>{r.wastePct}%</td>
                    <td>{r.totalQuantityProduced}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="print-footer">
        Sasa ERP — Reporte generado automáticamente el {reportDate}
      </div>
    </div>
  );
});

function KpiCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="print-kpi">
      <div className="print-kpi-label">{label}</div>
      <div className="print-kpi-value">{value}</div>
      {subtitle && <div className="print-kpi-subtitle">{subtitle}</div>}
    </div>
  );
}
