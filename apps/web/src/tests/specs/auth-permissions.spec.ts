/**
 * BACKLOG-106 [AUTH-002] — Permisos y Guards BDD Tests
 *
 * Given-When-Then para:
 * - rolePermissions.ts: DEFAULT_PERMISSIONS, getRolePermissions, hasPermission
 * - roleGuard.ts: requireRole síncrono que lanza AppError
 * - useRoleGuard.ts: hook que redirige a /pos si falla
 *
 * Cubre el gap H-FX-02: empleados no deben poder ejecutar servicios
 * de admin (purchases, production, reports, gastos).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}));

import { useAuthStore } from '../../features/auth/stores/authStore';
import { AuthErrors } from '../../features/auth/types/errors';
import { DEFAULT_PERMISSIONS, getRolePermissions, hasPermission } from '../../features/auth/permissions/rolePermissions';
import { requireRole } from '../../features/auth/services/roleGuard';

function setMockRole(role: 'owner' | 'admin' | 'employee' | null) {
  vi.mocked(useAuthStore.getState).mockReturnValue({
    session: role ? { userId: 'u1', email: 'a@a.com', role } : null,
  } as ReturnType<typeof useAuthStore.getState>);
}

describe('AUTH-002: Tabla rolePermissions', () => {
  describe('DEFAULT_PERMISSIONS tiene 3 roles base', () => {
    it('Given: DEFAULT_PERMISSIONS. When: contar. Then: 3 (owner, admin, employee)', () => {
      expect(DEFAULT_PERMISSIONS).toHaveLength(3);
      const roles = DEFAULT_PERMISSIONS.map((p) => p.role);
      expect(roles).toContain('owner');
      expect(roles).toContain('admin');
      expect(roles).toContain('employee');
    });
  });

  describe('getRolePermissions retorna módulos por rol', () => {
    it('Given: role=owner. When: getRolePermissions. Then: 8 módulos incluido reports', () => {
      const perms = getRolePermissions('owner');
      expect(perms).toContain('pos');
      expect(perms).toContain('reports');
      expect(perms).toContain('purchases');
      expect(perms).toContain('production');
      expect(perms).toContain('gastos');
      expect(perms).toHaveLength(8);
    });

    it('Given: role=admin. When: getRolePermissions. Then: solo módulo admin', () => {
      const perms = getRolePermissions('admin');
      expect(perms).toEqual(['admin']);
    });

    it('Given: role=employee. When: getRolePermissions. Then: solo pos + customers', () => {
      const perms = getRolePermissions('employee');
      expect(perms).toContain('pos');
      expect(perms).toContain('customers');
      expect(perms).toHaveLength(2);
    });

    it('Given: role desconocido. When: getRolePermissions. Then: fallback a employee (mínimo privilegio)', () => {
      const perms = getRolePermissions('unknown' as 'owner');
      expect(perms).toEqual(DEFAULT_PERMISSIONS.find((p) => p.role === 'employee')?.modules);
    });
  });

  describe('hasPermission valida acceso por módulo', () => {
    it('Given: employee. When: hasPermission(session, "purchases"). Then: false', () => {
      setMockRole('employee');
      const session = useAuthStore.getState().session!;
      expect(hasPermission(session, 'purchases')).toBe(false);
      expect(hasPermission(session, 'production')).toBe(false);
      expect(hasPermission(session, 'reports')).toBe(false);
      expect(hasPermission(session, 'gastos')).toBe(false);
    });

    it('Given: owner. When: hasPermission(session, "reports"). Then: true', () => {
      setMockRole('owner');
      const session = useAuthStore.getState().session!;
      expect(hasPermission(session, 'reports')).toBe(true);
      expect(hasPermission(session, 'pos')).toBe(true);
    });

    it('Given: admin. When: hasPermission(session, "pos"). Then: false (admin no es owner)', () => {
      setMockRole('admin');
      const session = useAuthStore.getState().session!;
      expect(hasPermission(session, 'pos')).toBe(false);
      expect(hasPermission(session, 'admin')).toBe(true);
    });
  });
});

describe('AUTH-002: requireRole síncrono lanza AppError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Given: employee. When: requireRole("owner", "admin"). Then: throws AppError AUTH_SCOPE_DENIED', () => {
    setMockRole('employee');
    expect(() => requireRole('owner', 'admin')).toThrow();
    try {
      requireRole('owner', 'admin');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe(AuthErrors.AUTH_SCOPE_DENIED);
    }
  });

  it('Given: owner. When: requireRole("owner", "admin"). Then: NO throws', () => {
    setMockRole('owner');
    expect(() => requireRole('owner', 'admin')).not.toThrow();
  });

  it('Given: admin. When: requireRole("admin"). Then: NO throws', () => {
    setMockRole('admin');
    expect(() => requireRole('admin')).not.toThrow();
  });

  it('Given: sin sesión. When: requireRole("owner"). Then: throws AppError AUTH_SCOPE_DENIED', () => {
    setMockRole(null);
    expect(() => requireRole('owner')).toThrow();
    try {
      requireRole('owner');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe(AuthErrors.AUTH_SCOPE_DENIED);
    }
  });
});
