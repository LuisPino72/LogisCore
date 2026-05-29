import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId, preciseRound } from '@logiscore/shared';
import { getDb, isDbClosing } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { requireNetwork } from '../../../services/network/requireNetwork';
import { InventoryErrors } from '../../../specs/inventory/errors';
import imageCompression from 'browser-image-compression';
import { imageCacheService } from '../../../services/imageCache/imageCacheService';
import type { Product, Category, InventoryMovement, CreateProductInput, AdjustStockInput, ProductFilters, ActiveLot, Presentation, CreatePresentationInput, UpdatePresentationInput } from '../types';
import { convertToStorage } from '../types';

const INVENTORY_MODULE = 'INVENTORY';

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
    await fetch(storageUrl, {
      method: 'DELETE',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    logger.warn(INVENTORY_MODULE, 'Error al eliminar imagen de storage:', err);
  }
}

function toNumber(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function toProduct(raw: Record<string, unknown>): Product {
  return {
    id: raw.id as string,
    name: raw.name as string,
    sku: raw.sku as string,
    priceUsd: toNumber(raw.priceUsd),
    categoryId: raw.categoryId as string | undefined,
    isWeighted: raw.isWeighted as boolean,
    isTaxable: raw.isTaxable !== undefined ? !!raw.isTaxable : true,
    isSellable: raw.isSellable !== undefined ? !!raw.isSellable : true,
    unit: raw.unit as Product['unit'],
    stock: toNumber(raw.stock),
    stockMin: raw.stockMin != null ? toNumber(raw.stockMin) : undefined,
    imageUrl: raw.imageUrl as string | undefined,
    costPrice: raw.costPrice != null ? toNumber(raw.costPrice) : undefined,
    deletedAt: raw.deletedAt as string | undefined,
  };
}

function toCategory(raw: Record<string, unknown>): Category {
  return {
    id: raw.id as string,
    name: raw.name as string,
    isPredefined: raw.isPredefined as boolean | undefined,
  };
}

function toMovement(raw: Record<string, unknown>): InventoryMovement {
  return {
    id: raw.id as string,
    productId: raw.productId as string,
    type: raw.type as InventoryMovement['type'],
    quantity: raw.quantity as number,
    previousStock: raw.previousStock as number,
    newStock: raw.newStock as number,
    createdAt: raw.createdAt as string,
    userId: raw.userId as string,
    reason: raw.reason as string | undefined,
    reasonType: raw.reasonType as string | undefined,
    costUsd: raw.costUsd as number | undefined,
  };
}

function toPresentation(raw: Record<string, unknown>): Presentation {
  return {
    id: raw.id as string,
    productId: raw.productId as string,
    name: raw.name as string,
    priceUsd: raw.priceUsd as number,
    unitMultiplier: raw.unitMultiplier as number,
    stockType: 'shared',
    barcode: raw.barcode as string | undefined,
    sortOrder: raw.sortOrder as number,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: raw.deletedAt as string | undefined,
  };
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
          };
          await db.inventoryLots.add(lot);

          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
          await syncQueue.enqueue('inventory_lots', 'CREATE', lot.id, toSnake(lot as unknown as Record<string, unknown>), tenantId);
        }

        await outboxService.enqueue('INVENTORY.CREATED', INVENTORY_MODULE, { productId: id, name: input.name, sku: input.sku, stockInicial });
      });

      await emitWithAudit('INVENTORY.CREATED', INVENTORY_MODULE, { productId: id, name: input.name, sku: input.sku, stockInicial }, { userId, tenantId });

      return success(product);
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en createProduct:', err);
      return failure(new AppError('PRODUCT_SKU_DUPLICATE', 'Error al crear producto. Verifica que el SKU no esté duplicado.'));
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
      stockType: 'shared';
      barcode?: string;
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

      await emitWithAudit('INVENTORY.CREATED', INVENTORY_MODULE, {
        productId, name: input.name, sku: input.sku,
        stockInicial: parentStock, presentationCount: presentations.length,
      }, { userId, tenantId });

      return success({
        product: toProduct(createdProduct as unknown as Record<string, unknown>),
        presentations: createdPresentations,
      });
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en createProductWithPresentations:', err);
      return failure(new AppError('PRODUCT_SKU_DUPLICATE', 'Error al crear producto con presentaciones. Verifica que el SKU no esté duplicado.'));
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
              await db.productPresentations.update(existingId, patchData as any);
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

              await db.productPresentations.add(record as any);
              await syncQueue.enqueue('product_presentations', 'CREATE', presId, toSnake(record), tenantId);
            }
          }
        }
      });
      await emitWithAudit('INVENTORY.UPDATED', INVENTORY_MODULE, { productId: id, changes: Object.keys(input) }, { tenantId });
      return success(toProduct(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en updateProduct:', err);
      return failure(new AppError('PRODUCT_SKU_DUPLICATE', 'Error al actualizar. Verifica que el SKU no esté duplicado.'));
    }
  },

  async getPresentationsForProduct(productId: string): Promise<Result<Presentation[], AppError>> {
    const db = getDb();
    try {
      const rows = await db.productPresentations
        .where({ productId })
        .filter((p) => !p.deletedAt)
        .sortBy('sortOrder');

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

      await emitWithAudit('INVENTORY.UPDATED', INVENTORY_MODULE, { presentationId, changes: Object.keys(input) }, { tenantId });
      return success(toPresentation(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en updatePresentation:', err);
      return failure(new AppError('PRODUCT_SKU_DUPLICATE', 'Error al actualizar presentación.'));
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

      await emitWithAudit('INVENTORY.UPDATED', INVENTORY_MODULE, { presentationId, action: 'deleted' }, { tenantId });
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
    const product = await db.products.get(id);
    if (!product) {
      return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
    }

    // Validar que no tenga stock > 0
    if (product.stock > 0) {
      return failure(new AppError('PRODUCT_HAS_STOCK', `No se puede eliminar: el producto tiene ${product.stock} unidades en inventario. Ajuste el stock a cero primero.`));
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
    await emitWithAudit('INVENTORY.DELETED', INVENTORY_MODULE, { productId: id, cascadePresentations: presentations.length }, { tenantId });
    return success(undefined);
  },

  async getProducts(tenantId: string, filters?: ProductFilters): Promise<Result<Product[], AppError>> {
    try {
      const db = getDb();

      const allLocal = await db.products.toArray();
      const hasCorrupted = allLocal.length > 0 && allLocal.every(r => !r.tenantId);
      if (hasCorrupted) {
        await db.products.clear();
      }

      const authIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
      const needsMigration = allLocal.some(r => !r.deletedAt && r.tenantId && r.tenantId !== tenantId);
      if (needsMigration) {
        for (const r of allLocal) {
          if (r.deletedAt || !r.tenantId || r.tenantId === tenantId) continue;
          const otherIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.tenantId as string);
          if (authIsUuid !== otherIsUuid) {
            await db.products.update(r.id!, { tenantId });
          }
        }
      }

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
          .is('deleted_at', null);

        if (!error && data && data.length > 0) {
          try {
            const [lotsResponse, presResponse] = await Promise.all([
              supabase.from('inventory_lots').select('*').in('product_id', data.map((p: Record<string, unknown>) => p.id)),
              supabase.from('product_presentations').select('*').in('product_id', data.map((p: Record<string, unknown>) => p.id)).is('deleted_at', null)
            ]);

            const lots = lotsResponse.data;
            const presData = presResponse.data;

            await db.transaction('rw', [db.products, db.inventoryLots, db.productPresentations], async () => {
              for (const prod of data) {
                await db.products.put({
                  id: prod.id, tenantId,
                  name: prod.name, sku: prod.sku,
                  priceUsd: prod.price_usd,
                  categoryId: prod.category_id,
                  isWeighted: prod.is_weighted,
                  isTaxable: prod.is_taxable !== undefined ? !!prod.is_taxable : true,
                  isSellable: prod.is_sellable !== undefined ? !!prod.is_sellable : true,
                  unit: prod.unit,
                  stock: prod.stock,
                  stockMin: prod.stock_min,
                  imageUrl: prod.image_url,
                  costPrice: prod.cost_price,
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
        .toArray();

      let products = rows.map((r) => toProduct(r as unknown as Record<string, unknown>));

      if (filters?.query) {
        const q = filters.query.toLowerCase();
        products = products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
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

  async getProductById(id: string): Promise<Result<Product, AppError>> {
    const db = getDb();
    const product = await db.products.get(id);
    if (!product || product.deletedAt) {
      return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
    }
    return success(toProduct(product as unknown as Record<string, unknown>));
  },

  async createCategory(input: { name: string; tenantId: string }): Promise<Result<Category, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();
    const id = generateId();
    const cat = { id, name: input.name, tenantId: input.tenantId };
    await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
      await db.categories.add(cat);
      await syncQueue.enqueue('categories', 'CREATE', id, { id, name: input.name }, input.tenantId);
      await outboxService.enqueue('INVENTORY.CREATED', INVENTORY_MODULE, { categoryId: id, name: input.name });
    });
    await emitWithAudit('INVENTORY.CREATED', INVENTORY_MODULE, { categoryId: id, name: input.name }, { tenantId: input.tenantId });
    return success(toCategory(cat as unknown as Record<string, unknown>));
  },

  async updateCategory(id: string, name: string, tenantId: string): Promise<Result<Category, AppError>> {
    const networkCheck = requireNetwork();
    if (!networkCheck.ok) return failure(networkCheck.error);
    const db = getDb();
    const updated = { name };
    await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
      await db.categories.update(id, updated);
      await syncQueue.enqueue('categories', 'UPDATE', id, { id, name }, tenantId);
      await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { categoryId: id, name });
    });
    await emitWithAudit('INVENTORY.UPDATED', INVENTORY_MODULE, { categoryId: id, name }, { tenantId });
    return success({ id, name });
  },

  async getCategories(tenantId: string): Promise<Result<Category[], AppError>> {
    const db = getDb();
    let rows = await db.categories
      .where({ tenantId })
      .filter((c) => !c.deletedAt)
      .toArray();

    // If local is empty, try pulling from Supabase filtering by tenant UUID
    if (rows.length === 0) {
      const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('tenant_id', tenantUuid)
        .is('deleted_at', null);

      if (!error && data && data.length > 0) {
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

    return success(rows.map((r) => toCategory(r as unknown as Record<string, unknown>)));
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
    await emitWithAudit('INVENTORY.DELETED', INVENTORY_MODULE, { categoryId: id }, { tenantId });
    return success(undefined);
  },

  async adjustStock(input: AdjustStockInput & { userId: string; tenantId: string }): Promise<Result<InventoryMovement, AppError>> {
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
    const product = await db.products.get(input.productId);
    if (!product || product.deletedAt) {
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
 
        if (storageQuantity > 0) {
          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), input.tenantId);
        } else {
          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), input.tenantId);
        }

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

      await emitWithAudit('INVENTORY.ADJUSTMENT', INVENTORY_MODULE, {
        productId: input.productId, quantity: input.quantity, reasonType: input.reasonType,
        previousStock, newStock, costUsd: movementCostUsd,
      }, { userId: input.userId, tenantId: input.tenantId });

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
      return failure(new AppError('INVENTORY_STOCK_INSUFFICIENT', 'Error al ajustar stock. Verifica el stock disponible.'));
    }
  },

  async getProductLots(productId: string): Promise<Result<ActiveLot[], AppError>> {
    const db = getDb();

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

    try {
      const db = getDb();
      const oldProduct = await db.products.get(productId);
      if (oldProduct?.imageUrl) {
        await imageCacheService.invalidate(oldProduct.imageUrl);
        await deleteStorageImage(oldProduct.imageUrl, token);
      }
      await db.products.update(productId, { imageUrl: publicUrl });

      const restUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/products?id=eq.${productId}`;
      await fetch(restUrl, {
        method: 'PATCH',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_url: publicUrl }),
      });

      const dbItem = await db.products.get(productId);
      if (dbItem) {
        await syncQueue.enqueue('products', 'UPDATE', productId, toSnake({ ...dbItem, image_url: publicUrl } as unknown as Record<string, unknown>), tenantId);
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
        const local = {
          id: data.id as string,
          tenantId,
          name: data.name as string,
          sku: data.sku as string,
          priceUsd: data.price_usd as number,
          categoryId: data.category_id as string | undefined,
          isWeighted: data.is_weighted as boolean,
          isTaxable: data.is_taxable !== undefined ? !!data.is_taxable : true,
          isSellable: data.is_sellable !== undefined ? !!data.is_sellable : true,
          unit: data.unit as Product['unit'],
          stock: data.stock as number,
          stockMin: data.stock_min as number | undefined,
          imageUrl: data.image_url as string | undefined,
          costPrice: data.cost_price as number | undefined,
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
    const db = getDb();
    const lots = await db.inventoryLots
      .where({ productId })
      .filter((l) => !l.deletedAt && l.remainingQuantity > 0)
      .sortBy('createdAt');

    let toConsume = quantity;
    const consumed: Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }> = [];

    for (const lot of lots) {
      if (toConsume <= 0) break;

      // Optimistic locking: re-read lot just before update and check version
      const currentLot = await db.inventoryLots.get(lot.id);
      if (!currentLot) continue;
      if (currentLot.version !== undefined && lot.version !== undefined && currentLot.version !== lot.version) {
        return failure(new AppError(InventoryErrors.INVENTORY_LOT_FIFO_CONFLICT, 'Conflicto en consumo FIFO. Reintente la operación.'));
      }

      const consumeQty = Math.min(currentLot.remainingQuantity, toConsume);
      const newRemaining = currentLot.remainingQuantity - consumeQty;
      const newVersion = (currentLot.version ?? 0) + 1;
      await db.inventoryLots.update(lot.id, { remainingQuantity: newRemaining, version: newVersion });
      await syncQueue.enqueue('inventory_lots', 'UPDATE', lot.id, toSnake({
        ...lot, remainingQuantity: newRemaining, version: newVersion,
      } as unknown as Record<string, unknown>), tenantId);

      consumed.push({ lotId: lot.id, quantity: consumeQty, costUsdPerUnit: lot.costUsdPerUnit });
      toConsume -= consumeQty;
    }

    if (toConsume > 0) {
      return failure(new AppError(InventoryErrors.INVENTORY_STOCK_INSUFFICIENT, 'Stock insuficiente para completar la operación.'));
    }

    return success(consumed);
  },

  async getMovementHistory(productId: string): Promise<Result<InventoryMovement[], AppError>> {
    const db = getDb();
    let rows = await db.inventoryMovements
      .where({ productId })
      .filter((m) => !m.deletedAt)
      .sortBy('createdAt');

    // If local is empty, try pulling from Supabase
    if (rows.length === 0) {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('product_id', productId);

      if (!error && data && data.length > 0) {
        for (const mov of data) {
          await db.inventoryMovements.add({
            id: mov.id, tenantId: '',
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

    return success(rows.reverse().map((r) => toMovement(r as unknown as Record<string, unknown>)));
  },

  async getLowStockProducts(tenantId: string): Promise<Result<Product[], AppError>> {
    const db = getDb();
    let rows = await db.products
      .where({ tenantId })
      .filter((p) => !p.deletedAt && p.stockMin !== undefined && p.stockMin > 0)
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
          for (const prod of data) {
            if (isDbClosing()) break;
            await db.products.put({
              id: prod.id, tenantId,
              name: prod.name, sku: prod.sku,
              priceUsd: prod.price_usd,
              categoryId: prod.category_id,
              isWeighted: prod.is_weighted,
              isTaxable: prod.is_taxable !== undefined ? !!prod.is_taxable : true,
              isSellable: prod.is_sellable !== undefined ? !!prod.is_sellable : true,
              unit: prod.unit,
              stock: prod.stock,
              stockMin: prod.stock_min,
            });
          }
        } catch {
          // DB cerrada durante shutdown, ignorar
        }

        rows = await db.products
          .where({ tenantId })
          .filter((p) => !p.deletedAt && p.stockMin !== undefined && p.stockMin > 0)
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
