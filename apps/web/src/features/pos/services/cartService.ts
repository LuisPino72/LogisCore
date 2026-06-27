import { type Result, success, failure, AppError } from '@logiscore/core';
import { generateId } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { logger } from '../../../lib/logger';
import { MAX_PARKED_CARTS } from '../../../specs/pos';
import type { CartItem, ParkedCart } from '../types';

const MODULE_NAME = 'POS';

export async function getParkedCarts(tenantId: string): Promise<Result<ParkedCart[], AppError>> {
  try {
    const db = getDb();
    const rows = await db.parkedCarts
      .where({ tenantId })
      .sortBy('createdAt');
    const result: ParkedCart[] = [];
    for (const r of rows) {
      try {
        result.push({
          id: r.id,
          tenantId: r.tenantId,
          name: r.name,
          cart: JSON.parse(r.cartJson) as CartItem[],
          customerId: r.customerId,
          createdAt: r.createdAt,
          orderType: r.orderType,
          needsKitchen: r.needsKitchen,
        });
      } catch (err) {
        logger.warn(MODULE_NAME, `parkedCart ${r.id} tiene cartJson corrupto, se omite:`, err);
      }
    }
    return success(result);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getParkedCarts:', err);
    return failure(new AppError('PARKED_CARTS_FETCH_FAILED', 'Error al cargar ventas en cola.'));
  }
}

export async function parkCart(
  tenantId: string,
  name: string,
  cart: CartItem[],
  customerId?: string,
  deliveryInfo?: { orderType?: 'dine-in' | 'delivery'; needsKitchen?: boolean },
): Promise<Result<string, AppError>> {
  try {
    const db = getDb();
    const existingCount = await db.parkedCarts.where({ tenantId }).count();
    if (existingCount >= MAX_PARKED_CARTS) {
      return failure(new AppError('PARKED_CART_MAX_REACHED', `Máximo ${MAX_PARKED_CARTS} ventas en cola. Completa o elimina una.`));
    }
    const id = generateId();
    await db.parkedCarts.add({
      id, tenantId,
      name: name.trim() || `Venta #${existingCount + 1}`,
      cartJson: JSON.stringify(cart),
      customerId,
      createdAt: new Date().toISOString(),
      orderType: deliveryInfo?.orderType,
      needsKitchen: deliveryInfo?.needsKitchen,
    });
    return success(id);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en parkCart:', err);
    return failure(new AppError('PARKED_CART_SAVE_FAILED', 'Error al guardar venta en cola.'));
  }
}

export async function deleteParkedCart(tenantId: string, id: string): Promise<Result<void, AppError>> {
  try {
    const db = getDb();
    const existing = await db.parkedCarts.get(id);
    if (!existing || existing.tenantId !== tenantId) {
      return failure(new AppError('PARKED_CART_NOT_FOUND', 'Venta en cola no encontrada.'));
    }
    await db.parkedCarts.delete(id);
    return success(undefined);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en deleteParkedCart:', err);
    return failure(new AppError('PARKED_CART_DELETE_FAILED', 'Error al eliminar venta en cola.'));
  }
}

export async function toggleFavorite(tenantId: string, productId: string): Promise<Result<boolean, AppError>> {
  try {
    const db = getDb();
    const existing = await db.productFavorites.get([productId, tenantId]);
    if (existing) {
      await db.productFavorites.delete([productId, tenantId]);
      return success(false);
    }
    await db.productFavorites.add({ productId, tenantId, createdAt: new Date().toISOString() });
    return success(true);
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en toggleFavorite:', err);
    return failure(new AppError('FAVORITE_TOGGLE_FAILED', 'Error al cambiar favorito.'));
  }
}

export async function getFavorites(tenantId: string): Promise<Result<Set<string>, AppError>> {
  try {
    const db = getDb();
    const favs = await db.productFavorites.where({ tenantId }).toArray();
    return success(new Set(favs.map((f) => f.productId)));
  } catch (err) {
    logger.error(MODULE_NAME, 'Error en getFavorites:', err);
    return failure(new AppError('FAVORITES_FETCH_FAILED', 'Error al cargar favoritos.'));
  }
}
