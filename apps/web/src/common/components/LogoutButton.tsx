import { useCallback, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from './Button';
import { authService } from '../../features/auth/services/authService';
import { logger } from '../../lib/logger';

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoading(true);
    const result = await authService.signOut();
    setLoading(false);
    if (!result.ok) {
      logger.error('Auth', 'Error al cerrar sesión', result.error.message);
    }
  }, []);

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout} title="Cerrar sesión" loading={loading}>
      <LogOut size={18} />
    </Button>
  );
}
