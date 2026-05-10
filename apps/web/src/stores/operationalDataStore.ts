import { create } from 'zustand';

interface OperationalState {
  activeModule: string | null;
  filters: Record<string, Record<string, unknown>>;
  isModalOpen: boolean;
  modalData: Record<string, unknown> | null;

  setActiveModule: (module: string) => void;
  setFilters: (module: string, filters: Record<string, unknown>) => void;
  setModal: (open: boolean, data?: Record<string, unknown>) => void;
  reset: () => void;
}

export const useOperationalStore = create<OperationalState>((set) => ({
  activeModule: null,
  filters: {},
  isModalOpen: false,
  modalData: null,

  setActiveModule: (module) => set({ activeModule: module }),
  setFilters: (module, filters) =>
    set((state) => ({
      filters: { ...state.filters, [module]: filters },
    })),
  setModal: (open, data?: Record<string, unknown>) => set({ isModalOpen: open, modalData: data ?? null }),
  reset: () => set({
    activeModule: null,
    filters: {},
    isModalOpen: false,
    modalData: null,
  }),
}));
