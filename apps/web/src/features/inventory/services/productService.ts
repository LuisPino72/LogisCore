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
import type { Product, CreateProductInput, ProductFilters, Presentation, CreatePresentationInput } from '../types';
import { convertToStorage, unitToStorageType } from '../types';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useAuthStore } from '../../auth/stores/authStore';
import { toProduct, toPresentation } from './mappers';
import { CreateProductInputSchema } from '../../../specs/inventory';

const INVENTORY_MODULE = 'INVENTORY';

function mapProductError(err: unknown, operation: 'create' | 'createWithPres' | 'update'): AppError {
  const e = err as { name?: string; message?: string } | null;
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

export async function createProduct(
  tenantId: string,
  userId: string,
  input: CreateProductInput & { stockInicial?: number },
): Promise<Result<Product, AppError>> {
  const _createProdSession = useAuthStore.getState().session;
  if (!_createProdSession || !hasActionPermission(_createProdSession, 'inventory', 'create')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
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
    ? convertToStorage(input.stockInicial, unitToStorageType(input.isWeighted, input.unit))
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
      ? convertToStorage(input.stockMin, unitToStorageType(input.isWeighted, input.unit))
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
          costUsd: input.costPrice ?? undefined,
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
    return failure(mapProductError(err, 'create'));
  }
}

export async function createProductWithPresentations(
  tenantId: string,
  userId: string,
  input: CreateProductInput & { stockInicial?: number },
  presentations: CreatePresentationInput[],
): Promise<Result<{ product: Product; presentations: Presentation[] }, AppError>> {
  const _createPresSession = useAuthStore.getState().session;
  if (!_createPresSession || !hasActionPermission(_createPresSession, 'inventory', 'create')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  if (!presentations.length) {
    return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, 'Debe agregar al menos una presentación.'));
  }

  const names = presentations.map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    return failure(new AppError(InventoryErrors.PRESENTATION_NAME_REQUIRED, 'No puede haber dos presentaciones con el mismo nombre.'));
  }

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
    ? convertToStorage(input.stockInicial, unitToStorageType(input.isWeighted, input.unit))
    : 0;

  const presentationRecords: Array<{
    id: string;
    tenantId: string;
    productId: string;
    name: string;
    priceUsd: number;
    unitMultiplier: number;
    stockType: 'shared';
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
        ? convertToStorage(input.stockMin, unitToStorageType(input.isWeighted, input.unit))
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
          costUsd: input.costPrice ?? undefined,
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
    return failure(mapProductError(err, 'createWithPres'));
  }
}

export async function updateProduct(id: string, input: Partial<Product>, tenantId: string): Promise<Result<Product, AppError>> {
  const _updateProdSession = useAuthStore.getState().session;
  if (!_updateProdSession || !hasActionPermission(_updateProdSession, 'inventory', 'update')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  const db = getDb();
  try {
    const existing = await db.products.where({ id, tenantId }).first();
    if (!existing) {
      return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
    }

    if (input.sku && input.sku !== existing.sku) {
      const duplicate = await db.products
        .where({ tenantId })
        .filter((p) => p.sku === input.sku && p.id !== id && !p.deletedAt)
        .first();
      if (duplicate) {
        return failure(new AppError('PRODUCT_SKU_DUPLICATE', 'El SKU ya está asignado a otro producto.'));
      }
    }

    const rawInput = input as Record<string, unknown>;
    const presentationsInput = rawInput.presentations as CreatePresentationInput[] | undefined;

    const safeInput = { ...rawInput };
    delete safeInput.stockInicial;
    delete safeInput.presentations;
    delete safeInput.stockType;
    if (safeInput.stockMin !== undefined && existing.isWeighted) {
      safeInput.stockMin = convertToStorage(
        safeInput.stockMin as number,
        unitToStorageType(existing.isWeighted, existing.unit),
      );
    }
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

        const deletedAt = new Date().toISOString();
        for (const existingPresItem of existingPres) {
          if (!submittedIds.has(existingPresItem.id)) {
            await db.productPresentations.update(existingPresItem.id, { deletedAt });
            await syncQueue.enqueue('product_presentations', 'DELETE', existingPresItem.id, { id: existingPresItem.id, deleted_at: deletedAt }, tenantId);
          }
        }

        const now = new Date().toISOString();
        for (let i = 0; i < presentationsInput.length; i++) {
          const pres = presentationsInput[i];
          const presRaw = pres as Record<string, unknown>;
          const existingId = presRaw.id as string | undefined;

          if (existingId && existingPresMap.has(existingId)) {
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
    return failure(mapProductError(err, 'update'));
  }
}

export async function getProducts(tenantId: string, filters?: ProductFilters, pagination?: { limit?: number; offset?: number }): Promise<Result<Product[], AppError>> {
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
}

export async function getProductById(tenantId: string, id: string): Promise<Result<Product, AppError>> {
  const db = getDb();
  const product = await db.products.where({ tenantId, id }).first();
  if (!product || product.deletedAt) {
    return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
  }
  return success(toProduct(product as unknown as Record<string, unknown>));
}

export async function softDeleteProduct(id: string, tenantId: string): Promise<Result<void, AppError>> {
  const _deleteProdSession = useAuthStore.getState().session;
  if (!_deleteProdSession || !hasActionPermission(_deleteProdSession, 'inventory', 'delete')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
  const networkCheck = requireNetwork();
  if (!networkCheck.ok) return failure(networkCheck.error);

  const db = getDb();
  const product = await db.products
    .where({ tenantId, id })
    .filter((p) => !p.deletedAt)
    .first();
  if (!product) {
    return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
  }

  if (product.stock > 0) {
    return failure(new AppError(InventoryErrors.PRODUCT_HAS_STOCK, `No se puede eliminar: el producto tiene ${product.stock} unidades en inventario. Ajuste el stock a cero primero.`));
  }

  const orderItems = await db.purchaseOrderItems.where({ productId: id }).toArray();
  if (orderItems.length > 0) {
    const orderIds = [...new Set(orderItems.map(i => i.orderId))];
    const blockingOrders = await db.purchaseOrders
      .where('id')
      .anyOf(orderIds)
      .filter(o => !o.deletedAt && (o.status === 'draft' || o.status === 'confirmed' || o.status === 'partially_received'))
      .count();
    if (blockingOrders > 0) {
      return failure(new AppError('PRODUCT_HAS_ACTIVE_ORDERS', `No se puede eliminar: el producto está en ${blockingOrders} orden${blockingOrders !== 1 ? 'es' : ''} de compra activa${blockingOrders !== 1 ? 's' : ''}.`));
    }
  }

  const activeLots = await db.inventoryLots
    .where({ tenantId, productId: id })
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

  const presentations = await db.productPresentations
    .where({ productId: id })
    .filter((p) => !p.deletedAt)
    .toArray();

  const deletedAt = new Date().toISOString();

  Promise.resolve().then(async () => {
    const p = await db.products.where({ id, tenantId }).first();
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
}

export async function uploadProductImage(file: File, tenantId: string, productId: string): Promise<Result<string, AppError>> {
  const _uploadImgSession = useAuthStore.getState().session;
  if (!_uploadImgSession || !hasActionPermission(_uploadImgSession, 'inventory', 'update')) {
    return failure(new AppError('AUTH_SCOPE_DENIED', 'No tienes permisos para esta acción.'));
  }
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
    const oldProduct = await db.products.where({ id: productId, tenantId }).first();
    if (oldProduct?.imageUrl) {
      await imageCacheService.invalidate(oldProduct.imageUrl);
      await deleteStorageImage(oldProduct.imageUrl, token);
    }
    await db.transaction('rw', [db.products, db.syncQueue], async () => {
      await db.products.update(productId, { imageUrl: publicUrl });
      const dbItem = await db.products.where({ id: productId, tenantId }).first();
      if (dbItem) {
        await syncQueue.enqueue('products', 'UPDATE', productId, toSnake({ ...dbItem, image_url: publicUrl } as unknown as Record<string, unknown>), tenantId);
      }
    });
  } catch (err) {
    logger.error('uploadProductImage', 'DB update error:', err);
  }

  return success(publicUrl);
}

export async function getProductBySku(sku: string, tenantId: string): Promise<Result<Product | null, AppError>> {
  const db = getDb();

  const product = await db.products
    .where({ tenantId })
    .filter((p) => !p.deletedAt && p.sku === sku)
    .first();
  if (product) return success(toProduct(product as unknown as Record<string, unknown>));

  const presentation = await db.productPresentations
    .where({ tenantId })
    .filter((p) => !p.deletedAt && p.barcode === sku)
    .first();
  if (presentation) {
    const parentProduct = await db.products.where({ id: presentation.productId, tenantId }).first();
    if (parentProduct && !parentProduct.deletedAt) {
      return success(toProduct(parentProduct as unknown as Record<string, unknown>));
    }
  }

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
}
