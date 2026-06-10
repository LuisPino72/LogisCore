import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb, isDbClosing, type DexieProductPresentation } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { logAuditEventOnly } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { InventoryErrors } from '../../../specs/inventory/errors';
import imageCompression from 'browser-image-compression';
import { imageCacheService } from '../../../services/imageCache/imageCacheService';
import type { Product, Category, InventoryMovement, CreateProductInput, AdjustStockInput, ProductFilters, ActiveLot, Presentation, CreatePresentationInput, UpdatePresentationInput } from '../types';
import { convertToStorage } from '../types';
import { requireRole } from '../../auth/services/roleGuard';
import { useAuthStore } from '../../auth/stores/authStore';
import { toNumber, toProduct, toCategory, toMovement, toPresentation } from './mappers';
import { CreateProductInputSchema, CreateCategoryInputSchema, UpdateCategoryInputSchema } from '../../../specs/inventory';

// AUDIT-BD-001: verified, código usa 'product_presentations' consistentemente (no hay 'from('presentations')' ni '"presentations"' en src)

const INVENTORY_MODULE = 'INVENTORY';

// AUDIT-CRUD-011: Mapear errores de Dexie a códigos específicos en lugar de devolver siempre PRODUCT_SKU_DUPLICATE
function mapProductError(err: unknown, operation: 'create' | 'createWithPres' | 'update'): AppError {
  const e = err as { name?: string; message?: string } | null;
  // Dexie ConstraintError: índice UNIQUE violado (SKU, barcode, etc.)
  if (e?.name === 'ConstraintError' || (typeof e?.message === 'string' && /unique|constraint/i.test(e.message))) {
    return new AppError(InventoryErrors.PRODUCT_SKU_DUPLICATE, 'El SKU ya está asignado a otro producto en este tenant.');
  }
  if (operation === 'create') {
    return new AppError(InventoryErrors.PRODUCT_CREATE_FAILED, 'Error al crear producto.');
  }
  if (operation === 'createWithPres') {
    return new AppError(InventoryErrors.PRODUCT_CREATE_FAILED, 'Error al crear producto con presentaciones.');
  }
  return new AppError(InventoryErrors.PRODUCT_UPDATE_FAILED, 'Error al actualizar producto.');
}

/** Tipo para filas de producto que llegan desde Supabase (snake_case).
 *  Mantener sincronizado con el schema de la tabla `products` en Supabase. */
interface SupabaseProductRow {
  id: string;
  tenant_id?: string;
  name: string;
  sku: string;
  is_weighted?: boolean;
  is_taxable?: boolean;
  is_sellable?: boolean;
  unit: Product['unit'];
  stock: number;
  stock_min?: number;
  image_url?: string;
  cost_price?: number;
  product_type?: Product['productType'];
}

async function deleteStorageImage(imageUrl: string, token?: string): Promise<void> {
  try {
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token ?? '';
    }
    if (!token) return;

    const parts = imageUrl.split('/Products/');
    if (parts.length < 2) return;
    const filePath = parts[1];

    const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/Products/${filePath}`;
    const res = await fetch(storageUrl, {
      method: 'DELETE',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      logger.error(INVENTORY_MODULE, `Error al eliminar imagen de storage: HTTP ${res.status}`, imageUrl);
    }
  } catch (err) {
    logger.error(INVENTORY_MODULE, 'Error al eliminar imagen de storage:', err);
  }
}

async function migrateProductTenantIds(
  db: ReturnType<typeof getDb>,
  tenantId: string,
): Promise<boolean> {
  const allLocal = await db.products.toArray();
  let migrated = false;
  for (const row of allLocal) {
    if (row.tenantId) continue;
    const match = await db.products
      .where({ sku: row.sku, tenantId })
      .first();
    if (match) {
      await db.products.update(row.id!, { tenantId });
      migrated = true;
    }
  }

  const authIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
  const needsMigration = allLocal.some(r => !r.deletedAt && r.tenantId && r.tenantId !== tenantId);
  if (!needsMigration) return migrated;

  for (const r of allLocal) {
    if (r.deletedAt || !r.tenantId || r.tenantId === tenantId) continue;
    const otherIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.tenantId as string);
    if (authIsUuid !== otherIsUuid) {
      await db.products.update(r.id!, { tenantId });
      migrated = true;
    }
  }
  return migrated;
}

async function getAllPresentations(tenantId: string): Promise<Result<Presentation[], AppError>> {
    const db = getDb();
    try {
      let rows = await db.productPresentations
        .where({ tenantId })
        .filter((p) => !p.deletedAt)
        .toArray();

      if (rows.length === 0 && !isDbClosing()) {
        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        const { data, error } = await supabase
          .from('product_presentations')
          .select('*')
          .eq('tenant_id', tenantUuid)
          .is('deleted_at', null);

        if (!error && data && data.length > 0 && !isDbClosing()) {
          for (const pres of data) {
            await db.productPresentations.put({
              id: pres.id,
              tenantId,
              productId: pres.product_id,
              name: pres.name,
              priceUsd: pres.price_usd,
              unitMultiplier: pres.unit_multiplier,
              stockType: pres.stock_type || 'shared',
              barcode: pres.barcode,
              sortOrder: pres.sort_order,
              createdAt: pres.created_at,
              updatedAt: pres.updated_at ?? pres.created_at,
            });
          }
          rows = await db.productPresentations
            .where({ tenantId })
            .filter((p) => !p.deletedAt)
            .toArray();
        }
      }

      return success(rows.map((r) => toPresentation(r as unknown as Record<string, unknown>)));
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en getAllPresentations:', err);
      return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Error al cargar presentaciones.'));
    }
  }

export const inventoryService = {
  async createProduct(
    tenantId: string,
    userId: string,
    input: CreateProductInput & { stockInicial?: number },
  ): Promise<Result<Product, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    const inputValidation = CreateProductInputSchema.safeParse(input);
      if (!inputValidation.success) {
        return failure(new AppError(
          InventoryErrors.INVALID_INPUT,
          inputValidation.error.issues.map((e: { message: string }) => e.message).join('; ')
        ));
      }

    if (input.categoryId) {
      const categoryCheck = await db.categories
        .where({ id: input.categoryId, tenantId })
        .filter((c) => !c.deletedAt)
        .first();
      if (!categoryCheck) {
        return failure(new AppError(InventoryErrors.CATEGORY_NOT_FOUND, 'La categoría especificada no existe.'));
      }
    }

    const id = generateId();
    const now = new Date().toISOString();

    const stockInicial = input.stockInicial && input.stockInicial > 0
      ? convertToStorage(input.stockInicial, input.isWeighted ? (input.unit === 'lt' ? 'pesable_lt' : 'pesable_kg') : 'unidad')
      : 0;

    const costPerDisplayUnit = input.costPrice != null && (input.stockInicial ?? 0) > 0
      ? preciseRound(input.costPrice / (input.stockInicial ?? 0), 4)
      : 0;
    const costPerStorageUnit = input.costPrice != null && stockInicial > 0
      ? preciseRound(input.costPrice / stockInicial, 4)
      : 0;
    const product: Product = {
      id,
      name: input.name,
      sku: input.sku,
      priceUsd: input.priceUsd,
      categoryId: input.categoryId,
      isWeighted: input.isWeighted,
      isTaxable: input.isTaxable !== undefined ? input.isTaxable : true,
      isSellable: input.isSellable !== undefined ? input.isSellable : true,
      unit: input.unit,
      stock: stockInicial,
      stockMin: input.stockMin != null
        ? convertToStorage(input.stockMin, input.isWeighted ? (input.unit === 'lt' ? 'pesable_lt' : 'pesable_kg') : 'unidad')
        : undefined,
      costPrice: costPerDisplayUnit,
        productType: input.productType ?? 'resale',
      };

    try {
      await db.transaction('rw', [db.products, db.inventoryMovements, db.inventoryLots, db.syncQueue, db.outbox], async () => {
        await db.products.add({ ...product, tenantId });
        await syncQueue.enqueue('products', 'CREATE', id, toSnake(product as unknown as Record<string, unknown>), tenantId);

        if (stockInicial > 0) {
          const movementId = generateId();
          const movement = {
            id: movementId,
            tenantId,
            productId: id,
            userId,
            type: 'purchase' as const,
            quantity: stockInicial,
            previousStock: 0,
            newStock: stockInicial,
            createdAt: now,
          };
          await db.inventoryMovements.add(movement);

          const lot = {
            id: generateId(),
            tenantId,
            productId: id,
            quantityAdded: stockInicial,
            remainingQuantity: stockInicial,
            costUsdPerUnit: costPerStorageUnit,
            sourceMovementId: movementId,
            createdAt: now,
            updatedAt: now,
            version: 0,
          };
          await db.inventoryLots.add(lot);

          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
          await syncQueue.enqueue('inventory_lots', 'CREATE', lot.id, toSnake(lot as unknown as Record<string, unknown>), tenantId);
        }

        await outboxService.enqueue('INVENTORY.CREATED', INVENTORY_MODULE, { productId: id, name: input.name, sku: input.sku, stockInicial });
      });

      await logAuditEventOnly({
        eventName: 'INVENTORY.CREATED',
        module: INVENTORY_MODULE,
        payload: { productId: id, name: input.name, sku: input.sku, stockInicial },
        context: { userId, tenantId },
      });

      return success(product);
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en createProduct:', err);
      // AUDIT-CRUD-011: distinguir ConstraintError de otros errores
      return failure(mapProductError(err, 'create'));
    }
  },

  async createProductWithPresentations(
    tenantId: string,
    userId: string,
    input: CreateProductInput & { stockInicial?: number },
    presentations: CreatePresentationInput[],
  ): Promise<Result<{ product: Product; presentations: Presentation[] }, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    if (!presentations.length) {
      return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, 'Debe agregar al menos una presentación.'));
    }

    // Validar nombres duplicados
    const names = presentations.map((p) => p.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, 'No puede haber dos presentaciones con el mismo nombre.'));
    }

    // Validar barcodes duplicados contra todas las presentaciones del tenant
    const barcodes = presentations.filter((p) => p.barcode?.trim()).map((p) => p.barcode!.trim());
    if (barcodes.length > 0) {
      const db = getDb();
      const allPres = await db.productPresentations.where({ tenantId }).filter((p) => !p.deletedAt).toArray();
      const existingBarcodes = new Set(allPres.filter((p) => p.barcode).map((p) => p.barcode));
      for (const barcode of barcodes) {
        if (existingBarcodes.has(barcode)) {
          return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, `El código de barras "${barcode}" ya está en uso por otro producto.`));
        }
      }
    }

    const db = getDb();
    const productId = generateId();
    const now = new Date().toISOString();

    const parentStock = input.stockInicial && input.stockInicial > 0
      ? convertToStorage(input.stockInicial, input.isWeighted ? (input.unit === 'lt' ? 'pesable_lt' : 'pesable_kg') : 'unidad')
      : 0;

    const presentationRecords: Array<{
      id: string;
      tenantId: string;
      productId: string;
      name: string;
      priceUsd: number;
      unitMultiplier: number;
      stockType: 'shared' | 'independent';
      barcode?: string | null;
      sortOrder: number;
      createdAt: string;
      updatedAt: string;
    }> = [];

    for (let i = 0; i < presentations.length; i++) {
      const pres = presentations[i];
      if (!pres.unitMultiplier || pres.unitMultiplier <= 0) {
        return failure(new AppError(InventoryErrors.PRESENTATION_MULTIPLIER_INVALID, `"${pres.name}" debe tener un multiplicador mayor a 0.`));
      }
      presentationRecords.push({
        id: generateId(),
        tenantId,
        productId,
        name: pres.name,
        priceUsd: pres.priceUsd,
        unitMultiplier: pres.unitMultiplier,
        stockType: 'shared',
        barcode: pres.barcode,
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      const createdPresentations: Presentation[] = [];
      const costPerDisplayUnit = input.costPrice != null && input.stockInicial && input.stockInicial > 0
        ? preciseRound(input.costPrice / input.stockInicial, 4)
        : 0;
      const costPerStorageUnit = input.costPrice != null && parentStock > 0
        ? preciseRound(input.costPrice / parentStock, 4)
        : 0;
      const createdProduct = {
        id: productId,
        tenantId: tenantId,
        name: input.name,
        sku: input.sku,
        priceUsd: input.priceUsd,
        categoryId: input.categoryId,
        isWeighted: input.isWeighted,
        isTaxable: input.isTaxable !== undefined ? input.isTaxable : true,
        isSellable: input.isSellable !== undefined ? input.isSellable : true,
        unit: input.unit,
        stock: parentStock,
        stockMin: input.stockMin != null
          ? convertToStorage(input.stockMin, input.isWeighted ? (input.unit === 'lt' ? 'pesable_lt' : 'pesable_kg') : 'unidad')
          : undefined,
        costPrice: costPerDisplayUnit,
        imageUrl: input.imageUrl,
      productType: input.productType ?? 'resale',
      };

      await db.transaction('rw', [
        db.products,
        db.productPresentations,
        db.inventoryLots,
        db.inventoryMovements,
        db.syncQueue,
        db.outbox,
      ], async () => {
        await db.products.add(createdProduct);
        // CRITICAL: Enqueue parent product first to ensure it exists in Supabase before dependents
        await syncQueue.enqueue('products', 'CREATE', productId, toSnake(createdProduct as unknown as Record<string, unknown>), tenantId);

        if (parentStock > 0) {
          const movementId = generateId();
          const movement = {
            id: movementId,
            tenantId,
            productId,
            userId,
            type: 'purchase' as const,
            quantity: parentStock,
            previousStock: 0,
            newStock: parentStock,
            createdAt: now,
          };
          await db.inventoryMovements.add(movement);

          const lot = {
            id: generateId(),
            tenantId,
            productId,
            quantityAdded: parentStock,
            remainingQuantity: parentStock,
            costUsdPerUnit: costPerStorageUnit,
            sourceMovementId: movementId,
            createdAt: now,
            updatedAt: now,
            version: 0,
          };
          await db.inventoryLots.add(lot);

          await syncQueue.enqueue('inventory_lots', 'CREATE', lot.id, toSnake(lot as unknown as Record<string, unknown>), tenantId);
          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
        }

        for (const pres of presentationRecords) {
          await db.productPresentations.add(pres);
          await syncQueue.enqueue('product_presentations', 'CREATE', pres.id, toSnake(pres as unknown as Record<string, unknown>), tenantId);
          createdPresentations.push(toPresentation(pres as unknown as Record<string, unknown>));
        }

        await outboxService.enqueue('INVENTORY.CREATED', INVENTORY_MODULE, {
          productId,
          name: input.name,
          sku: input.sku,
          stockInicial: parentStock,
          presentationCount: presentations.length,
        });
      });

      await logAuditEventOnly({
        eventName: 'INVENTORY.CREATED',
        module: INVENTORY_MODULE,
        payload: {
          productId, name: input.name, sku: input.sku,
          stockInicial: parentStock, presentationCount: presentations.length,
        },
        context: { userId, tenantId },
      });

      return success({
        product: toProduct(createdProduct as unknown as Record<string, unknown>),
        presentations: createdPresentations,
      });
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en createProductWithPresentations:', err);
      // AUDIT-CRUD-011: distinguir ConstraintError de otros errores
      return failure(mapProductError(err, 'createWithPres'));
    }
  },

  async updateProduct(id: string, input: Partial<Product>, tenantId: string): Promise<Result<Product, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    try {
      const existing = await db.products.get(id);
      if (!existing) {
        return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
      }

      // Validar SKU duplicado si el SKU ha cambiado
      if (input.sku && input.sku !== existing.sku) {
        const duplicate = await db.products
          .where({ tenantId })
          .filter((p) => p.sku === input.sku && p.id !== id && !p.deletedAt)
          .first();
        if (duplicate) {
          return failure(new AppError('PRODUCT_SKU_DUPLICATE', 'El SKU ya está asignado a otro producto.'));
        }
      }

      // Eliminar campos que no existen en la tabla products de Supabase
      const rawInput = input as Record<string, unknown>;
      const presentationsInput = rawInput.presentations as CreatePresentationInput[] | undefined;

      const safeInput = { ...rawInput };
      delete safeInput.stockInicial;
      delete safeInput.presentations;
      delete safeInput.stockType;
      // Convertir stockMin a storage units para productos pesables
      if (safeInput.stockMin !== undefined && existing.isWeighted) {
        safeInput.stockMin = convertToStorage(
          safeInput.stockMin as number,
          existing.unit === 'lt' ? 'pesable_lt' : 'pesable_kg',
        );
      }
      // Preservar imageUrl existente si no viene explícitamente en el input
      if (safeInput.imageUrl === undefined && existing.imageUrl) {
        delete safeInput.imageUrl;
      }
      const updated = { ...existing, ...safeInput };
      logger.info('updateProduct', `[updateProduct] imageUrl in input: ${input.imageUrl ?? 'undefined'}`);
      logger.info('updateProduct', `[updateProduct] safeInput.imageUrl: ${safeInput.imageUrl ?? 'undefined'}`);
      logger.info('updateProduct', `[updateProduct] existing.imageUrl: ${existing.imageUrl ?? 'undefined'}`);
      logger.info('updateProduct', `[updateProduct] updated.imageUrl: ${updated.imageUrl ?? 'undefined'}`);

      await db.transaction('rw', [
        db.products,
        db.productPresentations,
        db.inventoryLots,
        db.inventoryMovements,
        db.syncQueue,
        db.outbox,
      ], async () => {
        await db.products.put(updated);
        await syncQueue.enqueue('products', 'UPDATE', id, toSnake(updated as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { productId: id, changes: Object.keys(input) });

        // Sincronizar presentaciones si el input las incluye
        if (presentationsInput) {
          const existingPres = await db.productPresentations
            .where({ productId: id })
            .filter((p) => !p.deletedAt)
            .toArray();

          const existingPresMap = new Map(existingPres.map((p) => [p.id, p]));
          const submittedIds = new Set(
            presentationsInput
              .filter((p) => !!(p as Record<string, unknown>).id)
              .map((p) => (p as Record<string, unknown>).id as string),
          );

          // Eliminar presentaciones que ya no están en la lista
          const deletedAt = new Date().toISOString();
          for (const existingPresItem of existingPres) {
            if (!submittedIds.has(existingPresItem.id)) {
              await db.productPresentations.update(existingPresItem.id, { deletedAt });
              await syncQueue.enqueue('product_presentations', 'DELETE', existingPresItem.id, { id: existingPresItem.id, deleted_at: deletedAt }, tenantId);
            }
          }

          // Crear o actualizar presentaciones
          const now = new Date().toISOString();
          for (let i = 0; i < presentationsInput.length; i++) {
            const pres = presentationsInput[i];
            const presRaw = pres as Record<string, unknown>;
            const existingId = presRaw.id as string | undefined;

            if (existingId && existingPresMap.has(existingId)) {
              // Actualizar presentación existente
              const patchData: Record<string, unknown> = {
                id: existingId,
                name: pres.name,
                priceUsd: pres.priceUsd,
                barcode: pres.barcode,
                sortOrder: i,
                updatedAt: now,
              };
              await db.productPresentations.update(existingId, patchData as unknown as Partial<DexieProductPresentation>);
              await syncQueue.enqueue('product_presentations', 'UPDATE', existingId, toSnake(patchData as unknown as Record<string, unknown>), tenantId);
            } else {
              // Crear nueva presentación
              const presId = generateId();
              const record: Record<string, unknown> = {
                id: presId,
                tenantId,
                productId: id,
                name: pres.name,
                priceUsd: pres.priceUsd,
                unitMultiplier: pres.unitMultiplier ?? 1,
                stockType: 'shared',
                barcode: pres.barcode,
                sortOrder: i,
                createdAt: now,
                updatedAt: now,
              };

              await db.productPresentations.add(record as unknown as DexieProductPresentation);
              await syncQueue.enqueue('product_presentations', 'CREATE', presId, toSnake(record), tenantId);
            }
          }
        }
      });
      await logAuditEventOnly({
        eventName: 'INVENTORY.UPDATED',
        module: INVENTORY_MODULE,
        payload: { productId: id, changes: Object.keys(input) },
        context: { tenantId },
      });
      return success(toProduct(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en updateProduct:', err);
      // AUDIT-CRUD-011: distinguir ConstraintError de otros errores
      return failure(mapProductError(err, 'update'));
    }
  },

  async getPresentationsForProduct(productId: string): Promise<Result<Presentation[], AppError>> {
    const db = getDb();
    const session = useAuthStore.getState().session;
    if (!session?.tenantId) {
      return failure(new AppError(InventoryErrors.TENANT_REQUIRED, 'No hay tenant en sesión.'));
    }
    const productCheck = await db.products.where({ id: productId, tenantId: session.tenantId }).first();
    if (!productCheck || productCheck.deletedAt) {
      return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado en este tenant.'));
    }
    try {
      let rows = await db.productPresentations
        .where({ productId })
        .filter((p) => !p.deletedAt)
        .sortBy('sortOrder');

      // If local is empty, try pulling from Supabase
      if (rows.length === 0 && !isDbClosing()) {
        const { data: remotePres, error } = await supabase
          .from('product_presentations')
          .select('*')
          .eq('product_id', productId)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true });

        if (!error && remotePres && remotePres.length > 0 && !isDbClosing()) {
          const now = new Date().toISOString();
          for (const pres of remotePres) {
            await db.productPresentations.put({
              id: pres.id,
              tenantId: '',
              productId: pres.product_id,
              name: pres.name,
              priceUsd: pres.price_usd,
              unitMultiplier: pres.unit_multiplier,
              stockType: pres.stock_type || 'shared',
              barcode: pres.barcode,
              sortOrder: pres.sort_order,
              createdAt: pres.created_at,
              updatedAt: pres.updated_at ?? now,
            });
          }
          rows = await db.productPresentations
            .where({ productId })
            .filter((p) => !p.deletedAt)
            .sortBy('sortOrder');
        }
      }

      return success(rows.map((r) => toPresentation(r as unknown as Record<string, unknown>)));
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en getPresentationsForProduct:', err);
      return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Error al cargar presentaciones.'));
    }
  },

  getAllPresentations,

  async updatePresentation(
    tenantId: string,
    presentationId: string,
    input: UpdatePresentationInput,
  ): Promise<Result<Presentation, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    try {
      const existing = await db.productPresentations.get(presentationId);
      if (!existing || existing.deletedAt) {
        return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Presentación no encontrada.'));
      }

      if (input.name !== undefined && !input.name.trim()) {
        return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, 'El nombre de la presentación no puede estar vacío.'));
      }

      if (input.unitMultiplier !== undefined && input.unitMultiplier <= 0) {
        return failure(new AppError(InventoryErrors.PRESENTATION_MULTIPLIER_INVALID, 'El multiplicador debe ser mayor a 0.'));
      }

      // Validar nombre duplicado dentro del mismo producto
      const newName = input.name;
      if (newName !== undefined && newName.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
        const normalized = newName.trim().toLowerCase();
        const duplicate = await db.productPresentations
          .where({ productId: existing.productId })
          .filter((p) => !p.deletedAt && p.id !== presentationId && p.name.trim().toLowerCase() === normalized)
          .first();
        if (duplicate) {
          return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, `Ya existe una presentación llamada "${newName.trim()}".`));
        }
      }

      // Validar barcode duplicado contra otras presentaciones del tenant
      if (input.barcode !== undefined && input.barcode.trim()) {
        const barcodeTrimmed = input.barcode.trim();
        const allPres = await db.productPresentations.where({ tenantId }).filter((p) => !p.deletedAt && p.id !== presentationId).toArray();
        const duplicateBarcode = allPres.find((p) => p.barcode === barcodeTrimmed);
        if (duplicateBarcode) {
          return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, `El código de barras "${barcodeTrimmed}" ya está en uso por otro producto.`));
        }
      }

      const updated = {
        ...existing,
        ...(newName !== undefined && { name: newName.trim() }),
        ...(input.priceUsd !== undefined && { priceUsd: input.priceUsd }),
        ...(input.unitMultiplier !== undefined && { unitMultiplier: input.unitMultiplier }),
        ...(input.barcode !== undefined && { barcode: input.barcode }),
        updatedAt: new Date().toISOString(),
      };

      await db.transaction('rw', [db.productPresentations, db.products, db.syncQueue, db.outbox], async () => {
        await db.productPresentations.put(updated);
        await syncQueue.enqueue('product_presentations', 'UPDATE', presentationId, toSnake(updated as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { presentationId, changes: Object.keys(input) });
      });

      await logAuditEventOnly({
        eventName: 'INVENTORY.UPDATED',
        module: INVENTORY_MODULE,
        payload: { presentationId, changes: Object.keys(input) },
        context: { tenantId },
      });
      return success(toPresentation(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en updatePresentation:', err);
      return failure(new AppError(InventoryErrors.PRESENTATION_UPDATE_FAILED, 'Error al actualizar presentación.'));
    }
  },

  async deletePresentation(
    tenantId: string,
    presentationId: string,
  ): Promise<Result<void, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    try {
      const existing = await db.productPresentations.get(presentationId);
      if (!existing || existing.deletedAt) {
        return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Presentación no encontrada.'));
      }

      const deletedAt = new Date().toISOString();
      await db.transaction('rw', [db.productPresentations, db.products, db.syncQueue, db.outbox], async () => {
        await db.productPresentations.update(presentationId, { deletedAt });
        await syncQueue.enqueue('product_presentations', 'DELETE', presentationId, { id: presentationId, deleted_at: deletedAt }, tenantId);
        await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { presentationId, action: 'deleted' });
      });

      await logAuditEventOnly({
        eventName: 'INVENTORY.UPDATED',
        module: INVENTORY_MODULE,
        payload: { presentationId, action: 'deleted' },
        context: { tenantId },
      });
      return success(undefined);
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en deletePresentation:', err);
      return failure(new AppError(InventoryErrors.PRESENTATION_NOT_FOUND, 'Error al eliminar presentación.'));
    }
  },

  async softDeleteProduct(id: string, tenantId: string): Promise<Result<void, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    const db = getDb();
    // AUDIT-CRUD-004: Tenant-leak fix — filtrar producto por tenantId antes de soft-delete
    const product = await db.products
      .where({ tenantId, id })
      .filter((p) => !p.deletedAt)
      .first();
    if (!product) {
      return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
    }

    // Validar que no tenga stock > 0
    if (product.stock > 0) {
      return failure(new AppError(InventoryErrors.PRODUCT_HAS_STOCK, `No se puede eliminar: el producto tiene ${product.stock} unidades en inventario. Ajuste el stock a cero primero.`));
    }

    // Validar que no tenga órdenes de compra activas (draft, confirmed o partially_received)
    const orderItems = await db.purchaseOrderItems.where({ productId: id }).toArray();
    if (orderItems.length > 0) {
      const orderIds = [...new Set(orderItems.map(i => i.orderId))];
      const blockingOrders = await db.purchaseOrders
        .where('id')
        .anyOf(orderIds)
        .filter(o => !o.deletedAt && (o.status === 'draft' || o.status === 'confirmed' || o.status === 'partially_received'))
        .count();
      if (blockingOrders > 0) {
        return failure(new AppError('PRODUCT_HAS_ACTIVE_ORDERS', `No se puede eliminar: el producto está en ${blockingOrders} orden(es) de compra activa(s).`));
      }
    }

    const activeLots = await db.inventoryLots
      .where({ productId: id })
      .filter((l) => !l.deletedAt && l.remainingQuantity > 0)
      .count();
    if (activeLots > 0) {
      return failure(new AppError(InventoryErrors.PRODUCT_HAS_LOTS, `No se puede eliminar: ${activeLots} lote(s) con stock pendiente.`));
    }

    const activeRecipes = await db.recipes
      .where({ productId: id })
      .filter((r) => !r.deletedAt)
      .count();
    if (activeRecipes > 0) {
      return failure(new AppError(InventoryErrors.PRODUCT_HAS_RECIPES, `No se puede eliminar: ${activeRecipes} receta(s) activa(s).`));
    }

    // Cascade: find presentations for soft delete
    const presentations = await db.productPresentations
      .where({ productId: id })
      .filter((p) => !p.deletedAt)
      .toArray();

    const deletedAt = new Date().toISOString();

    // Eliminar imágenes de storage (fire-and-forget, no bloquea la tx)
    Promise.resolve().then(async () => {
      const p = await db.products.get(id);
      if (p?.imageUrl) await deleteStorageImage(p.imageUrl);
    });

    await db.transaction('rw', [db.products, db.productPresentations, db.syncQueue, db.outbox], async () => {
      for (const pres of presentations) {
        await db.productPresentations.update(pres.id, { deletedAt });
        await syncQueue.enqueue('product_presentations', 'DELETE', pres.id, { id: pres.id, deleted_at: deletedAt }, tenantId);
      }

      await db.products.update(id, { deletedAt });
      await syncQueue.enqueue('products', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
      await outboxService.enqueue('INVENTORY.DELETED', INVENTORY_MODULE, { productId: id });
    });
    await logAuditEventOnly({
      eventName: 'INVENTORY.DELETED',
      module: INVENTORY_MODULE,
      payload: { productId: id, cascadePresentations: presentations.length },
      context: { tenantId },
    });
    return success(undefined);
  },

  async getProducts(tenantId: string, filters?: ProductFilters, pagination?: { limit?: number; offset?: number }): Promise<Result<Product[], AppError>> {
    const limit = pagination?.limit ?? 100;
    const offset = pagination?.offset ?? 0;
    try {
      const db = getDb();

      await migrateProductTenantIds(db, tenantId);

      let rows = await db.products
        .where({ tenantId })
        .filter((p) => !p.deletedAt)
        .toArray();

      const presCount = rows.length > 0 ? await db.productPresentations.where({ tenantId }).filter(p => !p.deletedAt).count() : 0;

      if (rows.length === 0 || presCount === 0) {
        if (isDbClosing()) return success(rows.map((r) => toProduct(r as unknown as Record<string, unknown>)));

        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantUuid)
          .is('deleted_at', null)
          .range(offset, offset + limit - 1);

        if (!error && data && data.length > 0) {
          try {
            const [lotsResponse, presResponse] = await Promise.all([
              supabase.from('inventory_lots').select('*').eq('tenant_id', tenantUuid).in('product_id', data.map((p: Record<string, unknown>) => p.id)),
              supabase.from('product_presentations').select('*').eq('tenant_id', tenantUuid).in('product_id', data.map((p: Record<string, unknown>) => p.id)).is('deleted_at', null)
            ]);

            const lots = lotsResponse.data;
            const presData = presResponse.data;

            await db.transaction('rw', [db.products, db.inventoryLots, db.productPresentations], async () => {
              for (const prod of data as SupabaseProductRow[]) {
                // AUDIT-003: Preserve productType in Supabase→Dexie cache (Sesión 98 regression fix)
                const prodRecord = prod as unknown as Record<string, unknown>;
                await db.products.put({
                  id: prod.id, tenantId,
                  name: prod.name, sku: prod.sku,
                  priceUsd: (prodRecord.price_usd as number | undefined) ?? 0,
                  categoryId: prodRecord.category_id as string | undefined,
                  isWeighted: prod.is_weighted !== undefined ? !!prod.is_weighted : false,
                  isTaxable: prod.is_taxable !== undefined ? !!prod.is_taxable : true,
                  isSellable: prod.is_sellable !== undefined ? !!prod.is_sellable : true,
                  unit: prod.unit,
                  stock: prod.stock,
                  stockMin: prod.stock_min,
                  imageUrl: prod.image_url,
                  costPrice: prod.cost_price,
                  productType: prod.product_type ?? 'resale',
                });
              }

              if (isDbClosing()) return;

              if (lots && lots.length > 0) {
                for (const lot of lots) {
                  if (isDbClosing()) return;
          await db.inventoryLots.put({
            id: lot.id, tenantId,
            productId: lot.product_id,
            quantityAdded: lot.quantity_added,
            remainingQuantity: lot.remaining_quantity,
            costUsdPerUnit: lot.cost_usd_per_unit,
            sourceMovementId: lot.source_movement_id,
            createdAt: lot.created_at,
            updatedAt: lot.updated_at ?? lot.created_at,
            version: lot.version ?? 1,
          });
                }
              }

              if (isDbClosing()) return;

              if (presData && presData.length > 0) {
                for (const pres of presData) {
                  if (isDbClosing()) return;
                  await db.productPresentations.put({
                    id: pres.id,
                    tenantId,
                    productId: pres.product_id,
                    name: pres.name,
                    priceUsd: pres.price_usd,
                    unitMultiplier: pres.unit_multiplier,
                    stockType: pres.stock_type || 'shared',
                    barcode: pres.barcode,
                    sortOrder: pres.sort_order,
                    createdAt: pres.created_at,
                    updatedAt: pres.updated_at ?? pres.created_at,
                  });
                }
              }
            });
          } catch (err) {
            logger.error(INVENTORY_MODULE, 'Error during seed:', err);
          }
        }
      }

      rows = await db.products
        .where({ tenantId })
        .filter((p) => !p.deletedAt)
        .offset(offset)
        .limit(limit)
        .toArray();

      let products = rows.map((r) => toProduct(r as unknown as Record<string, unknown>));

      if (filters?.query) {
        const q = filters.query.toLowerCase();
        products = products.filter((p) => p.name.toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q));
      }

      if (filters?.categoryId) {
        products = products.filter((p) => p.categoryId === filters.categoryId);
      }

      return success(products);
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en getProducts:', err);
      return failure(new AppError('PRODUCTS_QUERY_FAILED', 'Error al cargar productos.'));
    }
  },

  async getProductById(tenantId: string, id: string): Promise<Result<Product, AppError>> {
    const db = getDb();
    // AUDIT-008: Multi-tenant defense (Regla 5) — filtrar por tenantId para evitar cross-tenant leak
    const product = await db.products.where({ tenantId, id }).first();
    if (!product || product.deletedAt) {
      return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
    }
    return success(toProduct(product as unknown as Record<string, unknown>));
  },

  async createCategory(input: { name: string; tenantId: string }): Promise<Result<Category, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();

    const inputValidation = CreateCategoryInputSchema.safeParse({ name: input.name });
    if (!inputValidation.success) {
      return failure(new AppError(InventoryErrors.INVALID_INPUT, inputValidation.error.issues.map((e: { message: string }) => e.message).join('; ')));
    }

    const normalizedName = input.name.trim().toLowerCase();
    const existing = await db.categories
      .where({ tenantId: input.tenantId })
      .filter((c) => !c.deletedAt && c.name.trim().toLowerCase() === normalizedName)
      .first();
    if (existing) {
      return failure(new AppError('CATEGORY_DUPLICATE', `Ya existe una categoría llamada "${input.name.trim()}".`));
    }

    const id = generateId();
    const cat = { id, name: input.name, tenantId: input.tenantId };
    await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
      await db.categories.add(cat);
      await syncQueue.enqueue('categories', 'CREATE', id, { id, name: input.name }, input.tenantId);
      await outboxService.enqueue('INVENTORY.CREATED', INVENTORY_MODULE, { categoryId: id, name: input.name });
    });
    await logAuditEventOnly({
      eventName: 'INVENTORY.CREATED',
      module: INVENTORY_MODULE,
      payload: { categoryId: id, name: input.name },
      context: { tenantId: input.tenantId },
    });
    return success(toCategory(cat as unknown as Record<string, unknown>));
  },

  async updateCategory(id: string, name: string, tenantId: string): Promise<Result<Category, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();

    const inputValidation = UpdateCategoryInputSchema.safeParse({ name });
    if (!inputValidation.success) {
      return failure(new AppError(InventoryErrors.INVALID_INPUT, inputValidation.error.issues.map((e: { message: string }) => e.message).join('; ')));
    }

    // AUDIT-CRUD-005: Tenant-leak fix — validar que la categoría pertenece al tenant antes de update
    const existing = await db.categories
      .where({ tenantId, id })
      .filter((c) => !c.deletedAt)
      .first();
    if (!existing) {
      return failure(new AppError(InventoryErrors.CATEGORY_NOT_FOUND, 'Categoría no encontrada en este tenant.'));
    }

    const duplicate = await db.categories
      .where({ tenantId })
      .filter((c) => !c.deletedAt && c.id !== id && c.name.toLowerCase() === name.toLowerCase())
      .first();
    if (duplicate) {
      return failure(new AppError(InventoryErrors.CATEGORY_DUPLICATE, 'Ya existe una categoría con ese nombre.'));
    }

    const updated = { name };
    await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
      await db.categories.update(id, updated);
      await syncQueue.enqueue('categories', 'UPDATE', id, { id, name }, tenantId);
      await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { categoryId: id, name });
    });
    await logAuditEventOnly({
      eventName: 'INVENTORY.UPDATED',
      module: INVENTORY_MODULE,
      payload: { categoryId: id, name },
      context: { tenantId },
    });
    return success({ id, name });
  },

  async getCategories(tenantId: string): Promise<Result<Category[], AppError>> {
    try {
      const db = getDb();
      let rows = await db.categories
        .where({ tenantId })
        .filter((c) => !c.deletedAt)
        .toArray();

      // If local is empty, try pulling from Supabase filtering by tenant UUID
      if (rows.length === 0) {
        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        // AUDIT-FLOW-5-005: UNION de categorías del tenant + predefinidas globales (tenant_id NULL).
        // Antes: solo filtraba por tenant_uuid, perdiendo categorías predefinidas visibles para todos.
        const [tenantCats, predefinedCats] = await Promise.all([
          supabase.from('categories').select('*').eq('tenant_id', tenantUuid).is('deleted_at', null),
          supabase.from('categories').select('*').is('tenant_id', null).is('deleted_at', null),
        ]);

        if (!tenantCats.error && !predefinedCats.error) {
          const combined = [...(tenantCats.data ?? []), ...(predefinedCats.data ?? [])];
          const seen = new Set<string>();
          const data = combined.filter((d) => {
            if (seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
          });

          if (data.length > 0) {
            for (const cat of data) {
              const localCat = {
                id: cat.id, tenantId,
                name: cat.name, isPredefined: cat.is_predefined,
              };
              await db.categories.put(localCat);
            }
            rows = data.map((d) => ({ id: d.id, name: d.name, isPredefined: d.is_predefined, tenantId }));
          }
        }
      }

      return success(rows.map((r) => toCategory(r as unknown as Record<string, unknown>)));
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en getCategories:', err);
      return failure(new AppError(InventoryErrors.CATEGORY_LIST_FAILED, 'Error al listar categorías.'));
    }
  },

  async deleteCategory(id: string, tenantId: string): Promise<Result<void, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();
    const productsInCategory = await db.products
      .where({ tenantId })
      .filter((p) => p.categoryId === id && !p.deletedAt)
      .count();

    if (productsInCategory > 0) {
      return failure(new AppError('CATEGORY_HAS_PRODUCTS', `No se puede eliminar: tiene ${productsInCategory} producto(s) asociado(s).`));
    }

    const deletedAt = new Date().toISOString();
    await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
      await db.categories.update(id, { deletedAt });
      await syncQueue.enqueue('categories', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
      await outboxService.enqueue('INVENTORY.DELETED', INVENTORY_MODULE, { categoryId: id });
    });
    await logAuditEventOnly({
      eventName: 'INVENTORY.DELETED',
      module: INVENTORY_MODULE,
      payload: { categoryId: id },
      context: { tenantId },
    });
    return success(undefined);
  },

  async adjustStock(input: AdjustStockInput & { userId: string; tenantId: string }): Promise<Result<InventoryMovement, AppError>> {
    requireRole('owner', 'admin');

    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);

    if (!input.reasonType) {
      return failure(new AppError('INVENTORY_ADJUSTMENT_INVALID', 'Debes seleccionar un motivo para el ajuste.'));
    }

    const LOSS_REASONS = ['perdida', 'robo', 'vencido', 'consumo_interno', 'otros'];
    if (input.quantity > 0 && LOSS_REASONS.includes(input.reasonType)) {
      return failure(new AppError('INVENTORY_ADJUSTMENT_INVALID', 'No puedes agregar stock con motivo de pérdida.'));
    }

    const db = getDb();
    // AUDIT-FLOW-9-009: Filtrar por tenantId para evitar tenant-leak (Regla #5).
    const product = await db.products
      .where({ tenantId: input.tenantId, id: input.productId })
      .filter((p) => !p.deletedAt)
      .first();
    if (!product) {
      return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
    }

    const now = new Date().toISOString();
    const previousStock = product.stock;
    
    // Convert input quantity to storage units (g/ml) if weighted
    const storageQuantity = product.isWeighted 
      ? convertToStorage(input.quantity, product.unit === 'kg' ? 'pesable_kg' : 'pesable_lt')
      : Math.round(input.quantity);

    const newStock = previousStock + storageQuantity;
 
    if (newStock < 0) {
      return failure(new AppError('PRODUCT_STOCK_NEGATIVE', 'El stock no puede ser negativo.'));
    }
 
    try {
      const movementId = generateId();
      let movementCostUsd: number | undefined;

      await db.transaction('rw', [db.products, db.inventoryMovements, db.inventoryLots, db.syncQueue, db.outbox], async () => {
        await db.products.update(input.productId, { stock: newStock });
 
        if (storageQuantity > 0) {
          const lotId = generateId();
          const costPerUnit = input.costTotal != null && input.costTotal > 0
            ? preciseRound(input.costTotal / Math.abs(storageQuantity), 4)
            : await (async (): Promise<number> => {
                const lots = await db.inventoryLots
                  .where({ productId: input.productId })
                  .filter((l) => l.costUsdPerUnit !== undefined && l.costUsdPerUnit! > 0)
                  .sortBy('createdAt');
                return lots.length > 0 ? (lots[lots.length - 1].costUsdPerUnit ?? 0) : 0;
              })();
          const lot = {
            id: lotId,
            tenantId: input.tenantId,
            productId: input.productId,
            quantityAdded: storageQuantity,
            remainingQuantity: storageQuantity,
            costUsdPerUnit: costPerUnit,
            sourceMovementId: movementId,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          await db.inventoryLots.add(lot);
          movementCostUsd = costPerUnit > 0 ? preciseRound(Math.abs(storageQuantity) * costPerUnit, 2) : undefined;
        } else {
          const fifoResult = await this.consumeFifo(input.productId, Math.abs(storageQuantity), input.tenantId);
          if (!fifoResult.ok) throw new AppError('INVENTORY_STOCK_INSUFFICIENT', 'Stock insuficiente para completar el ajuste.');
          movementCostUsd = fifoResult.data.reduce((sum, c) => sum + ((c.costUsdPerUnit ?? 0) * c.quantity), 0);
          movementCostUsd = movementCostUsd > 0 ? preciseRound(movementCostUsd, 2) : undefined;
        }

        const movement = {
          id: movementId,
          tenantId: input.tenantId,
          productId: input.productId,
          userId: input.userId,
          type: 'adjustment' as const,
          quantity: storageQuantity,
          previousStock,
          newStock,
          reasonType: input.reasonType,
          costUsd: movementCostUsd,
          createdAt: now,
        };
        await db.inventoryMovements.add(movement);
 
        await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), input.tenantId);

        // Enqueue product update so stock syncs to Supabase
        const updatedProduct = await db.products.get(input.productId);
        if (updatedProduct) {
          await syncQueue.enqueue('products', 'UPDATE', input.productId, toSnake(updatedProduct as unknown as Record<string, unknown>), input.tenantId);
        }
        await outboxService.enqueue('INVENTORY.ADJUSTMENT', INVENTORY_MODULE, {
          productId: input.productId, quantity: input.quantity, reasonType: input.reasonType,
          previousStock, newStock, costUsd: movementCostUsd,
        });
      });

      await logAuditEventOnly({
        eventName: 'INVENTORY.ADJUSTMENT',
        module: INVENTORY_MODULE,
        payload: {
          productId: input.productId, quantity: input.quantity, reasonType: input.reasonType,
          previousStock, newStock, costUsd: movementCostUsd,
        },
        context: { userId: input.userId, tenantId: input.tenantId },
      });

      const resultMovement = {
        id: movementId,
        tenantId: input.tenantId,
        productId: input.productId,
        userId: input.userId,
        type: 'adjustment' as const,
        quantity: storageQuantity,
        previousStock,
        newStock,
        reasonType: input.reasonType,
        costUsd: movementCostUsd,
        createdAt: now,
      };
      return success(toMovement(resultMovement as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error('adjustStock', 'Error:', err);
      if (err instanceof AppError) {
        return failure(err);
      }
      return failure(new AppError(InventoryErrors.INVENTORY_STOCK_INSUFFICIENT, 'Error al ajustar stock. Verifica el stock disponible.'));
    }
  },

  async getProductLots(productId: string): Promise<Result<ActiveLot[], AppError>> {
    const db = getDb();
    const session = useAuthStore.getState().session;
    if (!session?.tenantId) {
      return failure(new AppError(InventoryErrors.TENANT_REQUIRED, 'No hay tenant en sesión.'));
    }
    const productCheck = await db.products.where({ id: productId, tenantId: session.tenantId }).first();
    if (!productCheck || productCheck.deletedAt) {
      return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado en este tenant.'));
    }

    const lots = await db.inventoryLots
      .where({ productId })
      .filter((l) => l.remainingQuantity > 0)
      .sortBy('createdAt');

    return success(lots.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      quantityAdded: toNumber(l.quantityAdded),
      remainingQuantity: toNumber(l.remainingQuantity),
      costUsdPerUnit: l.costUsdPerUnit != null ? toNumber(l.costUsdPerUnit) : undefined,
    })));
  },

  async uploadProductImage(file: File, tenantId: string, productId: string): Promise<Result<string, AppError>> {
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_ORIGINAL_SIZE = 10 * 1024 * 1024;

    if (!ALLOWED_TYPES.includes(file.type)) {
      return failure(new AppError('INVENTORY_IMAGE_INVALID_TYPE', 'Formato no permitido. Usa JPG, PNG o WebP.'));
    }

    if (file.size > MAX_ORIGINAL_SIZE) {
      return failure(new AppError('INVENTORY_IMAGE_TOO_LARGE', 'La imagen es demasiado grande. Máximo 10MB.'));
    }

    let compressedFile: File;
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: false,
        fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      };
      compressedFile = await imageCompression(file, options);
      logger.info('uploadProductImage', `Imagen comprimida: ${file.size} bytes → ${compressedFile.size} bytes`);
    } catch (err) {
      logger.error('uploadProductImage', 'Compresión fallida, usando original:', err);
      compressedFile = file;
    }

    const ext = compressedFile.name.split('.').pop() ?? 'jpg';
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const filePath = `${tenantUuid}/${productId}.${ext}`;
    logger.info('uploadProductImage', `filePath: ${filePath}, ext: ${ext}, original ext: ${file.name.split('.').pop()}`);

    let token: string;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token ?? '';
      if (!token) {
        return failure(new AppError('INVENTORY_IMAGE_NO_SESSION', 'No hay sesión activa.'));
      }
    } catch (err) {
      logger.error('uploadProductImage', 'Auth session error:', err);
      return failure(new AppError('INVENTORY_IMAGE_NO_SESSION', 'Error de autenticación. Intenta cerrar sesión y volver a entrar.'));
    }

    const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/Products/${filePath}`;

    try {
      const buffer = await compressedFile.arrayBuffer();
      const res = await fetch(storageUrl, {
        method: 'PUT',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'content-type': compressedFile.type,
          'cache-control': '3600',
        },
        body: buffer,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        logger.error('uploadProductImage', 'Storage error:', res.status, errBody);
        if (res.status === 403) {
          return failure(new AppError('INVENTORY_IMAGE_UPLOAD_FAILED', 'Permiso denegado. Verifica que el bucket "Products" sea público.'));
        }
        if (res.status === 413) {
          return failure(new AppError('INVENTORY_IMAGE_TOO_LARGE', 'La imagen es demasiado grande. Máximo 2MB.'));
        }
        return failure(new AppError('INVENTORY_IMAGE_UPLOAD_FAILED', `Error al subir la imagen (${res.status}). Verifica tu conexión.`));
      }
    } catch (err) {
      logger.error('uploadProductImage', 'Network error:', err);
      return failure(new AppError('INVENTORY_IMAGE_UPLOAD_FAILED', 'Error de red al subir la imagen. Verifica tu conexión a internet.'));
    }

    const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/Products/${filePath}`;
    logger.info('uploadProductImage', `publicUrl generada: ${publicUrl}`);

    try {
      const db = getDb();
      const oldProduct = await db.products.get(productId);
      if (oldProduct?.imageUrl) {
        await imageCacheService.invalidate(oldProduct.imageUrl);
        await deleteStorageImage(oldProduct.imageUrl, token);
      }
      await db.products.update(productId, { imageUrl: publicUrl });
      logger.info('uploadProductImage', `Dexie updated: productId=${productId}, imageUrl=${publicUrl}`);

      const restUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/products?id=eq.${productId}`;
      const patchRes = await fetch(restUrl, {
        method: 'PATCH',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_url: publicUrl }),
      });
      logger.info('uploadProductImage', `REST PATCH status: ${patchRes.status}`);

      const dbItem = await db.products.get(productId);
      if (dbItem) {
        await syncQueue.enqueue('products', 'UPDATE', productId, toSnake({ ...dbItem, image_url: publicUrl } as unknown as Record<string, unknown>), tenantId);
        logger.info('uploadProductImage', `syncQueue enqueued for productId=${productId}`);
      }
    } catch (err) {
      logger.error('uploadProductImage', 'DB update error:', err);
    }

    return success(publicUrl);
  },

  async getProductBySku(sku: string, tenantId: string): Promise<Result<Product | null, AppError>> {
    const db = getDb();

    // 1. Buscar por product SKU en Dexie
    const product = await db.products
      .where({ tenantId })
      .filter((p) => !p.deletedAt && p.sku === sku)
      .first();
    if (product) return success(toProduct(product as unknown as Record<string, unknown>));

    // 2. Buscar por presentation barcode en Dexie
    const presentation = await db.productPresentations
      .where({ tenantId })
      .filter((p) => !p.deletedAt && p.barcode === sku)
      .first();
    if (presentation) {
      const parentProduct = await db.products.get(presentation.productId);
      if (parentProduct && !parentProduct.deletedAt) {
        return success(toProduct(parentProduct as unknown as Record<string, unknown>));
      }
    }

    // 3. Fallback a Supabase (con UUID y mapeo snake_case)
    if (!navigator.onLine) return success(null);
    try {
      const uuid = await TenantTranslator.slugToUuid(tenantId);
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', uuid)
        .eq('sku', sku)
        .is('deleted_at', null)
        .maybeSingle();
      if (data) {
        // AUDIT-003: Preserve productType in Supabase→Dexie cache (Sesión 98 regression fix)
        const row = data as unknown as SupabaseProductRow;
        const local = {
          id: row.id,
          tenantId,
          name: row.name,
          sku: row.sku,
          priceUsd: (data as Record<string, unknown>).price_usd as number,
          isWeighted: row.is_weighted ?? false,
          isTaxable: row.is_taxable ?? true,
          isSellable: row.is_sellable ?? true,
          unit: row.unit,
          stock: row.stock,
          stockMin: row.stock_min,
          imageUrl: row.image_url,
          costPrice: row.cost_price,
          productType: row.product_type ?? 'resale',
        };
        await db.products.put(local);
        return success(toProduct(local as unknown as Record<string, unknown>));
      }
    } catch {
      // Silenciar errores de red en fallback
    }
    return success(null);
  },

  async getPresentationByBarcode(barcode: string, tenantId: string): Promise<Presentation | null> {
    const db = getDb();
    const pres = await db.productPresentations
      .where({ tenantId })
      .filter((p) => !p.deletedAt && p.barcode === barcode && !!p.id)
      .first();
    if (pres) return toPresentation(pres as unknown as Record<string, unknown>);
    return null;
  },

  async consumeFifo(productId: string, quantity: number, tenantId: string): Promise<Result<Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }>, AppError>> {
    if (!tenantId) {
      return failure(new AppError(InventoryErrors.TENANT_REQUIRED, 'No hay tenant en sesión.'));
    }
    const db = getDb();
    let lots = await db.inventoryLots
      .where({ tenantId, productId })
      .filter((l) => !l.deletedAt && l.remainingQuantity > 0)
      .sortBy('createdAt');

    // AUDIT-FLOW-6-006: Fallback de lote implícito si no hay inventory_lots pero producto tiene stock.
    // Antes: error INVENTORY_STOCK_INSUFFICIENT aunque product.stock >= quantity.
    if (lots.length === 0) {
      const product = await db.products.where({ tenantId, id: productId }).filter(p => !p.deletedAt).first();
      if (product && product.stock >= quantity) {
        const now = new Date().toISOString();
          const implicitLot = {
            id: generateId(),
            tenantId,
            productId,
            quantityAdded: product.stock,
            remainingQuantity: product.stock,
            costUsdPerUnit: product.isWeighted
              ? (product.costPrice ?? 0) / 1000
              : (product.costPrice ?? 0),
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
        await db.transaction('rw', [db.inventoryLots, db.syncQueue], async () => {
          await db.inventoryLots.add(implicitLot as never);
          await syncQueue.enqueue('inventory_lots', 'CREATE', implicitLot.id, toSnake(implicitLot as unknown as Record<string, unknown>), tenantId);
        });
        lots = [implicitLot as never];
      }
    }

    let toConsume = quantity;
    const consumed: Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }> = [];

    await db.transaction('rw', [db.inventoryLots, db.syncQueue], async () => {
      for (const lot of lots) {
        if (toConsume <= 0) break;

        // Optimistic locking: re-read lot just before update and check version
        const currentLot = await db.inventoryLots.get(lot.id);
        if (!currentLot) continue;
        if (currentLot.version !== lot.version) {
          throw new AppError(InventoryErrors.INVENTORY_LOT_FIFO_CONFLICT, 'Conflicto en consumo FIFO. Reintente la operación.');
        }

        const consumeQty = Math.min(currentLot.remainingQuantity, toConsume);
        const newRemaining = currentLot.remainingQuantity - consumeQty;
        const newVersion = currentLot.version + 1;
        await db.inventoryLots.update(lot.id, { remainingQuantity: newRemaining, version: newVersion });
        await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({
          ...lot, remainingQuantity: newRemaining, version: newVersion,
        } as unknown as Record<string, unknown>), tenantId);

        consumed.push({ lotId: lot.id, quantity: consumeQty, costUsdPerUnit: lot.costUsdPerUnit });
        toConsume -= consumeQty;
      }
    });

    if (toConsume > 0) {
      return failure(new AppError(InventoryErrors.INVENTORY_STOCK_INSUFFICIENT, 'Stock insuficiente para completar la operación.'));
    }

    return success(consumed);
  },

  async getMovementHistory(productId: string, tenantId: string): Promise<Result<InventoryMovement[], AppError>> {
    if (!tenantId) {
      return failure(new AppError(InventoryErrors.TENANT_REQUIRED, 'No hay tenant en sesión.'));
    }
    const db = getDb();
    let rows = await db.inventoryMovements
      .where({ tenantId, productId })
      .filter((m) => !m.deletedAt)
      .sortBy('createdAt');

    // If local is empty, try pulling from Supabase
    if (rows.length === 0) {
      const query = supabase
        .from('inventory_movements')
        .select('*')
        .eq('product_id', productId);
      if (tenantId) {
        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        query.eq('tenant_id', tenantUuid);
      }
      const { data, error } = await query;

      if (!error && data && data.length > 0) {
        for (const mov of data) {
          await db.inventoryMovements.add({
            id: mov.id, tenantId: tenantId ?? '',
            productId: mov.product_id,
            userId: mov.user_id,
            type: mov.type,
            quantity: mov.quantity,
            previousStock: mov.previous_stock,
            newStock: mov.new_stock,
            reason: mov.reason,
            reasonType: mov.reason_type,
            costUsd: mov.cost_usd ? Number(mov.cost_usd) : undefined,
            createdAt: mov.created_at,
          });
        }
        rows = await db.inventoryMovements.where({ productId }).sortBy('createdAt');
      }
    }

    const movements: InventoryMovement[] = [];
    for (const r of rows) {
      try {
        movements.push(toMovement(r as unknown as Record<string, unknown>));
      } catch (e) {
        logger.error(INVENTORY_MODULE, 'Skipping invalid movement record:', r.id, e);
      }
    }
    return success(movements.reverse());
  },

  async getLowStockProducts(tenantId: string): Promise<Result<Product[], AppError>> {
    const db = getDb();

    // Excluir productos con receta de ensamblaje (stock es ilimitado por diseño)
    const assemblyRecipes = await db.recipes
      .where({ tenantId })
      .filter((r) => !r.deletedAt && r.isActive && r.mode === 'assembly')
      .toArray();
    const assemblyProductIds = new Set(assemblyRecipes.map((r) => r.productId));

    let rows = await db.products
      .where({ tenantId })
      .filter((p) => !p.deletedAt && !assemblyProductIds.has(p.id) && p.stockMin != null && p.stockMin > 0)
      .toArray();

    if (rows.length === 0) {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantUuid)
        .is('deleted_at', null);

      if (!error && data && data.length > 0 && !isDbClosing()) {
        try {
          const productRecords = (data as SupabaseProductRow[]).map((prod) => {
            const prodRecord = prod as unknown as Record<string, unknown>;
            return {
              id: prod.id, tenantId,
              name: prod.name, sku: prod.sku,
              priceUsd: (prodRecord.price_usd as number | undefined) ?? 0,
              categoryId: prodRecord.category_id as string | undefined,
              isWeighted: prod.is_weighted !== undefined ? !!prod.is_weighted : false,
              isTaxable: prod.is_taxable !== undefined ? !!prod.is_taxable : true,
              isSellable: prod.is_sellable !== undefined ? !!prod.is_sellable : true,
              unit: prod.unit,
              stock: prod.stock,
              stockMin: prod.stock_min,
              productType: prod.product_type ?? 'resale',
            };
          });
          if (!isDbClosing()) {
            await db.products.bulkPut(productRecords);
          }
        } catch {
          // DB cerrada durante shutdown, ignorar
        }

        rows = await db.products
          .where({ tenantId })
      .filter((p) => !p.deletedAt && !assemblyProductIds.has(p.id) && p.stockMin != null && p.stockMin > 0)
          .toArray();
      }
    }

    const lowStock = rows.filter((p) => {
      const displayStock = p.isWeighted
        ? (p.unit === 'kg' || p.unit === 'lt' ? p.stock / 1000 : p.stock)
        : p.stock;
      const displayStockMin = p.isWeighted
        ? (p.unit === 'kg' || p.unit === 'lt' ? p.stockMin! / 1000 : p.stockMin!)
        : p.stockMin!;
      return displayStock <= displayStockMin;
    });
    return success(lowStock.map((r) => toProduct(r as unknown as Record<string, unknown>)));
  },
};
