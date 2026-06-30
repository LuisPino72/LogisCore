import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { useAuthStore } from '../../auth/stores/authStore';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { usePosStore } from './posStore';
import type { CartItem, PresentationSelection } from '../types';
import type { Product } from '../../../specs/inventory';
import { displayQty, toDisplayValue } from '../../inventory/types';
import { recipeQtyToStorageBase } from '../../production/services/productionService';

export interface PosCartSlice {
  cart: CartItem[];
  searchQuery: string;
  discount: { type: 'percentage' | 'fixed'; value: number } | null;
  setSearchQuery: (query: string) => void;
  setDiscount: (type: 'percentage' | 'fixed', value: number) => void;
  clearDiscount: () => void;
  addToCart: (product: Product, quantity: number, presentation?: PresentationSelection) => Promise<boolean>;
  removeFromCart: (productId: string, presentationId?: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number, presentationId?: string) => Promise<void>;
  clearCart: () => void;
}

export const initialCartState = {
  cart: [] as CartItem[],
  searchQuery: '',
  discount: null as { type: 'percentage' | 'fixed'; value: number } | null,
};

async function validateAssemblyIngredients(
  recipeData: { lines: { productId: string; quantity: number; unit: string }[]; wastePct: number; yieldQuantity: number },
  product: { id: string; name: string },
  quantity: number,
): Promise<string | null> {
  const wasteMultiplier = 1 + (recipeData.wastePct / 100);
  const db = getDb();
  const session = useAuthStore.getState().session;
  const tenantId = session?.tenantId;

  async function checkIngredient(
    line: { productId: string; quantity: number; unit: string },
    parentName: string,
    currentQuantity: number,
    depth: number,
    yieldQty: number = recipeData.yieldQuantity,
  ): Promise<string | null> {
    if (depth > 5) return null;

    const ingredient = await db.products.where({ id: line.productId, tenantId }).first();
    if (!ingredient) {
      return `Stock insuficiente de ingrediente "Desconocido" para "${parentName}". Necesario: ${Math.ceil(line.quantity * currentQuantity * wasteMultiplier)}, Disponible: 0.`;
    }

    const neededInStorage = recipeQtyToStorageBase((line.quantity / yieldQty) * currentQuantity * wasteMultiplier, line.unit, ingredient.unit);
    const needed = Math.ceil(neededInStorage);

    const subRecipe = await db.recipes
      .where({ productId: line.productId, mode: 'assembly' as const })
      .filter(r => !r.deletedAt && r.isActive)
      .first();

    if (subRecipe) {
      if (ingredient.stock >= needed) {
        return null;
      }
      const subBatchEquivalent = needed / subRecipe.yieldQuantity;
      const subLines = await db.recipeLines
        .where({ recipeId: subRecipe.id })
        .filter(l => !l.deletedAt)
        .toArray();

      for (const subLine of subLines) {
        const error = await checkIngredient(subLine, ingredient.name, subBatchEquivalent, depth + 1, subRecipe.yieldQuantity);
        if (error) return error;
      }
      return null;
    }

    const lots = await db.inventoryLots
      .where({ productId: line.productId, tenantId })
      .filter(l => l.deletedAt == null && l.remainingQuantity > 0)
      .toArray();
    const lotsTotal = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
    const totalAvailable = lotsTotal > 0 ? lotsTotal : (ingredient.stock || 0);

    if (ingredient.deletedAt || totalAvailable < needed) {
      return `Stock insuficiente de ingrediente "${ingredient.name}" para "${parentName}". Necesario: ${needed}, Disponible: ${totalAvailable}.`;
    }
    return null;
  }

  for (const line of recipeData.lines) {
    const error = await checkIngredient(line, product.name, quantity, 0);
    if (error) return error;
  }
  return null;
}

type CartGetter = PosCartSlice & {
  products: Product[];
  assemblyRecipesMap: Record<string, { recipeId: string; wastePct: number; yieldQuantity: number; lines: Array<{ productId: string; quantity: number; unit: string }> }>;
  error: string | null;
};

export const createCartSlice = (set: (partial: Partial<CartGetter> | ((state: CartGetter) => Partial<CartGetter>)) => void, get: () => CartGetter): PosCartSlice => ({
  ...initialCartState,

  setSearchQuery: (query) => set({ searchQuery: query }),

  setDiscount: (type, value) => {
    if (value <= 0) return;
    const maxDiscountPct = useSettingsStore.getState().maxDiscountPct;
    if (type === 'percentage' && (value > maxDiscountPct || value < 0)) return;
    if (type === 'fixed') {
      const { cart } = get();
      const subtotalUsd = cart.reduce((sum, item) => sum + item.totalPriceUsd, 0);
      if (value > subtotalUsd) return;
      const pctOfSubtotal = subtotalUsd > 0 ? (value / subtotalUsd) * 100 : 0;
      if (pctOfSubtotal > maxDiscountPct) return;
    }
    set({ discount: { type, value } });
  },

  clearDiscount: () => {
    set({ discount: null });
  },

  addToCart: async (product, quantity, presentation?) => {
    const { cart } = get();
    set({ error: null });

    const rawPrice = presentation?.priceUsd ?? product.priceUsd;
    const priceUsd = Number(rawPrice);
    if (!priceUsd || priceUsd <= 0 || !Number.isFinite(priceUsd)) {
      set({ error: `El precio de "${product.name}" no es válido (${rawPrice}). Verifica el producto.` });
      return false;
    }

    if (presentation) {
      const totalConsumption = cart
        .filter((item) => item.productId === product.id)
        .reduce((sum, item) => sum + item.quantity * item.unitMultiplier, 0);
      const requestedConsumption = quantity * (presentation.unitMultiplier || 1);
      const isAssembly = product.hasAssemblyRecipe;
      const presSafeStock = typeof product.stock === 'number' && Number.isFinite(product.stock) ? product.stock : 0;
      if (!isAssembly && totalConsumption + requestedConsumption > presSafeStock) {
        const available = Math.floor((presSafeStock - totalConsumption) / presentation.unitMultiplier);
        set({ error: `Stock insuficiente. Disponible: ${Math.max(0, available)} unidades.` });
        return false;
      }

      if (isAssembly) {
        const recipeData = get().assemblyRecipesMap[product.id];
        if (recipeData) {
          const effectiveQty = quantity * (presentation.unitMultiplier || 1);
          const error = await validateAssemblyIngredients(recipeData, product, effectiveQty);
          if (error) {
            set({ error });
            return false;
          }
        }
      }

      const displayName = `${product.name} - ${presentation.name}`;
      const presUnitPrice = priceUsd;

      const existing = cart.find(
        (item) => item.productId === product.id && item.presentationId === presentation.id,
      );
      if (existing) {
        const newQty = existing.quantity + quantity;
        set({
          cart: cart.map((item) =>
            item.productId === product.id && item.presentationId === presentation.id
              ? {
                  ...item,
                  quantity: newQty,
                  totalPriceUsd: preciseRound(newQty * presUnitPrice, 2),
                }
              : item,
          ),
        });
      } else {
        set({
          cart: [
            ...cart,
            {
              productId: product.id,
              name: displayName,
              sku: product.sku,
              quantity,
              unitPriceUsd: presUnitPrice,
              totalPriceUsd: preciseRound(quantity * presUnitPrice, 2),
              isWeighted: false,
              isTaxable: product.isTaxable !== undefined ? product.isTaxable : true,
              unit: 'unidad',
              stock: presSafeStock,
              presentationId: presentation.id,
              presentationName: presentation.name,
              unitMultiplier: presentation.unitMultiplier || 1,
            },
          ],
        });
      }
      return true;
    }

    const currentQtyInCart = cart.find((item) => item.productId === product.id)?.quantity ?? 0;
    const totalRequested = currentQtyInCart + quantity;
    const isAssembly = product.hasAssemblyRecipe;
    const safeIsWeighted = product.isWeighted === true;
    const safeUnit = product.unit || 'unidad';
    const safeStock = typeof product.stock === 'number' && Number.isFinite(product.stock) ? product.stock : 0;

    const stockInDisplayUnits = toDisplayValue(safeStock, safeUnit);
    if (!isAssembly && totalRequested > stockInDisplayUnits) {
      const available = displayQty(safeStock, safeUnit);
      set({ error: `Stock insuficiente. Disponible: ${available}` });
      return false;
    }

    if (isAssembly) {
      const recipeData = get().assemblyRecipesMap[product.id];
      if (recipeData) {
        const error = await validateAssemblyIngredients(recipeData, product, totalRequested);
        if (error) {
          set({ error });
          return false;
        }
      }
    }

    const existing = cart.find((item) => item.productId === product.id);
    if (existing) {
      const foundProduct = get().products.find(p => p.id === product.id);
      const isAssemblyProd = foundProduct?.hasAssemblyRecipe;
      const maxQty = isAssemblyProd ? Infinity : toDisplayValue(safeStock, safeUnit);
      const newQty = Math.min(preciseRound(existing.quantity + quantity, 2), maxQty);
      set({
        cart: cart.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: newQty, totalPriceUsd: preciseRound(newQty * item.unitPriceUsd, 2) }
            : item,
        ),
      });
    } else {
      const isAssemblyProd = product.hasAssemblyRecipe;
      const maxQty = isAssemblyProd ? Infinity : toDisplayValue(safeStock, safeUnit);
      const finalQty = Math.min(quantity, maxQty);
      set({
        cart: [
          ...cart,
          {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            quantity: finalQty,
            unitPriceUsd: priceUsd,
            totalPriceUsd: preciseRound(finalQty * priceUsd, 2),
            isWeighted: safeIsWeighted,
            isTaxable: product.isTaxable !== undefined ? product.isTaxable : true,
            unit: safeUnit,
            stock: safeStock,
            unitMultiplier: 1,
          },
        ],
      });
    }
    return true;
  },

  removeFromCart: (productId, presentationId?) => {
    const next = presentationId
      ? get().cart.filter((item) => !(item.productId === productId && item.presentationId === presentationId))
      : get().cart.filter((item) => item.productId !== productId);
    set({ cart: next });
    if (next.length === 0) {
      usePosStore.setState({ selectedCustomerId: null, selectedCustomer: null, isCreditSale: false, discount: null });
    }
  },

  updateCartItemQuantity: async (productId, quantity, presentationId?) => {
    const cartItem = get().cart.find(item => item.productId === productId && (!presentationId || item.presentationId === presentationId));
    if (!cartItem) return;

    if (quantity <= 0) {
      get().removeFromCart(productId, presentationId);
      return;
    }

    let maxQty: number;
    if (cartItem.presentationId) {
      const product = get().products.find(p => p.id === productId);
      if (!product) { get().removeFromCart(productId, presentationId); return; }
      const isAssemblyProd = product.hasAssemblyRecipe;
      if (isAssemblyProd) {
        maxQty = Infinity;
      } else {
        const totalConsumption = get().cart
          .filter((item) => item.productId === productId && item.presentationId !== presentationId)
          .reduce((sum, item) => sum + item.quantity * item.unitMultiplier, 0);
        const availableBase = Math.max(0, product.stock - totalConsumption);
        maxQty = Math.floor(availableBase / (cartItem.unitMultiplier || 1));
      }
    } else {
      const product = get().products.find(p => p.id === productId);
      if (!product) { get().removeFromCart(productId, presentationId); return; }
      const isAssemblyProd = product.hasAssemblyRecipe;
      const safeStock = typeof product.stock === 'number' && Number.isFinite(product.stock) ? product.stock : 0;
      const safeUnit = product.unit || 'unidad';
      maxQty = isAssemblyProd ? Infinity : toDisplayValue(safeStock, safeUnit);
    }

    const product = get().products.find(p => p.id === productId);
    if (product?.hasAssemblyRecipe) {
      const recipeData = get().assemblyRecipesMap[productId];
      if (recipeData) {
        const wasteMultiplier = 1 + (recipeData.wastePct / 100);
        const effectiveQty = quantity * (cartItem.unitMultiplier || 1);
        const db = getDb();
        const session = useAuthStore.getState().session;
        const tenantId = session?.tenantId;

        async function checkQtyIngredient(
          line: { productId: string; quantity: number; unit: string },
          parentName: string,
          currentQty: number,
          depth: number,
          yieldQty: number = recipeData.yieldQuantity,
        ): Promise<string | null> {
          if (depth > 5) return null;

          const ingredient = await db.products.where({ id: line.productId, tenantId }).first();
          if (!ingredient) {
            return `Stock insuficiente de ingrediente "Desconocido" para "${parentName}".`;
          }

          const neededInStorage = recipeQtyToStorageBase((line.quantity / yieldQty) * currentQty * wasteMultiplier, line.unit, ingredient.unit);
          const needed = Math.ceil(neededInStorage);

          const subRecipe = await db.recipes
            .where({ productId: line.productId, mode: 'assembly' as const })
            .filter(r => !r.deletedAt && r.isActive)
            .first();

          if (subRecipe) {
            if (ingredient.stock >= needed) return null;
            const subBatchEquivalent = needed / subRecipe.yieldQuantity;
            const subLines = await db.recipeLines
              .where({ recipeId: subRecipe.id })
              .filter(l => !l.deletedAt)
              .toArray();
            for (const subLine of subLines) {
              const error = await checkQtyIngredient(subLine, ingredient.name, subBatchEquivalent, depth + 1, subRecipe.yieldQuantity);
              if (error) return error;
            }
            return null;
          }

          const lots = await db.inventoryLots
            .where({ productId: line.productId, tenantId })
            .filter(l => l.deletedAt == null && l.remainingQuantity > 0)
            .toArray();
          const lotsTotal = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
          const totalAvailable = lotsTotal > 0 ? lotsTotal : (ingredient.stock || 0);

          if (ingredient.deletedAt || totalAvailable < needed) {
            return `Stock insuficiente de ingrediente "${ingredient.name}" para "${parentName}". Necesario: ${needed}, Disponible: ${totalAvailable}.`;
          }
          return null;
        }

        for (const line of recipeData.lines) {
          const error = await checkQtyIngredient(line, product.name, effectiveQty, 0);
          if (error) {
            set({ error });
            return;
          }
        }
      }
    }

    const finalQty = Math.min(quantity, maxQty);

    set({
      cart: get().cart.map((item) =>
        item.productId === productId && (!presentationId || item.presentationId === presentationId)
          ? { ...item, quantity: finalQty, totalPriceUsd: preciseRound(finalQty * item.unitPriceUsd, 2) }
          : item,
      ),
    });
  },

  clearCart: () => set({ cart: [], discount: null }),
});
