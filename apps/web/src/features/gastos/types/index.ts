export const EXPENSE_CATEGORIES = [
  'LUZ', 'AGUA', 'GAS', 'INTERNET',
  'ALQUILER', 'NOMINA',
  'IMPUESTOS', 'COMPRA_INVENTARIO', 'OTROS'
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface Gasto {
  id: string;
  tenantId: string;
  createdByUserId: string;
  category: ExpenseCategory;
  amountUsd: number;
  exchangeRate: number;
  amountBs: number;
  description?: string;
  date: string;
  isRecurring: boolean;
  recurrenceType?: 'monthly' | 'yearly';
  nextDueDate?: string;
  parentExpenseId?: string;
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateGastoInput {
  category: ExpenseCategory;
  amountUsd: number;
  exchangeRate: number;
  description?: string;
  date: string;
  isRecurring: boolean;
  recurrenceType?: 'monthly' | 'yearly';
  status?: 'pending' | 'paid';
}

export interface UpdateGastoInput {
  category?: ExpenseCategory;
  amountUsd?: number;
  exchangeRate?: number;
  amountBs?: number;
  description?: string;
  date?: string;
  status?: 'pending' | 'paid' | 'cancelled';
}

export interface GastoFiltersState {
  category?: ExpenseCategory | 'all';
  month?: string;
  status?: 'pending' | 'paid' | 'cancelled' | 'all';
  recurring?: boolean | 'all';
  search?: string;
}
