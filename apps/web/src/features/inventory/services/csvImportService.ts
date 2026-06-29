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
  tipo?: string;
  precio?: string;
  costo?: string;
  stock?: string;
  stock_min?: string;
  categoria?: string;
  pesable?: string;
  unidad?: string;
  iva?: string;
  vendible?: string;
  pres_nombre?: string;
  pres_precio?: string;
  pres_multiplicador?: string;
  pres_codigo_barras?: string;
  [key: string]: string | undefined;
}

export interface ParsedPresentation {
  nombre: string;
  precio: number;
  multiplicador: number;
  codigoBarras?: string;
  rawIndex: number;
}

export interface ParsedProduct {
  rowNumber: number;
  nombre: string;
  sku: string;
  tipo: 'resale' | 'materia_prima';
  precio: number;
  costo: number;
  stock: number;
  stockMin: number;
  categoria: string;
  isWeighted: boolean;
  unit: string;
  isTaxable: boolean;
  isSellable: boolean;
  presentations: ParsedPresentation[];
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
  // eslint-disable-next-line security/detect-unsafe-regex
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

export function reconcileWeighted(isWeighted: boolean, unit: string): { isWeighted: boolean; unit: string } {
  const weightUnits = ['kg', 'gr', 'lt', 'm'];
  if (weightUnits.includes(unit) && !isWeighted) {
    return { isWeighted: true, unit };
  }
  if (unit === 'unidad' && isWeighted) {
    return { isWeighted: false, unit: 'unidad' };
  }
  return { isWeighted, unit };
}

const VALID_PRODUCT_TYPES = ['resale', 'materia_prima', 'materia', 'prima', 'raw', 'raw_material'];

function parseProductType(value: string | undefined): 'resale' | 'materia_prima' {
  if (!value) return 'resale';
  const v = value.trim().toLowerCase();
  if (v === 'materia_prima' || v === 'materia' || v === 'prima' || v === 'raw' || v === 'raw_material') {
    return 'materia_prima';
  }
  if (v !== 'resale' && v !== '') {
    return 'resale';
  }
  return 'resale';
}

function isValidProductType(value: string | undefined): boolean {
  if (!value || value.trim() === '') return true;
  return VALID_PRODUCT_TYPES.includes(value.trim().toLowerCase());
}

export function validateRow(row: CsvRow, _rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const rawIsWeighted = parseBoolean(row.pesable);
  const rawUnit = parseUnit(row.unidad, rawIsWeighted);
  const reconciled = reconcileWeighted(rawIsWeighted, rawUnit);
  const isWeighted = reconciled.isWeighted;

  const tipo = parseProductType(row.tipo);
  const isMateriaPrima = tipo === 'materia_prima';

  if (!row.nombre || row.nombre.trim() === '') {
    errors.push({ field: 'nombre', message: 'El nombre es obligatorio' });
  } else if (row.nombre.trim().length > 30) {
    errors.push({ field: 'nombre', message: 'Máximo 30 caracteres' });
  }

  if (!row.sku || row.sku.trim() === '') {
    errors.push({ field: 'sku', message: 'El SKU es obligatorio' });
  } else if (row.sku.trim().length > 18) {
    errors.push({ field: 'sku', message: 'Máximo 18 caracteres' });
  }

  // Precio: requerido para resale, opcional para materia_prima
  if (isMateriaPrima) {
    if (row.precio && row.precio.trim() !== '') {
      const precio = parseNumber(row.precio, 0);
      if (precio <= 0) errors.push({ field: 'precio', message: 'El precio debe ser mayor a 0' });
    }
  } else {
    if (!row.precio || row.precio.trim() === '') {
      errors.push({ field: 'precio', message: 'El precio es obligatorio' });
    } else {
      const precio = parseNumber(row.precio, 0);
      if (precio <= 0) errors.push({ field: 'precio', message: 'El precio debe ser mayor a 0' });
      else if (precio < 0.05) errors.push({ field: 'precio', message: 'El precio parece muy bajo (mínimo $0.05)' });
    }
  }

  // Costo: requerido para materia_prima
  if (isMateriaPrima) {
    if (!row.costo || row.costo.trim() === '') {
      errors.push({ field: 'costo', message: 'Materia prima requiere costo mayor a 0' });
    } else {
      const costo = parseNumber(row.costo, 0);
      if (costo <= 0) {
        errors.push({ field: 'costo', message: 'Materia prima requiere costo mayor a 0' });
      }
    }
  } else if (row.costo && row.costo.trim() !== '') {
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
    if (isWeighted) {
      const decimals = (row.stock_min.split('.')[1] || '').length;
      if (decimals > 2) {
        errors.push({ field: 'stock_min', message: 'Stock mínimo acepta máximo 2 decimales en pesables' });
      }
      const storageMin = Math.round(stockMin * 1000);
      if (stockMin > 0 && storageMin === 0) {
        errors.push({ field: 'stock_min', message: 'Stock mínimo demasiado bajo (se redondea a 0 en gramos/ml)' });
      }
    }
  }

  if (row.tipo && row.tipo.trim() !== '' && !isValidProductType(row.tipo)) {
    errors.push({ field: 'tipo', message: `Tipo "${row.tipo}" no es válido. Usa: resale o materia_prima` });
  }

  if (row.pesable && row.pesable.trim() === 'no' && rawUnit !== 'unidad' && row.unidad) {
    errors.push({ field: 'unidad', message: 'Si el producto no es pesable, la unidad debe ser "unidad"' });
  }

  // Validar presentación si existe
  if (row.pres_nombre && row.pres_nombre.trim() !== '') {
    errors.push(...validatePresentationRow(row, _rowIndex));
  }

  return errors;
}

function validatePresentationRow(row: CsvRow, _rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!row.pres_nombre || row.pres_nombre.trim() === '') {
    return errors;
  }

  if (row.pres_nombre.trim().length > 30) {
    errors.push({ field: 'pres_nombre', message: 'Variante: máximo 30 caracteres' });
  }

  if (!row.pres_precio || row.pres_precio.trim() === '') {
    errors.push({ field: 'pres_precio', message: `Variante "${row.pres_nombre}": precio requerido` });
  } else {
    const precio = parseNumber(row.pres_precio, 0);
    if (precio <= 0) {
      errors.push({ field: 'pres_precio', message: `Variante "${row.pres_nombre}": precio debe ser mayor a 0` });
    }
  }

  if (row.pres_multiplicador && row.pres_multiplicador.trim() !== '') {
    const mult = parseNumber(row.pres_multiplicador, 0);
    if (mult <= 0) {
      errors.push({ field: 'pres_multiplicador', message: `Variante "${row.pres_nombre}": multiplicador debe ser mayor a 0` });
    }
  }

  if (row.pres_codigo_barras && row.pres_codigo_barras.trim().length > 25) {
    errors.push({ field: 'pres_codigo_barras', message: `Variante "${row.pres_nombre}": código de barras máximo 25 caracteres` });
  }

  return errors;
}

function groupRowsBySku(rows: CsvRow[]): CsvRow[][] {
  const groups = new Map<string, CsvRow[]>();
  const groupOrder: string[] = [];

  for (const row of rows) {
    const sku = row.sku?.trim() ?? '';
    if (!groups.has(sku)) {
      groups.set(sku, []);
      groupOrder.push(sku);
    }
    groups.get(sku)!.push(row);
  }

  return groupOrder.map(sku => groups.get(sku)!);
}

export async function parseCsvFile(file: File): Promise<Result<CsvRow[], AppError>> {
  if (!file.name.endsWith('.csv')) {
    return failure(new AppErrorClass('CSV_INVALID_FORMAT', 'Formato no válido. Usa archivos .csv'));
  }

  return new Promise((resolve) => {
    // skipBOM is supported at runtime but not in @types/papaparse yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Papa.parse as any)(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      skipBOM: true,
      complete: (results: Papa.ParseResult<CsvRow>) => {
        if (results.errors.length > 0) {
          const errorMsgs = results.errors.slice(0, 5).map((e) => `Línea ${e.row ?? '?'}: ${e.message}`).join('; ');
          const suffix = results.errors.length > 5 ? ` (y ${results.errors.length - 5} más)` : '';
          resolve(failure(new AppErrorClass('CSV_PARSE_ERROR', `Errores al leer el archivo: ${errorMsgs}${suffix}`)));
          return;
        }
        const data = results.data as CsvRow[];
        if (data.length > MAX_ROWS) {
          resolve(failure(new AppErrorClass('CSV_TOO_MANY_ROWS', `Máximo ${MAX_ROWS} productos por importación. El archivo tiene ${data.length}.`)));
          return;
        }
        resolve({ ok: true, data });
      },
      error: (error: Error) => {
        resolve(failure(new AppErrorClass('CSV_PARSE_ERROR', `Error al leer el archivo: ${error.message}`)));
      },
    });
  });
}

export async function validateCsvRows(rows: CsvRow[], tenantId: string): Promise<ImportResult[]> {
  const db = getDb();
  const existingProducts = await db.products.where('tenantId').equals(tenantId).toArray();
  const existingSkus = new Set(existingProducts.filter((p) => !p.deletedAt).map((p) => p.sku));

  const existingPres = await db.productPresentations.where('tenantId').equals(tenantId)
    .filter(p => !p.deletedAt && !!p.barcode).toArray();
  const existingBarcodes = new Set(existingPres.map(p => p.barcode));

  const results: ImportResult[] = [];
  const seenSkus = new Set<string>();
  const skuGroups = groupRowsBySku(rows);

  for (const group of skuGroups) {
    const firstRow = group[0];
    const sku = firstRow.sku?.trim() ?? '';
    const hasPresentations = group.some(r => r.pres_nombre?.trim());

    // Verificar SKU duplicado contra DB
    if (sku && existingSkus.has(sku)) {
      const existing = existingProducts.find(p => p.sku === sku && !p.deletedAt);
      results.push({
        rowIndex: rows.indexOf(firstRow) + 1,
        sku,
        nombre: firstRow.nombre?.trim() ?? '',
        status: 'duplicate',
        errors: [],
        existingProductId: existing?.id,
      });
      continue;
    }

    // Verificar SKU duplicado en archivo
    if (sku && seenSkus.has(sku)) {
      results.push({
        rowIndex: rows.indexOf(firstRow) + 1,
        sku,
        nombre: firstRow.nombre?.trim() ?? '',
        status: 'duplicate',
        errors: [{ field: 'sku', message: 'SKU duplicado en el archivo' }],
      });
      continue;
    }

    if (sku) seenSkus.add(sku);

    if (hasPresentations) {
      // Producto con presentaciones: validar como grupo
      const allErrors: ValidationError[] = [];

      // Validar primera fila (campos del producto padre)
      allErrors.push(...validateRow(firstRow, rows.indexOf(firstRow) + 1));

      // Validar cada presentación
      const presNames = new Set<string>();
      const presBarcodes = new Set<string>();

      for (let j = 0; j < group.length; j++) {
        const r = group[j];
        if (!r.pres_nombre?.trim()) continue; // filas sin presentación se ignoran en grupo

        const presErrors = validatePresentationRow(r, rows.indexOf(r) + 1);
        allErrors.push(...presErrors);

        const presName = r.pres_nombre.trim().toLowerCase();
        if (presName) {
          if (presNames.has(presName)) {
            allErrors.push({ field: 'pres_nombre', message: `Variante duplicada: "${r.pres_nombre}"` });
          }
          presNames.add(presName);
        }

        const presBc = r.pres_codigo_barras?.trim().toLowerCase();
        if (presBc) {
          if (presBarcodes.has(presBc)) {
            allErrors.push({ field: 'pres_codigo_barras', message: `Barcode duplicado en variantes: "${r.pres_codigo_barras}"` });
          }
          presBarcodes.add(presBc);

          if (existingBarcodes.has(presBc)) {
            allErrors.push({ field: 'pres_codigo_barras', message: `Barcode "${r.pres_codigo_barras}" ya existe en otro producto` });
          }
        }
      }

      if (presNames.size === 0) {
        allErrors.push({ field: 'pres_nombre', message: 'Al menos una variante debe tener nombre' });
      }

      if (allErrors.length > 0) {
        results.push({
          rowIndex: rows.indexOf(firstRow) + 1,
          sku,
          nombre: firstRow.nombre?.trim() ?? '',
          status: 'error',
          errors: allErrors,
        });
      } else {
        results.push({
          rowIndex: rows.indexOf(firstRow) + 1,
          sku,
          nombre: firstRow.nombre?.trim() ?? '',
          status: 'valid',
          errors: [],
        });
      }
    } else {
      // Producto simple: validar cada fila individualmente
      const errors = validateRow(firstRow, rows.indexOf(firstRow) + 1);

      if (errors.length > 0) {
        results.push({
          rowIndex: rows.indexOf(firstRow) + 1,
          sku,
          nombre: firstRow.nombre?.trim() ?? '',
          status: 'error',
          errors,
        });
      } else {
        results.push({
          rowIndex: rows.indexOf(firstRow) + 1,
          sku,
          nombre: firstRow.nombre?.trim() ?? '',
          status: 'valid',
          errors: [],
        });
      }
    }
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

  // Las filas ya vienen pre-filtradas como válidas del caller (handleImport).
  // No re-validamos aquí para evitar desync si la DB cambia entre preview e import.
  const summary: ImportSummary = {
    total: rows.length,
    valid: rows.length,
    errors: 0,
    duplicates: 0,
    imported: 0,
    results: rows.map((r, i) => ({
      rowIndex: i + 1,
      sku: r.sku?.trim() ?? '',
      nombre: r.nombre?.trim() ?? '',
      status: 'valid' as const,
      errors: [],
    })),
    categoriesCreated,
  };

  const validRows = rows;

  // Pre-resolver categorías
  const categoryResolveMap = new Map<string, string>();
  for (const row of validRows) {
    const catName = row.categoria?.trim();
    if (!catName) continue;
    const normalized = normalizeText(catName);
    if (categoryResolveMap.has(normalized)) continue;

    const categoryNames = Array.from(categoryMap.values()).map((c) => c.name);
    const fuzzyMatch = fuzzyMatchCategory(catName, categoryNames);
    if (fuzzyMatch) {
      const existingCat = categoryMap.get(normalizeText(fuzzyMatch));
      if (existingCat) {
        categoryResolveMap.set(normalized, existingCat.id);
      }
    } else {
      const newCatResult = await inventoryService.createCategory({ name: catName, tenantId });
      if (newCatResult.ok) {
        categoryResolveMap.set(normalized, newCatResult.data.id);
        categoryMap.set(normalized, { id: newCatResult.data.id, name: catName, tenantId } as never);
        categoriesCreated.push(catName);
      }
    }
  }

  // Asegurar categoría default "Otros"
  if (!categoryMap.has(normalizeText('Otros'))) {
    const newCatResult = await inventoryService.createCategory({ name: 'Otros', tenantId });
    if (newCatResult.ok) {
      categoryMap.set(normalizeText('Otros'), { id: newCatResult.data.id, name: 'Otros', tenantId } as never);
      categoriesCreated.push('Otros');
    }
  }

  // AUDIT-016: Transactional CSV import (all-or-nothing)
  const importedRows: Array<{ sku: string; nombre: string }> = [];
  let rollbackError: string | null = null;

  // Agrupar filas válidas por SKU
  const skuGroups = groupRowsBySku(validRows);

  try {
    await db.transaction('rw', [
      db.products,
      db.inventoryMovements,
      db.inventoryLots,
      db.syncQueue,
      db.outbox,
    ], async () => {
      for (const group of skuGroups) {
        const firstRow = group[0];
        const nombre = firstRow.nombre?.trim() ?? '';
        const sku = firstRow.sku?.trim() ?? '';
        const precio = parseNumber(firstRow.precio, 0);
        const costo = parseNumber(firstRow.costo, 0);
        const stock = parseNumber(firstRow.stock, 0);
        const stockMin = firstRow.stock_min?.trim() ? parseNumber(firstRow.stock_min, 0) : Math.round(stock / 4);
        const isWeighted = parseBoolean(firstRow.pesable);
        const unit = parseUnit(firstRow.unidad, isWeighted);
        const reconciled = reconcileWeighted(isWeighted, unit);
        const finalIsWeighted = reconciled.isWeighted;
        const finalUnit = reconciled.unit;

        const tipo = parseProductType(firstRow.tipo);
        const isMateriaPrima = tipo === 'materia_prima';

        let categoryId = '';
        if (firstRow.categoria && firstRow.categoria.trim() !== '') {
          const normalized = normalizeText(firstRow.categoria.trim());
          categoryId = categoryResolveMap.get(normalized) ?? '';
        }
        if (!categoryId) {
          const defaultCat = categoryMap.get(normalizeText('Otros'));
          categoryId = defaultCat?.id ?? '';
        }

        // MED-6: NO forzar $0.01 en materia prima — dejar precio real (0 si no tiene)
        const finalPriceUsd = precio;

        const productInput = {
          name: nombre,
          sku,
          priceUsd: finalPriceUsd,
          categoryId,
          isWeighted: finalIsWeighted,
          isTaxable: firstRow.iva?.trim() ? parseBoolean(firstRow.iva) : true,
          isSellable: firstRow.vendible ? parseBoolean(firstRow.vendible) : !isMateriaPrima,
          unit: finalUnit as 'kg' | 'gr' | 'lt' | 'm' | 'unidad',
          stockInicial: stock,
          stockMin: stockMin || undefined,
          costPrice: costo || undefined,
          productType: (isMateriaPrima ? 'materia_prima' : 'resale') as 'resale' | 'materia_prima',
        };

        // Determinar si tiene presentaciones
        const presentations = group
          .filter(r => r.pres_nombre?.trim())
          .map((r, i) => ({
            name: r.pres_nombre!.trim(),
            priceUsd: parseNumber(r.pres_precio, 0.01),
            unitMultiplier: parseNumber(r.pres_multiplicador, 1),
            barcode: r.pres_codigo_barras?.trim() || undefined,
            sortOrder: i,
            stockType: 'shared' as const,
            stockInicial: 0,
          }));

        if (presentations.length > 0) {
          const result = await inventoryService.createProductWithPresentations(
            tenantId, userId, productInput, presentations
          );
          if (!result.ok) {
            throw new Error(`Fila ${sku || nombre}: ${result.error?.message ?? 'Error al crear producto con presentaciones'}`);
          }
        } else {
          const result = await inventoryService.createProduct(tenantId, userId, productInput);
          if (!result.ok) {
            throw new Error(`Fila ${sku || nombre}: ${result.error?.message ?? 'Error al crear producto'}`);
          }
        }

        importedRows.push({ sku, nombre });
      }
    });
    summary.imported = importedRows.length;
  } catch (err) {
    rollbackError = (err as Error).message ?? 'Error desconocido';
    summary.imported = 0;
    summary.errors = validRows.length;
    for (const r of summary.results) {
      if (r.status === 'valid') {
        r.status = 'error';
        r.errors = [{ field: 'import', message: `Transacción revertida: ${rollbackError}` }];
      }
    }
  }

  return summary;
}
