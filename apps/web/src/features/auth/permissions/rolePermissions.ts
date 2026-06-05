/**
 * BACKLOG-106 [AUTH-002]: Permisos por rol (single source of truth)
 *
 * El módulo `pos` y `customers` son los únicos accesibles para employees.
 * Owners tienen acceso total. Admins acceden solo al panel global /admin.
 *
 * Los datos también se persisten en Dexie (tabla `rolePermissions`),
 * pero la lectura síncrona desde este módulo evita un round-trip a DB
 * para verificar el módulo. Si los roles requieren configuración por
 * tenant en el futuro, se puede cambiar a lectura asíncrona.
 */
import type { UserSession, UserRole } from '../types';

export interface RolePermission {
  id: string;
  role: UserRole;
  modules: string[];
}

export const DEFAULT_PERMISSIONS: RolePermission[] = [
  {
    id: 'role-owner',
    role: 'owner',
    modules: ['dashboard', 'inventory', 'production', 'purchases', 'pos', 'gastos', 'customers', 'reports'],
  },
  {
    id: 'role-admin',
    role: 'admin',
    modules: ['admin'],
  },
  {
    id: 'role-employee',
    role: 'employee',
    modules: ['pos', 'customers'],
  },
];

const FALLBACK_MODULES = DEFAULT_PERMISSIONS.find((p) => p.role === 'employee')!.modules;

export function getRolePermissions(role: UserRole | undefined | null): string[] {
  if (!role) return FALLBACK_MODULES;
  const found = DEFAULT_PERMISSIONS.find((p) => p.role === role);
  return found ? found.modules : FALLBACK_MODULES;
}

export function hasPermission(session: UserSession | null | undefined, module: string): boolean {
  const role = session?.role;
  if (!role) return false;
  return getRolePermissions(role).includes(module);
}
