import { useCallback } from 'react';
import * as XLSX from 'xlsx';
import type {
  ExecutiveSummaryData,
  DailyProfitPoint,
  TopProductData,
  PaymentBreakdownData,
  CashRegisterSummaryData,
} from '../types';
import { formatBs, formatUsd } from '@/lib/formatBs';

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

function applyCenterAlignment(ws: XLSX.WorkSheet, startRow = 1): void {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let row = startRow; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = ws[cellRef];
      if (cell) {
        cell.s = { alignment: { horizontal: 'center' } };
      }
    }
  }
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
      ['Ventas Totales', `${formatBs(summary.totalSalesBs)} / ${formatUsd(summary.totalSalesUsd)}`],
      ['Costo Total', `${formatBs(summary.totalCostBs)} / ${formatUsd(summary.totalCostUsd)}`],
      ['Ganancia Bruta', `${formatBs(summary.grossProfitBs)} / ${formatUsd(summary.grossProfitUsd)}`],
      ['Margen %', `${summary.profitMarginPercent}%`],
      ['Transacciones', summary.totalTransactions],
      ['Ticket Promedio', `${formatBs(summary.averageTicketBs)} / ${formatUsd(summary.averageTicketUsd)}`],
      ['Gastos de Consumo Bs', formatBs(summary.nonSellableExpensesBs)],
      ['Gastos de Consumo USD', formatUsd(summary.nonSellableExpensesUsd)],
      ['Top Producto', summary.topProductName ?? 'N/A'],
    );
    if (summary.salesVsYesterdayPercent !== undefined) {
      rows.push(['Vs Ayer %', `${summary.salesVsYesterdayPercent}%`]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 28 }];
  applyCenterAlignment(ws);
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
      formatUsd(p.salesUsd),
      formatBs(p.costBs),
      formatUsd(p.costUsd),
      formatBs(p.profitBs),
      formatUsd(p.profitUsd),
      p.transactions,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
  applyCenterAlignment(ws);
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
      formatUsd(p.revenueUsd),
      formatBs(p.costBs),
      formatUsd(p.costUsd),
      formatBs(p.profitBs),
      formatUsd(p.profitUsd),
      `${p.marginPercent}%`,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
  applyCenterAlignment(ws);
  return ws;
}

function buildPaymentsSheet(paymentBreakdown: PaymentBreakdownData[]): XLSX.WorkSheet {
  const rows: (string | number | undefined | null)[][] = [
    ['Método', 'Transacciones', 'Total Bs', 'Total $', '%'],
  ];
  paymentBreakdown.forEach((p) => {
    rows.push([p.label, p.count, formatBs(p.totalBs), formatUsd(p.totalUsd), `${p.percentage}%`]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
  applyCenterAlignment(ws);
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
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
  applyCenterAlignment(ws);
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

    XLSX.writeFile(wb, `reporte-logiscore-${new Date().toISOString().slice(0, 10)}.xlsx`, { cellStyles: true });
  }, []);

  return { exportCsv, exportExcelAll };
}

export { toCsv };
