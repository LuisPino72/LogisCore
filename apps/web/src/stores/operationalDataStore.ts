import { create } from 'zustand';

interface OperationalState {
  activeModule: string | null;
  filters: Record<string, any>;
  isModalOpen: boolean;
  modalData: any;
  
  setActiveModule: (module: string) => void;
  setFilters: (module: string, filters: any) => void;
  setModal: (open: boolean, data?: any) => void;
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
      filters: { ...state.filters, [module]: filters } 
    })),
  setModal: (open, data = null) => set({ isModalOpen: open, modalData: data }),
  reset: () => set({ 
    activeModule: null, 
    filters: {}, 
    isModalOpen: false, 
    modalData: null 
  }),
}));