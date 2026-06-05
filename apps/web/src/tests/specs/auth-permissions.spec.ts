/**
 * BACKLOG-106 [AUTH-002] BDD Tests — 8 escenarios del sistema de roles
 *
 * Cubre el contrato de roleGuard (lanzar AppError AUTH_SCOPE_DENIED) y
 * rolePermissions (DEFAULT_PERMISSIONS por rol).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: { getState: vi.fn() },
}));

vi.mock('@logiscore/core', () => ({
  AppError: class AppError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, msg: string, options?: { details?: unknown }) {
      super(msg); this.code = code; this.name = 'AppError';
      this.details = options?.details;
    }
  },
}));

import { useAuthStore } from '../../features/auth/stores/authStore';
import { requireRole } from '../../features/auth/services/roleGuard';
import { getRolePermissions, hasPermission, DEFAULT_PERMISSIONS } from '../../features/auth/permissions/rolePermissions';

const mockGetState = vi.mocked(useAuthStore.getState);

function setRole(role: 'admin' | 'owner' | 'employee' | undefined) {
  mockGetState.mockReturnValue({
    session: role ? { userId: 'u-1', email: 'u@bodega.com', role, tenantId: 't-1' } : null,
  } as ReturnType<typeof useAuthStore.getState>);
}

describe('AUTH-002: requireRole lanza AUTH_SCOPE_DENIED cuando rol no permitido', () => {
  it('Given: employee. When: requireRole(owner, admin). Then: throws AUTH_SCOPE_DENIED', () => {
    setRole('employee');
    expect(() => requireRole('owner', 'admin')).toThrow(/Acción restringida/);
    try { requireRole('owner', 'admin'); } catch (e: unknown) {
      const err = e as { code: string; details: { currentRole: string; allowedRoles: string[] } };
      expect(err.code).toBe('AUTH_SCOPE_DENIED');
      expect(err.details.currentRole).toBe('employee');
      expect(err.details.allowedRoles).toEqual(['owner', 'admin']);
    }
  });

  it('Given: owner. When: requireRole(owner, admin). Then: no throw', () => {
    setRole('owner');
    expect(() => requireRole('owner', 'admin')).not.toThrow();
  });

  it('Given: admin. When: requireRole(owner, admin). Then: no throw', () => {
    setRole('admin');
    expect(() => requireRole('owner', 'admin')).not.toThrow();
  });

  it('Given: no session. When: requireRole(owner, admin). Then: throws AUTH_SCOPE_DENIED (currentRole=null)', () => {
    setRole(undefined);
    expect(() => requireRole('owner', 'admin')).toThrow(/Acción restringida/);
  });
});

describe('AUTH-002: getRolePermissions retorna módulos correctos', () => {
  it('owner tiene acceso a todos los módulos de negocio', () => {
    const mods = getRolePermissions('owner');
    expect(mods).toContain('pos');
    expect(mods).toContain('purchases');
    expect(mods).toContain('production');
    expect(mods).toContain('reports');
  });

  it('employee solo tiene acceso a pos y customers', () => {
    const mods = getRolePermissions('employee');
    expect(mods).toEqual(['pos', 'customers']);
  });

  it('admin solo tiene acceso a admin (panel global)', () => {
    const mods = getRolePermissions('admin');
    expect(mods).toEqual(['admin']);
  });

  it('rol undefined retorna módulos de employee (fallback seguro)', () => {
    const mods = getRolePermissions(undefined);
    expect(mods).toEqual(['pos', 'customers']);
  });
});

describe('AUTH-002: hasPermission filtra sidebar correctamente', () => {
  it('employee con session: hasPermission(session, "pos") = true', () => {
    setRole('employee');
    const session = mockGetState().session;
    expect(hasPermission(session, 'pos')).toBe(true);
    expect(hasPermission(session, 'customers')).toBe(true);
  });

  it('employee con session: hasPermission(session, "purchases") = false', () => {
    setRole('employee');
    const session = mockGetState().session;
    expect(hasPermission(session, 'purchases')).toBe(false);
    expect(hasPermission(session, 'production')).toBe(false);
    expect(hasPermission(session, 'reports')).toBe(false);
  });

  it('owner con session: hasPermission(session, "purchases") = true', () => {
    setRole('owner');
    const session = mockGetState().session;
    expect(hasPermission(session, 'purchases')).toBe(true);
  });

  it('session null: hasPermission = false para cualquier módulo', () => {
    setRole(undefined);
    const session = mockGetState().session;
    expect(hasPermission(session, 'pos')).toBe(false);
    expect(hasPermission(session, 'inventory')).toBe(false);
  });
});

describe('AUTH-002: DEFAULT_PERMISSIONS tiene los 3 roles', () => {
  it('roles registrados: owner, admin, employee', () => {
    const roles = DEFAULT_PERMISSIONS.map((p) => p.role);
    expect(roles).toContain('owner');
    expect(roles).toContain('admin');
    expect(roles).toContain('employee');
    expect(roles.length).toBe(3);
  });
});
