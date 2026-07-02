import { useCallback } from 'react';
import type { Workbook } from 'exceljs';
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

interface ExportAllData {
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
  lowStockProducts?: { productId: string; name: string; sku: string; stock: number; minStock: number; categoryName?: string }[];
  worstProducts?: TopProductData[];
  worstCategories?: TopCategoryData[];
  topByVolume?: TopProductData[];
  deliverySettlement?: { name: string; deliveryCount: number; totalFees: number; paidAmount: number; pendingAmount: number }[];
}

interface SheetConfig {
  name: string;
  headers: string[];
  rows: (string | number | undefined | null)[][];
  colWidths: number[];
}

function addSheet(wb: Workbook, { name, headers, rows, colWidths }: SheetConfig): void {
  const ws = wb.addWorksheet(name);

  ws.columns = headers.map((h, i) => ({
    header: h,
    key: String(i),
    width: colWidths[i] || 12,
  }));

  rows.forEach((rowData) => {
    ws.addRow(rowData.map((v) => v ?? ''));
  });

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { horizontal: 'center' };
    });
  });
}

function getSheetsForTab(tab: string): string[] {
  const map: Record<string, string[]> = {
    summary: ['Resumen', 'Gastos', 'Caja'],
    profits: ['Ganancias'],
    products: ['Productos', 'Categorías', 'Pagos'],
    cash: ['Caja'],
    more: ['Clientes', 'Producción', 'Stock Bajo'],
    delivery: ['Liquidación Delivery'],
  };
  return map[tab] ?? [];
}

function buildSheets(data: ExportAllData): SheetConfig[] {
  const sheets: SheetConfig[] = [];

  sheets.push(buildSummarySheet(data.summary));
  sheets.push(buildProfitSheet(data.profitOverTime));
  sheets.push(buildProductsSheet(data.topProducts));
  sheets.push(buildCategoriesSheet(data.topCategories));
  sheets.push(buildPaymentsSheet(data.paymentBreakdown));
  sheets.push(buildExpensesSheet(data.expenseBreakdown));
  sheets.push(buildCashSheet(data.cashAnalysis));
  sheets.push(buildCustomersSheet(data.customersSummary, data.customersRanking));
  sheets.push(buildProductionSheet(data.productionSummary, data.recipeProfitability));

  if (data.lowStockProducts && data.lowStockProducts.length > 0) {
    sheets.push(buildLowStockSheet(data.lowStockProducts));
  }
  if ((data.worstProducts && data.worstProducts.length > 0) || (data.worstCategories && data.worstCategories.length > 0) || (data.topByVolume && data.topByVolume.length > 0)) {
    sheets.push(buildInsightsSheet(data.worstProducts, data.worstCategories, data.topByVolume));
  }
  if (data.deliverySettlement && data.deliverySettlement.length > 0) {
    sheets.push(buildDeliverySheet(data.deliverySettlement));
  }

  return sheets;
}

function buildSummarySheet(summary: ExecutiveSummaryData | null): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];
  if (summary) {
    rows.push(
      ['Ventas Totales', formatBs(summary.totalSalesBs), formatUsd(summary.totalSalesUsd)],
      ['Costo de Compras', formatBs(summary.totalCostBs), formatUsd(summary.totalCostUsd)],
      ['Ganancia Bruta', formatBs(summary.grossProfitBs), formatUsd(summary.grossProfitUsd)],
      ['Margen %', '', `${summary.profitMarginPercent}%`],
      ['Transacciones', '', summary.totalTransactions],
      ['Ticket Promedio', formatBs(summary.averageTicketBs), formatUsd(summary.averageTicketUsd)],
      ['Gastos de Consumo', formatBs(summary.nonSellableExpensesBs), formatUsd(summary.nonSellableExpensesUsd)],
      ['Pérdidas por Ajustes', formatBs(summary.adjustmentLossExpenses.totalBs), formatUsd(summary.adjustmentLossExpenses.totalUsd)],
      ['- Pérdida', '', `${formatUsd(summary.adjustmentLossExpenses.perdida.totalUsd)} (${summary.adjustmentLossExpenses.perdida.count})`],
      ['- Robo', '', `${formatUsd(summary.adjustmentLossExpenses.robo.totalUsd)} (${summary.adjustmentLossExpenses.robo.count})`],
      ['- Vencido', '', `${formatUsd(summary.adjustmentLossExpenses.vencido.totalUsd)} (${summary.adjustmentLossExpenses.vencido.count})`],
      ['- Consumo Interno', '', `${formatUsd(summary.adjustmentLossExpenses.consumo_interno.totalUsd)} (${summary.adjustmentLossExpenses.consumo_interno.count})`],
      ['- Otros', '', `${formatUsd(summary.adjustmentLossExpenses.otros.totalUsd)} (${summary.adjustmentLossExpenses.otros.count})`],
      ['Gastos Totales', formatBs(summary.totalExpensesBs), formatUsd(summary.totalExpensesUsd)],
      ['Ganancia Neta', formatBs(summary.netProfitBs), formatUsd(summary.netProfitUsd)],
      ['Top Producto', '', summary.topProductName ?? 'N/A'],
      ['IGTF Total', '', formatUsd(summary.igtfTotal)],
      ['IVA Total', formatBs(summary.totalIvaBs), formatUsd(summary.totalIvaUsd)],
      ['Descuentos', formatBs(summary.totalDiscountBs), formatUsd(summary.totalDiscountUsd)],
      ['Crédito Pendiente', '', formatUsd(summary.pendingCreditUsd)],
      ['Crédito Cobrado', '', formatUsd(summary.collectedCreditUsd)],
    );
    if (summary.salesVsYesterdayPercent !== undefined) {
      rows.push(['Vs Ayer %', '', `${summary.salesVsYesterdayPercent}%`]);
    }
  }
  return { name: 'Resumen', headers: ['Métrica', 'Bs', 'USD'], rows, colWidths: [28, 18, 18] };
}

function buildProfitSheet(profitOverTime: DailyProfitPoint[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];
  profitOverTime.forEach((p) => {
    rows.push([
      p.label,
      p.lastRate.toFixed(4),
      formatBs(p.salesBs),
      formatUsd(p.salesUsd),
      formatBs(p.costBs),
      formatUsd(p.costUsd),
      formatBs(p.profitBs),
      formatUsd(p.profitUsd),
    p.transactions,
  ]);
  });
  // Datos para gráfico (chart-ready)
  if (profitOverTime.length > 0) {
    rows.push(['', '', '', '', '', '', '', '', '']);
    rows.push(['--- DATOS PARA GRÁFICO DE GANANCIAS ---', '', '', '', '', '', '', '', '']);
    rows.push(['Fecha', '', 'Ventas $', '', '', 'Gasto $', '', 'Ganancia $', '']);
    profitOverTime.forEach((p) => {
      rows.push([p.label, '', formatUsd(p.salesUsd), '', '', formatUsd(p.costUsd), '', formatUsd(p.profitUsd), '']);
    });
  }
  return { name: 'Ganancias', headers: ['Fecha', 'Tasa', 'Ventas Bs', 'Ventas $', 'Gasto Bs', 'Gasto $', 'Ganancia Bs', 'Ganancia $', 'Transacciones'], rows, colWidths: [16, 10, 16, 12, 16, 12, 16, 12, 14] };
}

function buildProductsSheet(topProducts: TopProductData[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];
  topProducts.forEach((p) => {
    rows.push([
      p.name,
      p.quantitySold,
      formatBs(p.revenueBs),
      formatUsd(p.revenueUsd),
      formatBs(p.costBs),
      formatUsd(p.costUsd),
      formatBs(p.profitBs),
      formatUsd(p.profitUsd),
      `${p.marginPercent}%`,
    ]);
  });
  // Datos para gráfico (chart-ready)
  if (topProducts.length > 0) {
    rows.push(['', '', '', '', '', '', '', '', '']);
    rows.push(['--- DATOS PARA GRÁFICO DE PRODUCTOS ---', '', '', '', '', '', '', '', '']);
    rows.push(['Producto', '', '', 'Ganancia $', '', '', '', '', '']);
    topProducts.slice(0, 10).forEach((p) => {
      rows.push([p.name, '', '', p.profitUsd, '', '', '', '', '']);
    });
  }
  return { name: 'Productos', headers: ['Producto', 'Vendidos', 'Ingreso Bs', 'Ingreso $', 'Gasto Bs', 'Gasto $', 'Ganancia Bs', 'Ganancia $', 'Margen %'], rows, colWidths: [30, 10, 16, 12, 16, 12, 16, 12, 10] };
}

function buildCategoriesSheet(topCategories: TopCategoryData[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];
  topCategories.forEach((c) => {
    rows.push([
      c.categoryName,
      c.productCount,
      c.quantitySold,
      formatBs(c.revenueBs),
      formatUsd(c.revenueUsd),
      formatBs(c.costBs),
      formatUsd(c.costUsd),
      formatBs(c.profitBs),
      formatUsd(c.profitUsd),
      `${c.marginPercent}%`,
    ]);
  });
  return { name: 'Categorías', headers: ['Categoría', 'Productos', 'Vendidos', 'Ingreso Bs', 'Ingreso $', 'Gasto Bs', 'Gasto $', 'Ganancia Bs', 'Ganancia $', 'Margen %'], rows, colWidths: [25, 10, 10, 16, 12, 16, 12, 16, 12, 10] };
}

function buildExpensesSheet(expenseBreakdown: ExpenseBreakdownItem[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];
  const totalBs = expenseBreakdown.reduce((s, e) => s + e.amountBs, 0);
  const totalUsd = expenseBreakdown.reduce((s, e) => s + e.amountUsd, 0);

  expenseBreakdown.forEach((e) => {
    const pctBs = totalBs > 0 ? ((e.amountBs / totalBs) * 100).toFixed(1) : '0';
    rows.push([
      e.label,
      formatBs(e.amountBs),
      formatUsd(e.amountUsd),
      `${pctBs}%`,
    ]);
  });

  rows.push(['', '', '', '']);
  rows.push(['TOTAL', formatBs(totalBs), formatUsd(totalUsd), '100%']);

  // Datos para gráfico (chart-ready)
  if (expenseBreakdown.length > 0) {
    rows.push(['', '', '', '']);
    rows.push(['--- DATOS PARA GRÁFICO DE GASTOS ---', '', '', '']);
    rows.push(['Tipo de Gasto', 'Monto $', '', '']);
    expenseBreakdown.forEach((e) => {
      rows.push([e.label, e.amountUsd, '', '']);
    });
  }

  return { name: 'Gastos', headers: ['Tipo de Gasto', 'Monto Bs', 'Monto $', '% del Total'], rows, colWidths: [30, 18, 14, 12] };
}

function buildPaymentsSheet(paymentBreakdown: PaymentBreakdownData[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];
  paymentBreakdown.forEach((p) => {
    rows.push([p.label, p.count, formatBs(p.totalBs), formatUsd(p.totalUsd), `${p.percentage}%`]);
  });
  // Datos para gráfico (chart-ready)
  if (paymentBreakdown.length > 0) {
    rows.push(['', '', '', '', '']);
    rows.push(['--- DATOS PARA GRÁFICO DE PAGOS ---', '', '', '', '']);
    rows.push(['Método', 'Total $', '', '', '']);
    paymentBreakdown.forEach((p) => {
      rows.push([p.label, p.totalUsd, '', '', '']);
    });
  }
  return { name: 'Pagos', headers: ['Método', 'Transacciones', 'Total Bs', 'Total $', '%'], rows, colWidths: [20, 14, 16, 12, 10] };
}

function buildCashSheet(cashAnalysis: CashRegisterSummaryData[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];
  cashAnalysis.forEach((r) => {
    rows.push([
      r.registerName ?? new Date(r.openedAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }),
      r.operatorName ?? '',
      formatBs(r.openingBalanceBs),
      formatUsd(r.openingBalanceUsd),
      formatBs(r.totalSalesBs),
      formatUsd(r.totalSalesUsd),
      r.expectedClosingBs !== undefined ? formatBs(r.expectedClosingBs) : '',
      r.expectedClosingUsd !== undefined ? formatUsd(r.expectedClosingUsd) : '',
      r.closingBalanceBs !== undefined ? formatBs(r.closingBalanceBs) : '',
      r.closingBalanceUsd !== undefined ? formatUsd(r.closingBalanceUsd) : '',
      r.differenceBs !== undefined ? formatBs(r.differenceBs) : '',
      r.differenceUsd !== undefined ? formatUsd(r.differenceUsd) : '',
      r.status === 'open' ? 'Abierta' : 'Cerrada',
    ]);
  });
  return { name: 'Caja', headers: ['Caja', 'Operador', 'Apertura Bs', 'Apertura $', 'Ventas Bs', 'Ventas $', 'Esperado Bs', 'Esperado $', 'Cierre Bs', 'Cierre $', 'Diferencia Bs', 'Diferencia $', 'Estado'], rows, colWidths: [18, 20, 16, 12, 16, 12, 16, 12, 16, 12, 16, 12, 10] };
}

function buildCustomersSheet(summary: CustomersSummaryData | null, ranking: CustomerRankingItem[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];

  if (summary) {
    rows.push(
      ['--- RESUMEN ---', '', '', '', '', '', ''],
      ['Total Clientes', summary.totalCustomers, '', '', '', '', ''],
      ['Activos (30d)', summary.activeCustomers, '', '', '', '', ''],
      ['Tasa Retención %', `${summary.retentionRate}%`, '', '', '', '', ''],
      ['Ticket Promedio', formatBs(summary.averageTicketBs), formatUsd(summary.averageTicketUsd), '', '', '', ''],
      ['Top Cliente', summary.topCustomerName ?? 'N/A', formatUsd(summary.topCustomerSpentUsd ?? 0), '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['--- RANKING ---', '', '', '', '', '', ''],
    );
  }

  ranking.forEach((c) => {
    rows.push([
      c.customerName,
      c.cedula ?? 'N/A',
      c.purchaseCount,
      formatBs(c.totalSpentBs),
      formatUsd(c.totalSpentUsd),
      formatUsd(c.averageTicketUsd),
      c.lastPurchaseAt
        ? new Date(c.lastPurchaseAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'N/A',
    ]);
  });

  return {
    name: 'Clientes',
    headers: ['Nombre', 'Cédula', 'Compras', 'Total Gastado Bs', 'Total Gastado $', 'Ticket Prom $', 'Última Compra'],
    rows,
    colWidths: [25, 14, 10, 18, 14, 14, 14],
  };
}

function buildProductionSheet(summary: ProductionSummaryData | null, profitability: RecipeProfitabilityItem[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];

  if (summary) {
    rows.push(
      ['--- RESUMEN ---', '', '', '', '', '', ''],
      ['Recetas Activas', summary.activeRecipes, '', '', '', '', ''],
      ['Órdenes Totales', summary.totalOrders, '', '', '', '', ''],
      ['Unidades Producidas', summary.totalQuantityProduced, '', '', '', '', ''],
      ['Merma Promedio %', `${summary.averageWastePct}%`, '', '', '', '', ''],
      ['Costo Total Ingredientes', formatBs(summary.totalIngredientCostBs), formatUsd(summary.totalIngredientCostUsd), '', '', '', ''],
      ['Más Producida', summary.mostProducedRecipe ?? 'N/A', summary.mostProducedQuantity ? displayQty(summary.mostProducedQuantity, 'unidad') : '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['--- RANKING RECETAS ---', '', '', '', '', '', ''],
    );
  }

  profitability.forEach((r) => {
    rows.push([
      r.recipeName,
      r.productName,
      r.mode === 'batch' ? 'Lotes' : 'Ensamblaje',
      r.timesProduced,
      formatUsd(r.costPerUnitUsd),
      `${r.wastePct}%`,
      r.totalQuantityProduced,
    ]);
  });

  return {
    name: 'Producción',
    headers: ['Receta', 'Producto', 'Tipo', 'Veces Producida', 'Costo/Unidad $', 'Merma %', 'Unidades Totales'],
    rows,
    colWidths: [25, 25, 14, 16, 14, 10, 14],
  };
}

function buildLowStockSheet(products: { productId: string; name: string; sku: string; stock: number; minStock: number; categoryName?: string }[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];
  products.forEach((p) => {
    rows.push([p.name, p.sku, p.stock, p.minStock, p.categoryName ?? '']);
  });
  return {
    name: 'Stock Bajo',
    headers: ['Producto', 'SKU', 'Stock Actual', 'Stock Mínimo', 'Categoría'],
    rows,
    colWidths: [30, 16, 14, 14, 20],
  };
}

function buildInsightsSheet(
  worstProducts?: TopProductData[],
  worstCategories?: TopCategoryData[],
  topByVolume?: TopProductData[],
): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];

  if (worstProducts && worstProducts.length > 0) {
    rows.push(['--- PEORES PRODUCTOS (menor ganancia) ---', '', '', '']);
    worstProducts.forEach((p) => {
      rows.push([p.name, `${formatUsd(p.profitUsd)}`, `${p.quantitySold} vendidos`, `${p.marginPercent}% margen`]);
    });
    rows.push(['', '', '', '']);
  }

  if (worstCategories && worstCategories.length > 0) {
    rows.push(['--- PEORES CATEGORÍAS (menor ganancia) ---', '', '', '']);
    worstCategories.forEach((c) => {
      rows.push([c.categoryName, `${formatUsd(c.profitUsd)}`, `${c.quantitySold} vendidos`, `${c.marginPercent}% margen`]);
    });
    rows.push(['', '', '', '']);
  }

  if (topByVolume && topByVolume.length > 0) {
    rows.push(['--- TOP POR VOLUMEN (más vendidos) ---', '', '', '']);
    topByVolume.forEach((p) => {
      rows.push([p.name, `${p.quantitySold} vendidos`, `${formatUsd(p.revenueUsd)} ingreso`, `${formatUsd(p.profitUsd)} ganancia`]);
    });
  }

  return {
    name: 'Insights',
    headers: ['Nombre', 'Métrica 1', 'Métrica 2', 'Métrica 3'],
    rows,
    colWidths: [30, 22, 22, 22],
  };
}

function buildDeliverySheet(settlements: { name: string; deliveryCount: number; totalFees: number; paidAmount: number; pendingAmount: number }[]): SheetConfig {
  const rows: (string | number | undefined | null)[][] = [];
  settlements.forEach((s) => {
    rows.push([s.name, s.deliveryCount, formatUsd(s.totalFees), formatUsd(s.paidAmount), formatUsd(s.pendingAmount)]);
  });
  return {
    name: 'Liquidación Delivery',
    headers: ['Motorizado', 'Entregas', 'Tarifas $', 'Pagado $', 'Pendiente $'],
    rows,
    colWidths: [25, 12, 14, 14, 14],
  };
}

export function useExport() {
  const exportExcelAll = useCallback(async (data: ExportAllData, scope?: string) => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    let sheets = buildSheets(data);

    if (scope && scope !== 'all') {
      const allowed = getSheetsForTab(scope);
      sheets = sheets.filter((s) => allowed.includes(s.name));
    }

    for (const sheet of sheets) {
      addSheet(wb, sheet);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const scopeLabel = scope && scope !== 'all' ? ({ summary: 'Resumen', profits: 'Ganancias', products: 'Productos', cash: 'Caja', more: 'Mas', delivery: 'Liquidacion' })[scope] ?? scope : '';
    const suffix = scopeLabel ? `-${scopeLabel}` : '';
    a.download = `Sasa-Reporte${suffix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return { exportExcelAll };
}
