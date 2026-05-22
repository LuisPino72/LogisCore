import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId } from '@logiscore/shared';
import { getDb, isDbClosing } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { InventoryErrors } from '../../../specs/inventory/errors';
import imageCompression from 'browser-image-compression';
import { imageCacheService } from '../../../services/imageCache/imageCacheService';
import type { Product, Category, InventoryMovement, CreateProductInput, AdjustStockInput, ProductFilters, ActiveLot, MovementRow } from '../types';
import { convertToStorage } from '../types';

const INVENTORY_MODULE = 'INVENTORY';

function toProduct(raw: Record<string, unknown>): Product {
  return {
    id: raw.id as string,
    name: raw.name as string,
    sku: raw.sku as string,
    priceUsd: raw.priceUsd as number,
    categoryId: raw.categoryId as string | undefined,
    isWeighted: raw.isWeighted as boolean,
    isTaxable: raw.isTaxable !== undefined ? !!raw.isTaxable : true,
    isSellable: raw.isSellable !== undefined ? !!raw.isSellable : true,
    unit: raw.unit as Product['unit'],
    stock: raw.stock as number,
    stockMin: raw.stockMin as number | undefined,
    imageUrl: raw.imageUrl as string | undefined,
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
  };
}

export const inventoryService = {
  async createProduct(
    tenantId: string,
    userId: string,
    input: CreateProductInput & { stockInicial?: number },
  ): Promise<Result<Product, AppError>> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    const stockInicial = input.stockInicial && input.stockInicial > 0
      ? convertToStorage(input.stockInicial, input.isWeighted ? (input.unit === 'lt' ? 'pesable_lt' : 'pesable_kg') : 'unidad')
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
      stockMin: input.stockMin,
    };

    try {
      await db.transaction('rw', [db.products, db.inventoryMovements, db.inventoryLots, db.syncQueue, db.outbox], async () => {
        await db.products.add({ ...product, tenantId });

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
            costUsdPerUnit: input.priceUsd,
            sourceMovementId: movementId,
            createdAt: now,
            updatedAt: now,
          };
          await db.inventoryLots.add(lot);

          await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), tenantId);
          await syncQueue.enqueue('inventory_lots', 'CREATE', lot.id, toSnake(lot as unknown as Record<string, unknown>), tenantId);
        }

        await syncQueue.enqueue('products', 'CREATE', id, toSnake(product as unknown as Record<string, unknown>), tenantId);

        await outboxService.enqueue('INVENTORY.CREATED', INVENTORY_MODULE, { productId: id, name: input.name, sku: input.sku, stockInicial });
      });

      await emitWithAudit('INVENTORY.CREATED', INVENTORY_MODULE, { productId: id, name: input.name, sku: input.sku, stockInicial }, { userId, tenantId });

      return success(product);
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en createProduct:', err);
      return failure(new AppError('PRODUCT_SKU_DUPLICATE', 'Error al crear producto. Verifica que el SKU no esté duplicado.'));
    }
  },

  async updateProduct(id: string, input: Partial<Product>, tenantId: string): Promise<Result<Product, AppError>> {
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
      const safeInput = { ...input as Record<string, unknown> };
      delete safeInput.stockInicial;
      const updated = { ...existing, ...safeInput };
      await db.transaction('rw', [db.products, db.syncQueue, db.outbox], async () => {
        await db.products.put(updated);
        await syncQueue.enqueue('products', 'UPDATE', id, toSnake(updated as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { productId: id, changes: Object.keys(input) });
      });
      await emitWithAudit('INVENTORY.UPDATED', INVENTORY_MODULE, { productId: id, changes: Object.keys(input) }, { tenantId });
      return success(toProduct(updated as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error(INVENTORY_MODULE, 'Error en updateProduct:', err);
      return failure(new AppError('PRODUCT_SKU_DUPLICATE', 'Error al actualizar. Verifica que el SKU no esté duplicado.'));
    }
  },

  async softDeleteProduct(id: string, tenantId: string): Promise<Result<void, AppError>> {
    const db = getDb();
    const product = await db.products.get(id);
    if (!product) {
      return failure(new AppError(InventoryErrors.PRODUCT_NOT_FOUND, 'Producto no encontrado.'));
    }
    const deletedAt = new Date().toISOString();
    await db.transaction('rw', [db.products, db.syncQueue, db.outbox], async () => {
      await db.products.update(id, { deletedAt });
      await syncQueue.enqueue('products', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
      await outboxService.enqueue('INVENTORY.DELETED', INVENTORY_MODULE, { productId: id });
    });
    await emitWithAudit('INVENTORY.DELETED', INVENTORY_MODULE, { productId: id }, { tenantId });
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

      let rows = await db.products
        .where({ tenantId })
        .filter((p) => !p.deletedAt)
        .toArray();

      if (rows.length === 0) {
        if (isDbClosing()) return success([]);

        const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantUuid)
          .is('deleted_at', null);

        if (!error && data && data.length > 0) {
          // Wrap bulk seed en transacción para evitar estado parcial si la DB se cierra
          try {
            await db.transaction('rw', [db.products, db.inventoryLots], async () => {
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
                });
              }

              if (isDbClosing()) return;

              const { data: lots } = await supabase
                .from('inventory_lots')
                .select('*')
                .in('product_id', data.map((p: Record<string, unknown>) => p.id));

              if (lots && lots.length > 0) {
                for (const lot of lots) {
                  if (isDbClosing()) return;
                  await db.inventoryLots.put({
                    id: lot.id, tenantId,
                    productId: lot.product_id,
                    quantityAdded: lot.quantity_added,
                    remainingQuantity: lot.remaining_quantity,
                    sourceMovementId: lot.source_movement_id,
                    createdAt: lot.created_at,
                    updatedAt: lot.updated_at ?? lot.created_at,
                  });
                }
              }
            });
          } catch {
            // Si la transacción falla (ej. DB cerrada), simplemente retornamos vacío
            return success([]);
          }

          // re-query Dexie after population
          rows = await db.products
            .where({ tenantId })
            .filter((p) => !p.deletedAt)
            .toArray();
        }
      }

      let products = rows.map((r) => toProduct(r as unknown as Record<string, unknown>));

      if (filters?.query) {
        const q = filters.query.toLowerCase();
        products = products.filter(
          (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
        );
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
    if (!input.reason || input.reason.trim().length === 0) {
      return failure(new AppError('INVENTORY_ADJUSTMENT_INVALID', 'El ajuste debe incluir un motivo.'));
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
      const movement = {
        id: movementId,
        tenantId: input.tenantId,
        productId: input.productId,
        userId: input.userId,
        type: 'adjustment' as const,
        quantity: storageQuantity,
        previousStock,
        newStock,
        reason: input.reason,
        createdAt: now,
      };
 
      await db.transaction('rw', [db.products, db.inventoryMovements, db.inventoryLots, db.syncQueue, db.outbox], async () => {
        await db.products.update(input.productId, { stock: newStock });
        await db.inventoryMovements.add(movement);
 
        if (storageQuantity > 0) {
          const lotId = generateId();
          // Usar costo explícito si se provee, o último costo conocido del producto
          const lotCost = input.costUsdPerUnit ?? await (async () => {
            const lots = await db.inventoryLots
              .where({ productId: input.productId })
              .filter((l) => l.costUsdPerUnit !== undefined && l.costUsdPerUnit! > 0)
              .sortBy('createdAt');
            return lots.length > 0 ? lots[lots.length - 1].costUsdPerUnit : undefined;
          })();
          const lot = {
            id: lotId,
            tenantId: input.tenantId,
            productId: input.productId,
            quantityAdded: storageQuantity,
            remainingQuantity: storageQuantity,
            costUsdPerUnit: lotCost,
            sourceMovementId: movementId,
            createdAt: now,
            updatedAt: now,
          };
          await db.inventoryLots.add(lot);
          await syncQueue.enqueue('inventory_lots', 'CREATE', lotId, toSnake(lot as unknown as Record<string, unknown>), input.tenantId);
        } else {
          const fifoResult = await this.consumeFifo(input.productId, Math.abs(storageQuantity), input.tenantId);
          if (!fifoResult.ok) throw new AppError('INVENTORY_STOCK_INSUFFICIENT', 'Stock insuficiente para completar el ajuste.');
        }

        // Enqueue product update so stock syncs to Supabase
        const updatedProduct = await db.products.get(input.productId);
        if (updatedProduct) {
          await syncQueue.enqueue('products', 'UPDATE', input.productId, toSnake(updatedProduct as unknown as Record<string, unknown>), input.tenantId);
        }
        await syncQueue.enqueue('inventory_movements', 'CREATE', movementId, toSnake(movement as unknown as Record<string, unknown>), input.tenantId);

        await outboxService.enqueue('INVENTORY.ADJUSTMENT', INVENTORY_MODULE, {
          productId: input.productId, quantity: input.quantity, reason: input.reason,
          previousStock, newStock,
        });
      });

      await emitWithAudit('INVENTORY.ADJUSTMENT', INVENTORY_MODULE, {
        productId: input.productId, quantity: input.quantity, reason: input.reason,
        previousStock, newStock,
      }, { userId: input.userId, tenantId: input.tenantId });

      return success(toMovement(movement as unknown as Record<string, unknown>));
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
      quantityAdded: l.quantityAdded,
      remainingQuantity: l.remainingQuantity,
      costUsdPerUnit: l.costUsdPerUnit,
    })));
  },

  async getProductMovements(productId: string): Promise<Result<MovementRow[], AppError>> {
    const db = getDb();
    const rows = await db.inventoryMovements
      .where({ productId })
      .sortBy('createdAt');

    if (rows.length === 0) return success([]);

    const movements: MovementRow[] = [];
    let balance = rows[0].previousStock;

    // Primer fila: estado inicial
    movements.push({
      date: rows[0].createdAt,
      type: 'initial',
      entry: 0,
      exit: 0,
      balance,
      reason: 'Stock inicial',
    });

    for (const mov of rows) {
      const isPositive = mov.quantity > 0;
      const entry = isPositive ? Math.abs(mov.quantity) : 0;
      const exit_ = isPositive ? 0 : Math.abs(mov.quantity);
      balance = mov.newStock;

      const typeLabel = mov.type === 'sale' ? 'sale'
        : mov.type === 'purchase' ? 'purchase'
        : 'adjustment';

      movements.push({
        date: mov.createdAt,
        type: typeLabel,
        entry,
        exit: exit_,
        balance,
        reason: mov.reason ?? undefined,
      });
    }

    return success(movements);
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
        useWebWorker: true,
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
    const product = await db.products
      .where({ tenantId })
      .filter((p) => !p.deletedAt && p.sku === sku)
      .first();
    if (product) return success(toProduct(product as unknown as Record<string, unknown>));

    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('sku', sku)
      .is('deleted_at', null)
      .maybeSingle();
    if (data) return success(toProduct(data as unknown as Record<string, unknown>));
    return success(null);
  },

  async consumeFifo(productId: string, quantity: number, tenantId: string): Promise<Result<Array<{ lotId: string; quantity: number; costUsdPerUnit?: number }>, AppError>> {
    const db = getDb();
    const lots = await db.inventoryLots
      .where({ productId })
      .filter((l) => l.remainingQuantity > 0)
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
      return displayStock <= p.stockMin!;
    });
    return success(lowStock.map((r) => toProduct(r as unknown as Record<string, unknown>)));
  },
};
