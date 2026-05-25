import { create } from 'zustand';
import type { Gasto, GastoFiltersState } from '../types';

interface GastosState {
  gastos: Gasto[];
  recurringTemplates: Gasto[];
  loading: boolean;
  filters: GastoFiltersState;
  selectedGasto: Gasto | null;
  showForm: boolean;
  editingGasto: Gasto | null;
  setGastos: (gastos: Gasto[]) => void;
  setRecurringTemplates: (templates: Gasto[]) => void;
  setLoading: (loading: boolean) => void;
  setFilters: (filters: Partial<GastoFiltersState>) => void;
  setSelectedGasto: (gasto: Gasto | null) => void;
  setShowForm: (show: boolean) => void;
  setEditingGasto: (gasto: Gasto | null) => void;
}

export const useGastosStore = create<GastosState>((set) => ({
  gastos: [],
  recurringTemplates: [],
  loading: false,
  filters: {
    category: 'all',
    month: new Date().toISOString().slice(0, 7),
    status: 'all',
    recurring: 'all',
    search: '',
  },
  selectedGasto: null,
  showForm: false,
  editingGasto: null,
  setGastos: (gastos) => set({ gastos }),
  setRecurringTemplates: (templates) => set({ recurringTemplates: templates }),
  setLoading: (loading) => set({ loading }),
  setFilters: (filters) => set((s) => ({ filters: { ...s.filters, ...filters } })),
  setSelectedGasto: (gasto) => set({ selectedGasto: gasto }),
  setShowForm: (show) => set({ showForm: show }),
  setEditingGasto: (gasto) => set({ editingGasto: gasto }),
}));
