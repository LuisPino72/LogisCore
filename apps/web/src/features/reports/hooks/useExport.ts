import { useCallback } from 'react';

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

export function useExport() {
  const exportCsv = useCallback((filename: string, headers: string[], rows: (string | number | undefined | null)[][]) => {
    const csv = toCsv(headers, rows);
    downloadFile(filename.endsWith('.csv') ? filename : `${filename}.csv`, csv, 'text/csv');
  }, []);

  const printReport = useCallback(() => {
    window.print();
  }, []);

  return { exportCsv, printReport };
}

export { toCsv };
