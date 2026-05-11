import { create } from 'zustand';

export type CurrentView = 'loading' | 'login' | 'admin' | 'dashboard';

interface NavigationState {
  currentView: CurrentView;
  selectedTenantSlug: string | null;
  setView: (view: CurrentView, tenantSlug?: string | null) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentView: 'loading',
  selectedTenantSlug: null,
  setView: (view, tenantSlug = null) =>
    set({ currentView: view, selectedTenantSlug: tenantSlug }),
}));
