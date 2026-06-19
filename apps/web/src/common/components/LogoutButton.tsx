import { useCallback } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import { authService } from '../../features/auth/services/authService';
import { useAuthStore } from '../../features/auth/stores/authStore';
import { logger } from '../../lib/logger';

export function LogoutButton() {
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);

  const handleLogout = useCallback(async () => {
    useAuthStore.getState().setLoggingOut(true);
    const result = await authService.signOut();
    if (!result.ok) {
      useAuthStore.getState().setLoggingOut(false);
      logger.error('Auth', 'Error al cerrar sesión', result.error.message);
    }
  }, []);

  return (
    <Tooltip content="Cerrar sesión" variant="info">
    <Button variant="ghost" size="sm" onClick={handleLogout} loading={isLoggingOut}>
      <LogOut size={18} />
    </Button>
    </Tooltip>
  );
}
