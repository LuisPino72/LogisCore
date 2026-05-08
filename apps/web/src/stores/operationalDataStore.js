import { create } from 'zustand';
export const useOperationalStore = create((set) => ({
    activeModule: null,
    filters: {},
    isModalOpen: false,
    modalData: null,
    setActiveModule: (module) => set({ activeModule: module }),
    setFilters: (module, filters) => set((state) => ({
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
//# sourceMappingURL=operationalDataStore.js.map