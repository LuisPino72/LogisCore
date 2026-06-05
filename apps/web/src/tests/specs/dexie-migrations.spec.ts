/**
 * BACKLOG-106 [AUTH-002] — Dexie migration test v17 → v18
 *
 * Given: Dexie DB con esquema v18 (incluye tabla rolePermissions)
 * When: Se ejecuta migrateV17ToV18 sobre la tabla rolePermissions
 * Then: Tabla se popula con 3 permisos seed (owner/admin/employee)
 *       Y la migración es idempotente (segunda ejecución no duplica)
 *
 * Usa fake-indexeddb para simular IndexedDB en entorno Node.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie, { type Table } from 'dexie';
import { migrateV17ToV18 } from '../../services/dexie/migrations/v17-to-v18';
import type { DexieRolePermission } from '../../services/dexie/db';

const DB_NAME = 'LogisCore_migration_test';

class V18DB extends Dexie {
  rolePermissions!: Table<DexieRolePermission, string>;

  constructor() {
    super(DB_NAME);
    this.version(18).stores({
      rolePermissions: 'id, role',
    });
  }
}

describe('BACKLOG-106 [AUTH-002] Migración Dexie v17 → v18', () => {
  beforeEach(async () => {
    await Dexie.delete(DB_NAME);
  });

  afterEach(async () => {
    await Dexie.delete(DB_NAME);
  });

  it('Given: v18 DB recién abierta. When: ejecutar migrateV17ToV18. Then: 3 permisos seedeados (owner, admin, employee)', async () => {
    const db = new V18DB();
    await db.open();

    expect(await db.rolePermissions.count()).toBe(0);

    await migrateV17ToV18({ rolePermissions: db.rolePermissions });

    expect(await db.rolePermissions.count()).toBe(3);

    const ownerPerm = await db.rolePermissions.get('role-owner');
    expect(ownerPerm?.role).toBe('owner');
    expect(ownerPerm?.modules).toContain('pos');
    expect(ownerPerm?.modules).toContain('reports');
    expect(ownerPerm?.modules).toContain('dashboard');
    expect(ownerPerm?.modules).toHaveLength(8);

    const adminPerm = await db.rolePermissions.get('role-admin');
    expect(adminPerm?.role).toBe('admin');
    expect(adminPerm?.modules).toEqual(['admin']);

    const employeePerm = await db.rolePermissions.get('role-employee');
    expect(employeePerm?.role).toBe('employee');
    expect(employeePerm?.modules).toContain('pos');
    expect(employeePerm?.modules).toContain('customers');
    expect(employeePerm?.modules).toHaveLength(2);

    db.close();
  });

  it('Given: v18 con permisos ya seedeados. When: ejecutar migrateV17ToV18 de nuevo. Then: count sigue en 3 (idempotente)', async () => {
    const db = new V18DB();
    await db.open();

    await migrateV17ToV18({ rolePermissions: db.rolePermissions });
    expect(await db.rolePermissions.count()).toBe(3);

    await migrateV17ToV18({ rolePermissions: db.rolePermissions });
    expect(await db.rolePermissions.count()).toBe(3);

    db.close();
  });
});
