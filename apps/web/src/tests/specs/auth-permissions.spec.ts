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
import { hasPermission, hasActionPermission } from '../../features/auth/permissions/rolePermissions';

const mockGetState = vi.mocked(useAuthStore.getState);

const SESSIONS: Record<string, {
  userId: string; email: string; role: string; tenantId: string; permissions: string[] | undefined;
}> = {
  employee: {
    userId: 'u-1', email: 'u@bodega.com', role: 'employee', tenantId: 't-1',
    permissions: ['pos:create', 'pos:read', 'customers:create', 'customers:read'],
  },
  owner: {
    userId: 'u-1', email: 'u@bodega.com', role: 'owner', tenantId: 't-1',
    permissions: [
      'dashboard:read', 'inventory:create', 'inventory:read',
      'purchases:create', 'purchases:read', 'gastos:create', 'gastos:read',
      'production:create', 'production:read', 'customers:create', 'customers:read',
      'reports:read', 'pos:create', 'pos:read',
    ],
  },
  admin: {
    userId: 'u-1', email: 'u@bodega.com', role: 'admin', tenantId: 't-1',
    permissions: undefined,
  },
};

function setRole(role: 'admin' | 'owner' | 'employee' | undefined) {
  mockGetState.mockReturnValue({
    session: role ? SESSIONS[role] : null,
  } as ReturnType<typeof useAuthStore.getState>);
}

describe('AUTH-002: requireRole lanza AUTH_SCOPE_DENIED cuando rol no permitido', () => {
  it('Given: employee. When: requireRole(owner, admin). Then: throws AUTH_SCOPE_DENIED', () => {
    setRole('employee');
    expect(() => requireRole('owner', 'admin')).toThrow('No tienes acceso a esta función.');
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
    expect(() => requireRole('owner', 'admin')).toThrow('No tienes acceso a esta función.');
  });
});

describe('AUTH-002: hasPermission/hasActionPermission reflejan permisos del JWT', () => {
  it('employee tiene permisos de pos y customers pero no de otros módulos', () => {
    setRole('employee');
    const session = mockGetState().session;
    expect(hasPermission(session, 'pos')).toBe(true);
    expect(hasPermission(session, 'customers')).toBe(true);
    expect(hasPermission(session, 'purchases')).toBe(false);
    expect(hasPermission(session, 'production')).toBe(false);
    expect(hasPermission(session, 'reports')).toBe(false);
    expect(hasActionPermission(session, 'pos', 'create')).toBe(true);
    expect(hasActionPermission(session, 'inventory', 'create')).toBe(false);
  });

  it('owner tiene permisos de todos los módulos de negocio', () => {
    setRole('owner');
    const session = mockGetState().session;
    expect(hasPermission(session, 'pos')).toBe(true);
    expect(hasPermission(session, 'purchases')).toBe(true);
    expect(hasPermission(session, 'production')).toBe(true);
    expect(hasPermission(session, 'reports')).toBe(true);
    expect(hasPermission(session, 'dashboard')).toBe(true);
    expect(hasPermission(session, 'gastos')).toBe(true);
    expect(hasPermission(session, 'customers')).toBe(true);
  });

  it('admin con permissions undefined tiene bypass en cualquier módulo', () => {
    setRole('admin');
    const session = mockGetState().session;
    expect(hasPermission(session, 'admin')).toBe(true);
    expect(hasPermission(session, 'pos')).toBe(true);
    expect(hasActionPermission(session, 'admin', 'manage')).toBe(true);
  });

  it('session null retorna false para cualquier permiso', () => {
    setRole(undefined);
    const session = mockGetState().session;
    expect(hasPermission(session, 'pos')).toBe(false);
    expect(hasPermission(session, 'inventory')).toBe(false);
    expect(hasActionPermission(session, 'pos', 'create')).toBe(false);
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


