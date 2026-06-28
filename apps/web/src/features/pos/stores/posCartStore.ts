import { preciseRound } from '@logiscore/shared';
import { getDb } from '../../../services/dexie/db';
import { useAuthStore } from '../../auth/stores/authStore';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import type { CartItem, PresentationSelection } from '../types';
import type { Product } from '../../../specs/inventory';
import { displayQty, toDisplayValue } from '../../inventory/types';

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
  recipeData: { lines: { productId: string; quantity: number }[]; wastePct: number },
  product: { id: string; name: string },
  quantity: number,
): Promise<string | null> {
  const wasteMultiplier = 1 + (recipeData.wastePct / 100);
  const db = getDb();
  const session = useAuthStore.getState().session;
  const ingredients = await Promise.all(recipeData.lines.map((line) => db.products.where({ id: line.productId, tenantId: session?.tenantId }).first()));
  for (let i = 0; i < recipeData.lines.length; i++) {
    const line = recipeData.lines[i];
    const ingredient = ingredients[i];
    const needed = Math.ceil(line.quantity * quantity * wasteMultiplier);
    if (!ingredient || ingredient.deletedAt || ingredient.stock < needed) {
      return `Stock insuficiente de ingrediente "${ingredient?.name || 'Desconocido'}" para "${product.name}". Necesario: ${needed}, Disponible: ${ingredient?.stock || 0}.`;
    }
  }
  return null;
}

type CartGetter = PosCartSlice & {
  products: Product[];
  assemblyRecipesMap: Record<string, { recipeId: string; wastePct: number; lines: Array<{ productId: string; quantity: number }> }>;
  error: string | null;
};

export const createCartSlice = (set: any, get: () => CartGetter): PosCartSlice => ({
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
          const error = await validateAssemblyIngredients(recipeData, product, quantity);
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
    if (presentationId) {
      set({ cart: get().cart.filter((item) => !(item.productId === productId && item.presentationId === presentationId)) });
    } else {
      set({ cart: get().cart.filter((item) => item.productId !== productId) });
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
        const db = getDb();
        for (const line of recipeData.lines) {
          const needed = Math.ceil(line.quantity * quantity * wasteMultiplier);
          const session = useAuthStore.getState().session;
          const ingredient = await db.products.where({ id: line.productId, tenantId: session?.tenantId }).first();
          if (!ingredient || ingredient.deletedAt || ingredient.stock < needed) {
            set({ error: `Stock insuficiente de ingrediente "${ingredient?.name || 'Desconocido'}" para "${product.name}". Necesario: ${needed}, Disponible: ${ingredient?.stock || 0}.` });
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

  clearCart: () => set({ cart: [] }),
});
