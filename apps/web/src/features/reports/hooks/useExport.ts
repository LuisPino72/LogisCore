import { useCallback } from 'react';
import * as XLSX from 'xlsx';
import type {
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
} from '../types';
import { formatBs } from '@/lib/formatBs';

function escCsv(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '""';
  const str = String(s);
  return `"${str.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: (string | number | undefined | null)[][]): string {
  const headerLine = headers.map(escCsv).join(',');
  const dataLines = rows.map((r) => r.map(escCsv).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface ExportAllData {
  summary: ExecutiveSummaryData | null;
  profitOverTime: DailyProfitPoint[];
  topProducts: TopProductData[];
  paymentBreakdown: PaymentBreakdownData[];
  cashAnalysis: CashRegisterSummaryData[];
}

function buildSummarySheet(summary: ExecutiveSummaryData | null): XLSX.WorkSheet {
  const rows: (string | number | undefined)[][] = [['Métrica', 'Valor']];
  if (summary) {
    rows.push(
      ['Ventas Totales Bs', formatBs(summary.totalSalesBs)],
      ['Costo Total Bs', formatBs(summary.totalCostBs)],
      ['Ganancia Bruta Bs', formatBs(summary.grossProfitBs)],
      ['Margen %', `${summary.profitMarginPercent}%`],
      ['Transacciones', summary.totalTransactions],
      ['Ticket Promedio Bs', formatBs(summary.averageTicketBs)],
      ['IGTF Total Bs', formatBs(summary.totalIgtfBs)],
      ['Gastos de Consumo Bs', formatBs(summary.nonSellableExpensesBs)],
      ['Gastos de Consumo USD', summary.nonSellableExpensesUsd.toFixed(2)],
      ['Top Producto', summary.topProductName ?? 'N/A'],
    );
    if (summary.salesVsYesterdayPercent !== undefined) {
      rows.push(['Vs Ayer %', `${summary.salesVsYesterdayPercent}%`]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 18 }];
  return ws;
}

function buildProfitSheet(profitOverTime: DailyProfitPoint[]): XLSX.WorkSheet {
  const rows: (string | number | undefined | null)[][] = [
    ['Fecha', 'Ventas Bs', 'Costo Bs', 'Ganancia Bs', 'Transacciones'],
  ];
  profitOverTime.forEach((p) => {
    rows.push([p.label, formatBs(p.salesBs), formatBs(p.costBs), formatBs(p.profitBs), p.transactions]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  return ws;
}

function buildProductsSheet(topProducts: TopProductData[]): XLSX.WorkSheet {
  const rows: (string | number | undefined | null)[][] = [
    ['Producto', 'SKU', 'Vendidos', 'Ingreso Bs', 'Costo Bs', 'Ganancia Bs', 'Margen %'],
  ];
  topProducts.forEach((p) => {
    rows.push([p.name, p.sku, p.quantitySold, formatBs(p.revenueBs), formatBs(p.costBs), formatBs(p.profitBs), `${p.marginPercent}%`]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  return ws;
}

function buildPaymentsSheet(paymentBreakdown: PaymentBreakdownData[]): XLSX.WorkSheet {
  const rows: (string | number | undefined | null)[][] = [
    ['Método', 'Transacciones', 'Total Bs', '%'],
  ];
  paymentBreakdown.forEach((p) => {
    rows.push([p.label, p.count, formatBs(p.totalBs), `${p.percentage}%`]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 8 }];
  return ws;
}

function buildCashSheet(cashAnalysis: CashRegisterSummaryData[]): XLSX.WorkSheet {
  const rows: (string | number | undefined | null)[][] = [
    ['Caja', 'Apertura Bs', 'Ventas Bs', 'IGTF Bs', 'Esperado Bs', 'Cierre Bs', 'Diferencia Bs', 'Estado'],
  ];
  cashAnalysis.forEach((r) => {
    rows.push([
      new Date(r.openedAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }),
      formatBs(r.openingBalanceBs),
      formatBs(r.totalSalesBs),
      formatBs(r.totalIgtfBs),
      r.expectedClosingBs !== undefined ? formatBs(r.expectedClosingBs) : '',
      r.closingBalanceBs !== undefined ? formatBs(r.closingBalanceBs) : '',
      r.differenceBs !== undefined ? formatBs(r.differenceBs) : '',
      r.status === 'open' ? 'Abierta' : 'Cerrada',
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  return ws;
}

export function useExport() {
  const exportCsv = useCallback((filename: string, headers: string[], rows: (string | number | undefined | null)[][]) => {
    const csv = toCsv(headers, rows);
    downloadFile(filename.endsWith('.csv') ? filename : `${filename}.csv`, csv, 'text/csv');
  }, []);

  const exportExcelAll = useCallback(({ summary, profitOverTime, topProducts, paymentBreakdown, cashAnalysis }: ExportAllData) => {
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, buildSummarySheet(summary), 'Resumen');
    XLSX.utils.book_append_sheet(wb, buildProfitSheet(profitOverTime), 'Ganancias');
    XLSX.utils.book_append_sheet(wb, buildProductsSheet(topProducts), 'Productos');
    XLSX.utils.book_append_sheet(wb, buildPaymentsSheet(paymentBreakdown), 'Pagos');
    XLSX.utils.book_append_sheet(wb, buildCashSheet(cashAnalysis), 'Caja');

    XLSX.writeFile(wb, `reporte-logiscore-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, []);

  return { exportCsv, exportExcelAll };
}

export { toCsv };
