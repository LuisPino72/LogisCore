import Papa from 'papaparse';
import { inventoryService } from './inventoryService';
import { getDb } from '../../../services/dexie/db';
import type { Result } from '@logiscore/core';
import type { AppError } from '@logiscore/core';
import { failure, AppError as AppErrorClass } from '@logiscore/core';

const MAX_ROWS = 500;

export interface CsvRow {
  nombre?: string;
  sku?: string;
  precio?: string;
  costo?: string;
  stock?: string;
  stock_min?: string;
  categoria?: string;
  pesable?: string;
  unidad?: string;
  iva?: string;
  vendible?: string;
  [key: string]: string | undefined;
}

export interface ParsedProduct {
  rowNumber: number;
  nombre: string;
  sku: string;
  precio: number;
  costo: number;
  stock: number;
  stockMin: number;
  categoria: string;
  isWeighted: boolean;
  unit: string;
  raw: CsvRow;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ImportResult {
  rowIndex: number;
  sku: string;
  nombre: string;
  status: 'valid' | 'error' | 'duplicate';
  errors: ValidationError[];
  existingProductId?: string;
}

export interface ImportSummary {
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
  imported: number;
  results: ImportResult[];
  categoriesCreated: string[];
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function fuzzyMatchCategory(input: string, existing: string[]): string | null {
  const normalized = normalizeText(input);
  for (const cat of existing) {
    if (normalizeText(cat) === normalized) return cat;
  }
  for (const cat of existing) {
    const normCat = normalizeText(cat);
    if (normCat.includes(normalized) || normalized.includes(normCat)) return cat;
  }
  return null;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value || value.trim() === '') return fallback;
  let cleaned = value.trim();
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? fallback : num;
}

export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'si' || v === 'sí' || v === 'true' || v === '1' || v === 'yes';
}

export function parseUnit(value: string | undefined, isWeighted: boolean): string {
  if (!value) return isWeighted ? 'kg' : 'unidad';
  const v = value.trim().toLowerCase();
  const validUnits = ['kg', 'gr', 'lt', 'm', 'unidad'];
  if (validUnits.includes(v)) return v;
  return isWeighted ? 'kg' : 'unidad';
}

export function validateRow(row: CsvRow, _rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const isWeighted = parseBoolean(row.pesable);

  if (!row.nombre || row.nombre.trim() === '') {
    errors.push({ field: 'nombre', message: 'El nombre es obligatorio' });
  } else if (row.nombre.trim().length > 25) {
    errors.push({ field: 'nombre', message: 'Máximo 25 caracteres' });
  }

  if (!row.sku || row.sku.trim() === '') {
    errors.push({ field: 'sku', message: 'El SKU es obligatorio' });
  } else if (row.sku.trim().length > 14) {
    errors.push({ field: 'sku', message: 'Máximo 14 caracteres' });
  }

  if (!row.precio || row.precio.trim() === '') {
    errors.push({ field: 'precio', message: 'El precio es obligatorio' });
  } else {
    const precio = parseNumber(row.precio, 0);
    if (precio <= 0) errors.push({ field: 'precio', message: 'El precio debe ser mayor a 0' });
    else if (precio < 0.05) errors.push({ field: 'precio', message: 'El precio parece muy bajo (mínimo $0.05)' });
  }

  if (row.costo && row.costo.trim() !== '') {
    const costo = parseNumber(row.costo, 0);
    if (costo < 0) errors.push({ field: 'costo', message: 'El costo no puede ser negativo' });
  }

  if (!row.stock || row.stock.trim() === '') {
    errors.push({ field: 'stock', message: 'El stock es obligatorio' });
  } else {
    const stock = parseNumber(row.stock, 0);
    if (stock < 0) errors.push({ field: 'stock', message: 'El stock no puede ser negativo' });
    if (!isWeighted && !Number.isInteger(stock)) {
      errors.push({ field: 'stock', message: 'Productos por unidad deben tener stock entero' });
    }
  }

  if (row.stock_min && row.stock_min.trim() !== '') {
    const stockMin = parseNumber(row.stock_min, 0);
    if (stockMin < 0) errors.push({ field: 'stock_min', message: 'El stock mínimo no puede ser negativo' });
    if (!isWeighted && !Number.isInteger(stockMin)) {
      errors.push({ field: 'stock_min', message: 'Stock mínimo debe ser entero para productos por unidad' });
    }
  }

  return errors;
}

export async function parseCsvFile(file: File): Promise<Result<CsvRow[], AppError>> {
  if (!file.name.endsWith('.csv')) {
    return failure(new AppErrorClass('CSV_INVALID_FORMAT', 'Formato no válido. Usa archivos .csv'));
  }

  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (results) => {
        if (results.errors.length > 0) {
          resolve(failure(new AppErrorClass('CSV_PARSE_ERROR', `Error al leer el archivo: ${results.errors[0].message}`)));
          return;
        }
        const data = results.data as CsvRow[];
        if (data.length > MAX_ROWS) {
          resolve(failure(new AppErrorClass('CSV_TOO_MANY_ROWS', `Máximo ${MAX_ROWS} productos por importación. El archivo tiene ${data.length}.`)));
          return;
        }
        resolve({ ok: true, data });
      },
      error: (error) => {
        resolve(failure(new AppErrorClass('CSV_PARSE_ERROR', `Error al leer el archivo: ${error.message}`)));
      },
    });
  });
}

export async function validateCsvRows(rows: CsvRow[], tenantId: string): Promise<ImportResult[]> {
  const db = getDb();
  const existingProducts = await db.products.where('tenantId').equals(tenantId).toArray();
  const existingSkus = new Set(existingProducts.filter((p) => !p.deletedAt).map((p) => p.sku));

  const results: ImportResult[] = [];
  const seenSkus = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1;
    const errors = validateRow(row, rowIndex);
    const sku = row.sku?.trim() ?? '';

    if (sku && existingSkus.has(sku)) {
      const existing = existingProducts.find((p) => p.sku === sku && !p.deletedAt);
      results.push({
        rowIndex,
        sku,
        nombre: row.nombre?.trim() ?? '',
        status: 'duplicate',
        errors: [],
        existingProductId: existing?.id,
      });
      continue;
    }

    if (sku && seenSkus.has(sku)) {
      results.push({
        rowIndex,
        sku,
        nombre: row.nombre?.trim() ?? '',
        status: 'duplicate',
        errors: [{ field: 'sku', message: 'SKU duplicado en el archivo' }],
      });
      continue;
    }

    if (sku) seenSkus.add(sku);

    if (errors.length > 0) {
      results.push({
        rowIndex,
        sku,
        nombre: row.nombre?.trim() ?? '',
        status: 'error',
        errors,
      });
      continue;
    }

    results.push({
      rowIndex,
      sku,
      nombre: row.nombre?.trim() ?? '',
      status: 'valid',
      errors: [],
    });
  }

  return results;
}

export async function importProductsFromCsv(
  rows: CsvRow[],
  tenantId: string,
  userId: string,
): Promise<ImportSummary> {
  const db = getDb();
  const existingCategories = await db.categories.where('tenantId').equals(tenantId).toArray();
  const categoryMap = new Map(existingCategories.filter((c) => !c.deletedAt).map((c) => [normalizeText(c.name), c]));
  const categoriesCreated: string[] = [];

  const validatedResults = await validateCsvRows(rows, tenantId);
  const summary: ImportSummary = {
    total: rows.length,
    valid: validatedResults.filter((r) => r.status === 'valid').length,
    errors: validatedResults.filter((r) => r.status === 'error').length,
    duplicates: validatedResults.filter((r) => r.status === 'duplicate').length,
    imported: 0,
    results: validatedResults,
    categoriesCreated,
  };

  const validRows = rows.filter((_, i) => validatedResults[i]?.status === 'valid');

  const chunkSize = 50;
  for (let i = 0; i < validRows.length; i += chunkSize) {
    const chunk = validRows.slice(i, i + chunkSize);
    const results = await Promise.allSettled(
      chunk.map(async (row) => {
        const nombre = row.nombre?.trim() ?? '';
        const sku = row.sku?.trim() ?? '';
        const precio = parseNumber(row.precio, 0);
        const costo = parseNumber(row.costo, 0);
        const stock = parseNumber(row.stock, 0);
        const stockMin = parseNumber(row.stock_min, 0);
        const isWeighted = parseBoolean(row.pesable);
        const unit = parseUnit(row.unidad, isWeighted);

        let categoryId = '';
        if (row.categoria && row.categoria.trim() !== '') {
          const catName = row.categoria.trim();
          const categoryNames = Array.from(categoryMap.values()).map((c) => c.name);
          const fuzzyMatch = fuzzyMatchCategory(catName, categoryNames);
          if (fuzzyMatch) {
            const existingCat = categoryMap.get(normalizeText(fuzzyMatch));
            if (existingCat) {
              categoryId = existingCat.id;
            }
          } else {
            const newCatResult = await inventoryService.createCategory({ name: catName, tenantId });
            if (newCatResult.ok) {
              categoryId = newCatResult.data.id;
              categoryMap.set(normalizeText(catName), { id: categoryId, name: catName, tenantId } as never);
              categoriesCreated.push(catName);
            }
          }
        }

        if (!categoryId) {
          const defaultCat = categoryMap.get(normalizeText('Otros'));
          if (defaultCat) {
            categoryId = defaultCat.id;
          } else {
            const newCatResult = await inventoryService.createCategory({ name: 'Otros', tenantId });
            if (newCatResult.ok) {
              categoryId = newCatResult.data.id;
              categoryMap.set(normalizeText('Otros'), { id: categoryId, name: 'Otros', tenantId } as never);
              categoriesCreated.push('Otros');
            }
          }
        }

        const input = {
          name: nombre,
          sku,
          priceUsd: precio,
          categoryId,
          isWeighted,
          isTaxable: parseBoolean(row.iva),
          isSellable: row.vendible ? parseBoolean(row.vendible) : true,
          unit: unit as 'kg' | 'gr' | 'lt' | 'm' | 'unidad',
          stockInicial: stock,
          stockMin: stockMin || undefined,
          costPrice: costo || undefined,
        };

        const result = await inventoryService.createProduct(tenantId, userId, input);
        if (!result.ok) {
          throw new Error(result.error?.message ?? 'Error al crear producto');
        }
        return { sku, nombre };
      }),
    );

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        summary.imported++;
      } else {
        summary.errors++;
        const row = chunk[idx];
        const existingResult = summary.results.find(
          (res) => res.sku === row.sku?.trim() && res.status === 'valid',
        );
        if (existingResult) {
          existingResult.status = 'error';
          existingResult.errors = [{ field: 'import', message: r.reason?.message ?? 'Error al importar' }];
        }
      }
    });
  }

  return summary;
}
