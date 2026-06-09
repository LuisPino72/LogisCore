import { create } from 'zustand';
import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerHistoryQuery,
} from '../../../specs/customers';
import { customerService, type CustomerStats } from '../services/customerService';
import type { Sale } from '../../pos/types';

interface CustomerStore {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  selectedCustomer: Customer | null;
  history: Sale[];
  historyTotal: number;
  historyLoading: boolean;
  stats: CustomerStats | null;

  fetchCustomers: (tenantId: string, silent?: boolean) => Promise<void>;
  fetchCustomerById: (id: string, tenantId: string) => Promise<void>;
  fetchCustomerHistory: (query: CustomerHistoryQuery, tenantId: string) => Promise<void>;
  fetchCustomerStats: (customerId: string, tenantId: string) => Promise<void>;
  createCustomer: (
    tenantId: string,
    userId: string,
    input: CreateCustomerInput,
  ) => Promise<string | null>;
  updateCustomer: (
    id: string,
    input: UpdateCustomerInput,
    tenantId: string,
  ) => Promise<boolean>;
  deleteCustomer: (id: string, tenantId: string) => Promise<boolean>;
  setSelectedCustomer: (customer: Customer | null) => void;
  reset: () => void;
  resetModal: () => void;
}

const initialState = {
  customers: [],
  loading: false,
  error: null as string | null,
  selectedCustomer: null as Customer | null,
  history: [] as Sale[],
  historyTotal: 0,
  historyLoading: false,
  stats: null as CustomerStats | null,
};

export const useCustomerStore = create<CustomerStore>((set, get) => ({
  ...initialState,

  fetchCustomers: async (tenantId, silent = false) => {
    if (!silent) set({ loading: true, error: null });
    const result = await customerService.getCustomers(tenantId);
    if (result.ok) {
      set({ customers: result.data, ...(!silent && { loading: false }) });
    } else if (!silent) {
      set({ loading: false, error: result.error.message });
    }
  },

  fetchCustomerById: async (id, tenantId) => {
    const result = await customerService.getCustomerById(id, tenantId);
    if (result.ok) {
      set({ selectedCustomer: result.data });
    }
  },

  fetchCustomerHistory: async (query, tenantId) => {
    set({ historyLoading: true });
    const result = await customerService.getCustomerHistory(query, tenantId);
    if (result.ok) {
      set({
        history: result.data.sales,
        historyTotal: result.data.total,
        historyLoading: false,
      });
    } else {
      set({ historyLoading: false, error: result.error.message });
    }
  },

  fetchCustomerStats: async (customerId, tenantId) => {
    const result = await customerService.getCustomerStats(customerId, tenantId);
    if (result.ok) {
      set({ stats: result.data });
    }
  },

  createCustomer: async (tenantId, userId, input) => {
    set({ loading: true, error: null });
    const result = await customerService.createCustomer(tenantId, userId, input);
    if (result.ok) {
      await get().fetchCustomers(tenantId);
      return result.data.id;
    }
    set({ loading: false, error: result.error.message });
    return null;
  },

  updateCustomer: async (id, input, tenantId) => {
    const result = await customerService.updateCustomer(id, input, tenantId);
    if (result.ok) {
      await get().fetchCustomers(tenantId);
      if (get().selectedCustomer?.id === id) {
        set({ selectedCustomer: result.data });
      }
      return true;
    }
    set({ error: result.error.message });
    return false;
  },

  deleteCustomer: async (id, tenantId) => {
    set({ loading: true, error: null });
    const result = await customerService.softDeleteCustomer(id, tenantId);
    if (result.ok) {
      set({
        customers: get().customers.filter((c) => c.id !== id),
        loading: false,
      });
      return true;
    }
    set({ loading: false, error: result.error.message });
    return false;
  },

  setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),

  reset: () => set(initialState),

  resetModal: () => set({
    selectedCustomer: null,
    history: [],
    historyTotal: 0,
    historyLoading: false,
    stats: null,
  }),
}));
