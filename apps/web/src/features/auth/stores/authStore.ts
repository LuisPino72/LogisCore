import { create } from 'zustand';
import type { UserSession } from '@logiscore/core';
import { authService } from '../services/authService';
import { sessionGuard } from '../services/sessionGuardService';
import { LoginInputSchema } from '../types';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface FieldErrors {
  email?: string;
  password?: string;
}

interface AuthState {
  status: AuthStatus;
  session: UserSession | null;
  selectedTenantSlug: string | null;
  error: string | null;
  isLoggingIn: boolean;
  loginError: string | null;
  fieldErrors: FieldErrors;
  loginAttempts: number;
  loginCooldownUntil: number;

  setLoading: () => void;
  setSession: (session: UserSession) => void;
  setSelectedTenantSlug: (slug: string | null) => void;
  clearSession: (error?: string) => void;
  reset: () => void;
  login: (email: string, password: string) => Promise<void>;
  clearLoginError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  session: null,
  selectedTenantSlug: null,
  error: null,
  isLoggingIn: false,
  loginError: null,
  fieldErrors: {},
  loginAttempts: 0,
  loginCooldownUntil: 0,

  setLoading: () => set({ status: 'loading', error: null }),
  setSession: (session) => set({ status: 'authenticated', session, error: null }),
  setSelectedTenantSlug: (slug) => set({ selectedTenantSlug: slug }),
  clearSession: (error) =>
    set({ status: 'unauthenticated', session: null, selectedTenantSlug: null, error: error ?? null }),
  reset: () => set({ status: 'idle', session: null, selectedTenantSlug: null, error: null }),

  login: async (email, password) => {
    if (get().isLoggingIn) return;

    set({ isLoggingIn: true, loginError: null, fieldErrors: {} });

    const state = get();
    if (Date.now() < state.loginCooldownUntil) {
      const waitSeconds = Math.ceil((state.loginCooldownUntil - Date.now()) / 1000);
      set({ loginError: `Demasiados intentos. Espera ${waitSeconds} segundos.`, isLoggingIn: false });
      return;
    }

    const parsed = LoginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'email') fieldErrors.email = 'Email inválido';
        if (issue.path[0] === 'password') fieldErrors.password = issue.message;
      }
      set({ fieldErrors, loginError: null, isLoggingIn: false });
      return;
    }

    const result = await authService.login(email, password);

    if (result.ok) {
      set({
        status: 'authenticated',
        session: result.data,
        isLoggingIn: false,
        loginError: null,
        loginAttempts: 0,
        loginCooldownUntil: 0,
      });
      authService.startSync();
      sessionGuard.startHeartbeat();
    } else {
      const attempts = get().loginAttempts + 1;
      const delay = Math.min(attempts * 2000, 30000);
      set({
        isLoggingIn: false,
        loginError: result.error.message,
        loginAttempts: attempts,
        loginCooldownUntil: Date.now() + delay,
      });
    }
  },

  clearLoginError: () => set({ loginError: null, fieldErrors: {} }),
}));
