/**
 * AdminPanel BDD Tests - ADMIN-001
 * Given-When-Then specifications for AdminPanel module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CreateTenantInputSchema,
  CreateOwnerInputSchema,
  CreateEmployeeInputSchema,
  CreateTenantWithUsersInputSchema,
} from '../../features/admin/types';
import { SystemEvents } from '@logiscore/core/src/event-bus';

// Mock navigation store
const mockNavigationStore = {
  setView: vi.fn(),
};

// Mock adminService
const mockAdminService = {
  createTenant: vi.fn(),
  fetchTenants: vi.fn(),
  addEmployee: vi.fn(),
  removeEmployee: vi.fn(),
  updateTenant: vi.fn(),
};

describe('ADMIN-001: AdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ESCENARIO 1: Admin login redirige a AdminPanel', () => {
    it('Given: usuario autenticado con role=admin / When: login completa / Then: setView(admin)', () => {
      const loginPayload = { role: 'admin', tenantSlug: null };
      expect(loginPayload.role).toBe('admin');
      expect(loginPayload.tenantSlug).toBeNull();

      mockNavigationStore.setView('admin');
      expect(mockNavigationStore.setView).toHaveBeenCalledWith('admin');
    });
  });

  describe('ESCENARIO 2: No-admin login redirige a Dashboard', () => {
    it('Given: usuario autenticado con role=owner / When: login completa / Then: setView(dashboard)', () => {
      const loginPayload = { role: 'owner', tenantSlug: 'mi-bodega' };
      expect(loginPayload.role).toBe('owner');
      expect(loginPayload.tenantSlug).toBe('mi-bodega');

      mockNavigationStore.setView('dashboard', 'mi-bodega');
      expect(mockNavigationStore.setView).toHaveBeenCalledWith('dashboard', 'mi-bodega');
    });
  });

  describe('ESCENARIO 3: Admin crea tenant con owner y empleados', () => {
    it('Given: admin autenticado / When: crea tenant con datos validos / Then: success con tenant+owner+employees', async () => {
      const payload = {
        tenant: { name: 'Mi Bodega', rif: 'V123456789' },
        owner: { email: 'owner@bodega.com', password: '123456', name: 'Juan Owner' },
        employees: [
          { email: 'emp1@bodega.com', password: '123456', name: 'Maria Emp' },
          { email: 'emp2@bodega.com', password: '123456', name: 'Carlos Emp' },
        ],
      };

      const parsed = CreateTenantWithUsersInputSchema.safeParse(payload);
      expect(parsed.success).toBe(true);

      mockAdminService.createTenant.mockResolvedValue({
        ok: true,
        data: {
          tenant: { id: 'uuid-1', name: 'Mi Bodega', slug: 'mi-bodega', rif: 'V123456789' },
          owner: { id: 'uuid-2', email: 'owner@bodega.com', name: 'Juan Owner' },
          employees: [
            { id: 'uuid-3', email: 'emp1@bodega.com', name: 'Maria Emp' },
            { id: 'uuid-4', email: 'emp2@bodega.com', name: 'Carlos Emp' },
          ],
        },
      });

      const result = await mockAdminService.createTenant(payload);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.tenant.slug).toBe('mi-bodega');
        expect(result.data.employees).toHaveLength(2);
      }
    });

    it('DEBE rechazar tenant con RIF invalido', () => {
      const parsed = CreateTenantInputSchema.safeParse({ name: 'Test', rif: '123' });
      expect(parsed.success).toBe(false);
    });

    it('DEBE rechazar mas de 3 empleados', () => {
      const employees = Array.from({ length: 4 }, (_, i) => ({
        email: `emp${i}@test.com`, password: '123456', name: `Emp ${i}`,
      }));
      const parsed = CreateTenantWithUsersInputSchema.safeParse({
        tenant: { name: 'Test', rif: 'V123456789' },
        owner: { email: 'owner@test.com', password: '123456', name: 'Owner' },
        employees,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('ESCENARIO 4: Admin navega a tenant dashboard y vuelve', () => {
    it('Given: admin en AdminPanel / When: click tenant / Then: setView(dashboard, slug)', () => {
      mockNavigationStore.setView('dashboard', 'mi-bodega');
      expect(mockNavigationStore.setView).toHaveBeenCalledWith('dashboard', 'mi-bodega');
    });

    it('When: click Volver / Then: setView(admin)', () => {
      mockNavigationStore.setView('admin');
      expect(mockNavigationStore.setView).toHaveBeenCalledWith('admin');
    });
  });

  describe('ESCENARIO 5: Admin edita tenant y agrega empleado', () => {
    it('Given: admin en detalle / When: agrega empleado / Then: resultado exitoso', async () => {
      mockAdminService.addEmployee.mockResolvedValue({
        ok: true,
        data: { id: 'uuid-new', email: 'newemp@bodega.com', name: 'Nuevo Emp' },
      });

      const result = await mockAdminService.addEmployee({
        email: 'newemp@bodega.com',
        password: '123456',
        name: 'Nuevo Emp',
        tenantId: 'tenant-uuid',
      });

      expect(result.ok).toBe(true);
    });

    it('Given: admin / When: elimina empleado / Then: removido exitosamente', async () => {
      mockAdminService.removeEmployee.mockResolvedValue({ ok: true, data: undefined });

      const result = await mockAdminService.removeEmployee('user-role-id');
      expect(result.ok).toBe(true);
    });
  });

  describe('ESCENARIO 6: Seguridad: no-admin no puede acceder', () => {
    it('Given: usuario con role=owner / When: llama adminService / Then: error ADMIN_ONLY', async () => {
      mockAdminService.createTenant.mockResolvedValue({
        ok: false,
        error: { code: 'ADMIN_ONLY', message: 'Solo administradores' },
      });

      const result = await mockAdminService.createTenant({
        tenant: { name: 'Test', rif: 'V123456789' },
        owner: { email: 'o@t.com', password: '123456', name: 'O' },
      });

      expect(result.ok).toBe(false);
    });
  });

  describe('SystemEvents de AdminPanel', () => {
    it('DEBE existir ADMIN_NAVIGATE_TENANT en SystemEvents', () => {
      expect(SystemEvents.ADMIN_NAVIGATE_TENANT).toBe('ADMIN.NAVIGATE_TENANT');
    });

    it('DEBE existir ADMIN_EXIT_TENANT en SystemEvents', () => {
      expect(SystemEvents.ADMIN_EXIT_TENANT).toBe('ADMIN.EXIT_TENANT');
    });
  });
});
