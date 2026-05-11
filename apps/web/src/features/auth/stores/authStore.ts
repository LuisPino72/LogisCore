import { create } from 'zustand';
import type { UserSession } from '@logiscore/core';
import { authService } from '../services/authService';
import { LoginInputSchema } from '../types';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface FieldErrors {
  email?: string;
  password?: string;
}

interface AuthState {
  status: AuthStatus;
  session: UserSession | null;
  error: string | null;
  isLoggingIn: boolean;
  loginError: string | null;
  fieldErrors: FieldErrors;

  setLoading: () => void;
  setSession: (session: UserSession) => void;
  clearSession: (error?: string) => void;
  reset: () => void;
  login: (email: string, password: string) => Promise<void>;
  clearLoginError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  session: null,
  error: null,
  isLoggingIn: false,
  loginError: null,
  fieldErrors: {},

  setLoading: () => set({ status: 'loading', error: null }),
  setSession: (session) => set({ status: 'authenticated', session, error: null }),
  clearSession: (error) =>
    set({ status: 'unauthenticated', session: null, error: error ?? null }),
  reset: () => set({ status: 'idle', session: null, error: null }),

  login: async (email, password) => {
    const parsed = LoginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'email') fieldErrors.email = 'Email inválido';
        if (issue.path[0] === 'password') fieldErrors.password = 'Debe tener al menos 6 caracteres';
      }
      set({ fieldErrors, loginError: null });
      return;
    }

    set({ isLoggingIn: true, loginError: null, fieldErrors: {} });

    const result = await authService.login(email, password);

    if (result.ok) {
      set({
        status: 'authenticated',
        session: result.data,
        isLoggingIn: false,
        loginError: null,
      });
      if (result.data.tenantId) {
        authService.startSync();
      }
    } else {
      set({
        isLoggingIn: false,
        loginError: result.error.message,
      });
    }
  },

  clearLoginError: () => set({ loginError: null, fieldErrors: {} }),
}));
