/**
 * BACKLOG-106 [AUTH-002]: Migración Dexie v17 → v18
 *
 * Agrega tabla `rolePermissions` para centralizar permisos por rol.
 * Modelo simplificado Owner/Admin/Employee con seed idempotente de 3 permisos.
 */
import type { Table } from 'dexie';
import type { DexieRolePermission } from '../db';

export interface MigrationContext {
  rolePermissions: Table<DexieRolePermission, string>;
}

const DEFAULT_ROLE_PERMISSIONS: DexieRolePermission[] = [
  {
    id: 'role-owner',
    role: 'owner',
    modules: ['dashboard', 'inventory', 'production', 'purchases', 'pos', 'gastos', 'customers', 'reports'],
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'role-admin',
    role: 'admin',
    modules: ['admin'],
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'role-employee',
    role: 'employee',
    modules: ['pos', 'customers'],
    createdAt: new Date(0).toISOString(),
  },
];

export async function migrateV17ToV18(ctx: MigrationContext): Promise<void> {
  const existing = await ctx.rolePermissions.count();
  if (existing > 0) return;
  await ctx.rolePermissions.bulkAdd(DEFAULT_ROLE_PERMISSIONS);
}
