/**
 * Export Tests — EXPORT-001..002
 * TDD: Tests for CSV conversion and export helpers
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// Mock browser APIs para tests de descarga
beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => ({ href: '', download: '', click: vi.fn(), style: {} }),
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
  });
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  });
});

function toCsv(headers: string[], rows: string[][]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const headerLine = headers.map(esc).join(',');
  const dataLines = rows.map((r) => r.map(esc).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

describe('EXPORT-001: Conversión a CSV', () => {
  it('Given: headers + 1 fila. When: toCsv. Then: formato CSV valido', () => {
    const csv = toCsv(
      ['Producto', 'SKU', 'Precio'],
      [['Harina PAN', 'HP-001', '2.50']],
    );
    expect(csv).toBe('"Producto","SKU","Precio"\r\n"Harina PAN","HP-001","2.50"');
  });

  it('Given: cadenas con comillas. When: toCsv. Then: comillas escapadas', () => {
    const csv = toCsv(
      ['Nota'],
      [['Venta de "Harina PAN" 1kg']],
    );
    expect(csv).toBe('"Nota"\r\n"Venta de ""Harina PAN"" 1kg"');
  });

  it('Given: datos numericos. When: toCsv. Then: numeros preservados', () => {
    const csv = toCsv(
      ['Producto', 'Cantidad', 'Total Bs'],
      [['Arroz', '100', '2500.50']],
    );
    expect(csv).toContain('2500.50');
  });

  it('Given: datos vacios. When: toCsv. Then: solo headers', () => {
    const csv = toCsv(['A', 'B'], []);
    expect(csv).toBe('"A","B"');
  });
});

describe('EXPORT-002: Descarga CSV', () => {
  beforeEach(() => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '', download: '', click: vi.fn(),
      style: {}, setAttribute: vi.fn(),
    } as unknown as HTMLElement);
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('Given: CSV valido. When: downloadCsv. Then: crea blob y link', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '', download: '', click: clickSpy,
      style: {}, setAttribute: vi.fn(),
    } as unknown as HTMLElement);

    downloadCsv('reporte.csv', 'a,b\r\n1,2');

    expect(clickSpy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
