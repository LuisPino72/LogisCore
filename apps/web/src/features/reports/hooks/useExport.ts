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
      ['Ventas Totales', `${formatBs(summary.totalSalesBs)} / $ ${summary.totalSalesUsd.toFixed(2)}`],
      ['Costo Total', `${formatBs(summary.totalCostBs)} / $ ${summary.totalCostUsd.toFixed(2)}`],
      ['Ganancia Bruta', `${formatBs(summary.grossProfitBs)} / $ ${summary.grossProfitUsd.toFixed(2)}`],
      ['Margen %', `${summary.profitMarginPercent}%`],
      ['Transacciones', summary.totalTransactions],
      ['Ticket Promedio', `${formatBs(summary.averageTicketBs)} / $ ${summary.averageTicketUsd.toFixed(2)}`],
      ['Gastos de Consumo Bs', formatBs(summary.nonSellableExpensesBs)],
      ['Gastos de Consumo USD', summary.nonSellableExpensesUsd.toFixed(2)],
      ['Top Producto', summary.topProductName ?? 'N/A'],
    );
    if (summary.salesVsYesterdayPercent !== undefined) {
      rows.push(['Vs Ayer %', `${summary.salesVsYesterdayPercent}%`]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 28 }];
  return ws;
}

function buildProfitSheet(profitOverTime: DailyProfitPoint[]): XLSX.WorkSheet {
  const rows: (string | number | undefined | null)[][] = [
    ['Fecha', 'Tasa', 'Ventas Bs', 'Ventas $', 'Costo Bs', 'Costo $', 'Ganancia Bs', 'Ganancia $', 'Transacciones'],
  ];
  profitOverTime.forEach((p) => {
    rows.push([
      p.label,
      p.lastRate.toFixed(4),
      formatBs(p.salesBs),
      `$ ${p.salesUsd.toFixed(2)}`,
      formatBs(p.costBs),
      `$ ${p.costUsd.toFixed(2)}`,
      formatBs(p.profitBs),
      `$ ${p.profitUsd.toFixed(2)}`,
      p.transactions,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
  return ws;
}

function buildProductsSheet(topProducts: TopProductData[]): XLSX.WorkSheet {
  const rows: (string | number | undefined | null)[][] = [
    ['Producto', 'Vendidos', 'Ingreso Bs', 'Ingreso $', 'Costo Bs', 'Costo $', 'Ganancia Bs', 'Ganancia $', 'Margen %'],
  ];
  topProducts.forEach((p) => {
    rows.push([
      p.name,
      p.quantitySold,
      formatBs(p.revenueBs),
      `$ ${p.revenueUsd.toFixed(2)}`,
      formatBs(p.costBs),
      `$ ${p.costUsd.toFixed(2)}`,
      formatBs(p.profitBs),
      `$ ${p.profitUsd.toFixed(2)}`,
      `${p.marginPercent}%`,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
  return ws;
}

function buildPaymentsSheet(paymentBreakdown: PaymentBreakdownData[]): XLSX.WorkSheet {
  const rows: (string | number | undefined | null)[][] = [
    ['Método', 'Transacciones', 'Total Bs', 'Total $', '%'],
  ];
  paymentBreakdown.forEach((p) => {
    rows.push([p.label, p.count, formatBs(p.totalBs), `$ ${p.totalUsd.toFixed(2)}`, `${p.percentage}%`]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
  return ws;
}

function buildCashSheet(cashAnalysis: CashRegisterSummaryData[]): XLSX.WorkSheet {
  const rows: (string | number | undefined | null)[][] = [
    ['Caja', 'Apertura Bs', 'Apertura $', 'Ventas Bs', 'Ventas $', 'Esperado Bs', 'Esperado $', 'Cierre Bs', 'Cierre $', 'Diferencia Bs', 'Diferencia $', 'Estado'],
  ];
  cashAnalysis.forEach((r) => {
    rows.push([
      new Date(r.openedAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }),
      formatBs(r.openingBalanceBs),
      `$ ${r.openingBalanceUsd.toFixed(2)}`,
      formatBs(r.totalSalesBs),
      `$ ${r.totalSalesUsd.toFixed(2)}`,
      r.expectedClosingBs !== undefined ? formatBs(r.expectedClosingBs) : '',
      r.expectedClosingUsd !== undefined ? `$ ${r.expectedClosingUsd.toFixed(2)}` : '',
      r.closingBalanceBs !== undefined ? formatBs(r.closingBalanceBs) : '',
      r.closingBalanceUsd !== undefined ? `$ ${r.closingBalanceUsd.toFixed(2)}` : '',
      r.differenceBs !== undefined ? formatBs(r.differenceBs) : '',
      r.differenceUsd !== undefined ? `$ ${r.differenceUsd.toFixed(2)}` : '',
      r.status === 'open' ? 'Abierta' : 'Cerrada',
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
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
