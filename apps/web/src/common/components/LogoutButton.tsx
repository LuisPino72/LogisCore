import { useCallback } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from './Button';
import { authService } from '../../features/auth/services/authService';

export function LogoutButton() {
  const handleLogout = useCallback(async () => {
    await authService.signOut();
  }, []);

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout} title="Cerrar sesión">
      <LogOut size={18} />
    </Button>
  );
}
