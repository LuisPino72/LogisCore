import type { Product } from '../../../specs/inventory';
import type { Presentation } from '../../../specs/inventory';
import type { Customer } from '../../../specs/customers';
import type { CartItem as SpecCartItem, Sale, SaleItem, CashRegister, CreateSaleInput, OpenCashRegisterInput, CloseCashRegisterInput, PaymentMethod } from '../../../specs/pos';

export type { Sale, SaleItem, CashRegister, CreateSaleInput, OpenCashRegisterInput, CloseCashRegisterInput, PaymentMethod };
export type CartItem = SpecCartItem;

export type ProductWithAssembly = Product & { hasAssemblyRecipe?: boolean };

export interface PresentationSelection {
  id: string;
  name: string;
  priceUsd: number;
  unitMultiplier: number;
}

export interface ParkedCart {
  id: string;
  tenantId: string;
  name: string;
  cart: CartItem[];
  customerId?: string;
  createdAt: string;
  orderType?: 'dine-in' | 'delivery';
  needsKitchen?: boolean;
}

export interface PosState {
  products: Product[];
  cart: CartItem[];
  cashRegister: CashRegister | null;
  parkedCarts: ParkedCart[];
  favoriteProductIds: Set<string>;
  salesHistory: Sale[];
  salesHistoryTotal: number;
  salesHistoryLoading: boolean;
  activeParkedCartId: string | null;
  activeRegisterId: string | null;
  activeSessionId: string | null;
  registerName: string | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  presentationsMap: Record<string, Presentation[]>;
  discount: { type: 'percentage' | 'fixed'; value: number } | null;
  saleItems: SaleItem[];
  saleItemsLoading: boolean;
  assemblyRecipesMap: Record<string, { recipeId: string; wastePct: number; lines: Array<{ productId: string; quantity: number }> }>;
  selectedCustomerId: string | null;
  selectedCustomer: Customer | null;
  isCreditSale: boolean;
}
