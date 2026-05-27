import type { Product } from '../../../specs/inventory';
import type { Presentation } from '../../../specs/inventory';
import type { CartItem as SpecCartItem, Sale, SaleItem, CashRegister, CreateSaleInput, OpenCashRegisterInput, CloseCashRegisterInput, PaymentMethod } from '../../../specs/pos';

export type { Sale, SaleItem, CashRegister, CreateSaleInput, OpenCashRegisterInput, CloseCashRegisterInput, PaymentMethod };
export type CartItem = SpecCartItem;

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
  createdAt: string;
}

export interface PosState {
  products: Product[];
  cart: CartItem[];
  cashRegister: CashRegister | null;
  exchangeRate: number | null;
  parkedCarts: ParkedCart[];
  favoriteProductIds: Set<string>;
  salesHistory: Sale[];
  salesHistoryTotal: number;
  salesHistoryLoading: boolean;
  activeParkedCartId: string | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  presentationsMap: Record<string, Presentation[]>;
  discount: { type: 'percentage' | 'fixed'; value: number } | null;
}
