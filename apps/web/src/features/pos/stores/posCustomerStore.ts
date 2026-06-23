import type { Customer } from '../../../specs/customers';

export interface PosCustomerSlice {
  selectedCustomerId: string | null;
  selectedCustomer: Customer | null;
  isCreditSale: boolean;
  setSelectedCustomer: (customer: Customer | null) => void;
  setIsCreditSale: (isCredit: boolean) => void;
}

export const initialCustomerState = {
  selectedCustomerId: null as string | null,
  selectedCustomer: null as Customer | null,
  isCreditSale: false,
};

export const createCustomerSlice = (set: any, _get: any): PosCustomerSlice => ({
  ...initialCustomerState,

  setSelectedCustomer: (customer) => set({
    selectedCustomerId: customer?.id ?? null,
    selectedCustomer: customer,
    isCreditSale: false,
  }),

  setIsCreditSale: (isCredit) => set({ isCreditSale: isCredit }),
});
