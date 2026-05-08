import { create } from 'zustand';
import type { UserSession } from '@logiscore/core';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  session: UserSession | null;
  error: string | null;

  setLoading: () => void;
  setSession: (session: UserSession) => void;
  clearSession: (error?: string) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  session: null,
  error: null,

  setLoading: () => set({ status: 'loading', error: null }),
  setSession: (session) => set({ status: 'authenticated', session, error: null }),
  clearSession: (error) =>
    set({ status: 'unauthenticated', session: null, error: error ?? null }),
  reset: () => set({ status: 'idle', session: null, error: null }),
}));
