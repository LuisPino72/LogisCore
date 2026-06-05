/**
 * BACKLOG-106 [AUTH-002]: useRoleGuard — hook React para guards de UI
 *
 * Llama `requireRole` al montar/redenderizar. Si falla, redirige a /pos
 * y muestra un toast de "Acceso denegado".
 *
 * Uso típico en páginas que requieren rol específico:
 *   useRoleGuard('owner', 'admin');
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAppError } from '@logiscore/core';
import { requireRole } from '../services/roleGuard';
import type { UserRole } from '../types';
import { useToastStore } from '../../../stores/toastStore';

export function useRoleGuard(...allowedRoles: UserRole[]): void {
  const navigate = useNavigate();
  const checkedRef = useRef(false);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    try {
      requireRole(...allowedRoles);
    } catch (err: unknown) {
      const message = isAppError(err) ? err.message : 'Acceso denegado.';
      addToast({ type: 'error', message });
      navigate('/pos', { replace: true });
    }
  }, [allowedRoles, navigate, addToast]);
}
