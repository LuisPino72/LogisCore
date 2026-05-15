import { type Result, success, failure, AppError } from '@logiscore/core';
import { toSnake, generateId } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { outboxService } from '../../../services/outbox/outboxService';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../lib/logger';
import { InventoryErrors } from '../../../specs/inventory/errors';
import type { Product, Category, InventoryMovement, CreateProductInput, AdjustStockInput, ProductFilters, ActiveLot, MovementRow } from '../types';
import { convertToStorage } from '../types';

const INVENTORY_MODULE = 'INVENTORY';

async function getTenantUuid(tenantSlug: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantSlug)) {
    return tenantSlug;
  }
  const db = getDb();
  const ref = await db.tenantRefs.get(tenantSlug);
  if (ref?.id) return ref.id;
  const { data } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).single();
  if (data) return data.id as string;
  return tenantSlug;
}

function toProduct(raw: Record<string, unknown>): Product {
  return {
    id: raw.id as string,
    name: raw.name as string,
    sku: raw.sku as string,
    priceUsd: raw.priceUsd as number,
    categoryId: raw.categoryId as string | undefined,
    isWeighted: raw.isWeighted as boolean,
    isTaxable: raw.isTaxable !== undefined ? !!raw.isTaxable : true,
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
    slug: raw.slug as string,
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
            sourceMovementId: movementId,
            createdAt: now,
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
    } catch {
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
      const cleanInput = input as Record<string, unknown>;
      const updated = { ...existing, ...cleanInput };
      await db.transaction('rw', [db.products, db.syncQueue, db.outbox], async () => {
        await db.products.put(updated);
        await syncQueue.enqueue('products', 'UPDATE', id, toSnake(updated as unknown as Record<string, unknown>), tenantId);
        await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { productId: id, changes: Object.keys(input) });
      });
      await emitWithAudit('INVENTORY.UPDATED', INVENTORY_MODULE, { productId: id, changes: Object.keys(input) }, { tenantId });
      return success(toProduct(updated as unknown as Record<string, unknown>));
    } catch {
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
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .is('deleted_at', null);

        if (!error && data && data.length > 0) {
          for (const prod of data) {
            await db.products.put({
              id: prod.id, tenantId,
              name: prod.name, sku: prod.sku,
              priceUsd: prod.price_usd,
              categoryId: prod.category_id,
              isWeighted: prod.is_weighted,
              isTaxable: prod.is_taxable !== undefined ? !!prod.is_taxable : true,
              unit: prod.unit,
              stock: prod.stock,
              stockMin: prod.stock_min,
            });
          }

          // Also pull inventory_lots so FIFO consumption works
          const { data: lots } = await supabase
            .from('inventory_lots')
            .select('*')
            .in('product_id', data.map((p: Record<string, unknown>) => p.id));

          if (lots && lots.length > 0) {
            for (const lot of lots) {
              await db.inventoryLots.put({
                id: lot.id, tenantId,
                productId: lot.product_id,
                quantityAdded: lot.quantity_added,
                remainingQuantity: lot.remaining_quantity,
                sourceMovementId: lot.source_movement_id,
                createdAt: lot.created_at,
              });
            }
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
    } catch {
      return failure(new AppError('PRODUCT_NOT_FOUND', 'Error al cargar productos.'));
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
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const cat = { id, name: input.name, slug, tenantId: input.tenantId };
    await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
      await db.categories.add(cat);
      await syncQueue.enqueue('categories', 'CREATE', id, { id, name: input.name, slug }, input.tenantId);
      await outboxService.enqueue('INVENTORY.CREATED', INVENTORY_MODULE, { categoryId: id, name: input.name });
    });
    await emitWithAudit('INVENTORY.CREATED', INVENTORY_MODULE, { categoryId: id, name: input.name }, { tenantId: input.tenantId });
    return success(toCategory(cat as unknown as Record<string, unknown>));
  },

  async updateCategory(id: string, name: string, tenantId: string): Promise<Result<Category, AppError>> {
    const db = getDb();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const updated = { name, slug };
    await db.transaction('rw', [db.categories, db.syncQueue, db.outbox], async () => {
      await db.categories.update(id, updated);
      await syncQueue.enqueue('categories', 'UPDATE', id, { id, name, slug }, tenantId);
      await outboxService.enqueue('INVENTORY.UPDATED', INVENTORY_MODULE, { categoryId: id, name });
    });
    await emitWithAudit('INVENTORY.UPDATED', INVENTORY_MODULE, { categoryId: id, name }, { tenantId });
    return success({ id, name, slug });
  },

  async getCategories(tenantId: string): Promise<Result<Category[], AppError>> {
    const db = getDb();
    let rows = await db.categories
      .where({ tenantId })
      .filter((c) => !c.deletedAt)
      .toArray();

    // If local is empty, try pulling from Supabase
    if (rows.length === 0) {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .is('deleted_at', null);

      if (!error && data && data.length > 0) {
        for (const cat of data) {
          const localCat = {
            id: cat.id, tenantId,
            name: cat.name, slug: cat.slug,
          };
          await db.categories.put(localCat);
        }
        rows = data.map((d) => ({ id: d.id, name: d.name, slug: d.slug, tenantId }));
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
    await db.categories.update(id, { deletedAt });
    await syncQueue.enqueue('categories', 'DELETE', id, { id, deleted_at: deletedAt }, tenantId);
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
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB

    if (!ALLOWED_TYPES.includes(file.type)) {
      return failure(new AppError('INVENTORY_IMAGE_INVALID_TYPE', 'Formato no permitido. Usa JPG, PNG o WebP.'));
    }

    if (file.size > MAX_SIZE) {
      return failure(new AppError('INVENTORY_IMAGE_TOO_LARGE', 'La imagen no debe superar 2MB.'));
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const tenantUuid = await getTenantUuid(tenantId);
    const filePath = `${tenantUuid}/${productId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('products')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      logger.error('uploadProductImage', 'Storage error:', uploadError);
      return failure(new AppError('INVENTORY_IMAGE_UPLOAD_FAILED', 'Error al subir la imagen. Verifica permisos de Storage.'));
    }

    const { data: urlData } = supabase.storage.from('products').getPublicUrl(filePath);
    const publicUrl = urlData?.publicUrl ?? '';

    const db = getDb();
    await db.products.update(productId, { imageUrl: publicUrl });

    const dbItem = await db.products.get(productId);
    if (dbItem) {
      await syncQueue.enqueue('products', 'UPDATE', productId, toSnake({ ...dbItem, image_url: publicUrl } as unknown as Record<string, unknown>), tenantId);
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
    const rows = await db.products
      .where({ tenantId })
      .filter((p) => !p.deletedAt && p.stockMin !== undefined && p.stockMin > 0)
      .toArray();
    const lowStock = rows.filter((p) => {
      const displayStock = p.isWeighted
        ? (p.unit === 'kg' || p.unit === 'lt' ? p.stock / 1000 : p.stock)
        : p.stock;
      return displayStock <= p.stockMin!;
    });
    return success(lowStock.map((r) => toProduct(r as unknown as Record<string, unknown>)));
  },
};
