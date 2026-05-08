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
export declare const useOperationalStore: import("zustand").UseBoundStore<import("zustand").StoreApi<OperationalState>>;
export {};
//# sourceMappingURL=operationalDataStore.d.ts.map