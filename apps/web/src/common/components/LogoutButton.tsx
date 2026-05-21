import { useCallback } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from './Button';
import { authService } from '../../features/auth/services/authService';
import { logger } from '../../lib/logger';

export function LogoutButton() {
  const handleLogout = useCallback(async () => {
    const result = await authService.signOut();
    if (!result.ok) {
      logger.error('Auth', 'Error al cerrar sesión', result.error.message);
    }
  }, []);

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout} title="Cerrar sesión">
      <LogOut size={18} />
    </Button>
  );
}
