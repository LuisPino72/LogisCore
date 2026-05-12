import { useCallback } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from './Button';
import { authService } from '../../features/auth/services/authService';

export function LogoutButton() {
  const handleLogout = useCallback(async () => {
    const result = await authService.signOut();
    if (!result.ok) {
      console.error('[LogoutButton] Error al cerrar sesión:', result.error.message);
    }
  }, []);

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout} title="Cerrar sesión">
      <LogOut size={18} />
    </Button>
  );
}
