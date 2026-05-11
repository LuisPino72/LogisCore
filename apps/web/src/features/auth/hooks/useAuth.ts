import { useEffect } from 'react';
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

  useEffect(() => {
    if (status !== 'idle') return;

    setLoading();

    authService
      .bootstrapSession()
      .then((userSession) => {
        if (userSession) {
          setSession(userSession);
          if (userSession.tenantId) {
            authService.startSync();
          }
        } else {
          clearSession();
        }
      })
      .catch((err) => {
        clearSession(err instanceof Error ? err.message : 'Error al iniciar sesión');
      });

    return () => {
      authService.stopSync();
    };
  }, [status, setLoading, setSession, clearSession]);

  return {
    status,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading' || status === 'idle',
    tenantSlug: session?.tenantSlug ?? null,
    role: session?.role ?? null,
  };
}
