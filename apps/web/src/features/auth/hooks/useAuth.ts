import { useEffect, useRef } from 'react';
import { useAuthStore, type AuthStatus } from '../stores/authStore';
import { authService } from '../services/authService';

export function useAuth(): {
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  tenantSlug: string | null;
  role: string | null;
} {
  const { status, session, setLoading, setSession, clearSession } = useAuthStore();
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (status !== 'idle') return;

    bootstrappedRef.current = true;
    setLoading();

    authService
      .bootstrapSession()
      .then((result) => {
        if (result.ok) {
          if (result.data) {
            setSession(result.data);
            authService.startSync();
          } else {
            clearSession();
          }
        } else {
          if (result.error.code === 'AUTH_SESSION_ACTIVE') {
            clearSession();
          } else {
            clearSession(result.error.message);
          }
        }
      })
      .catch((err: unknown) => {
        clearSession(err instanceof Error ? err.message : 'Error desconocido');
        bootstrappedRef.current = false;
      });
  }, [status, setLoading, setSession, clearSession]);

  return {
    status,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading' || status === 'idle',
    tenantSlug: session?.tenantSlug ?? null,
    role: session?.role ?? null,
  };
}
