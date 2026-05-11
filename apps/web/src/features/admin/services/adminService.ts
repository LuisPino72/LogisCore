import { type Result, success, failure, AppError } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import type { Tenant, UserRole, CreateTenantWithUsersInput, CreateTenantResponse } from '../types';
import { AdminErrors } from '../types/errors';
import { emitWithAudit } from '../../../lib/emitWithAudit';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-tenant`;

async function getAdminToken(): Promise<Result<string, AppError>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return failure(new AppError(AdminErrors.ADMIN_ONLY, 'No hay sesión activa'));
  }
  return success(session.access_token);
}

export const adminService = {
  async fetchTenants(): Promise<Result<Tenant[], AppError>> {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, slug, rif, is_active, plan, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      return failure(new AppError('TENANT_NOT_FOUND', 'Error al cargar Tenants'));
    }

    const tenants: Tenant[] = (data ?? []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      name: t.name as string,
      slug: t.slug as string,
      rif: t.rif as string,
      isActive: (t.is_active as boolean) ?? true,
      plan: (t.plan as Tenant['plan']) ?? 'basic',
      createdAt: t.created_at as string,
    }));

    return success(tenants);
  },

  async fetchUsers(tenantId?: string): Promise<Result<UserRole[], AppError>> {
    let query = supabase
      .from('user_roles')
      .select('id, user_id, tenant_id, role, created_at')
      .is('deleted_at', null);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      return failure(new AppError('TENANT_NOT_FOUND', 'Error al cargar usuarios'));
    }

    const users: UserRole[] = (data ?? []).map((u: Record<string, unknown>) => ({
      id: u.id as string,
      userId: u.user_id as string,
      email: '',
      name: '',
      role: u.role as 'owner' | 'employee',
      createdAt: u.created_at as string,
    }));

    return success(users);
  },

  async createTenant(payload: CreateTenantWithUsersInput): Promise<Result<CreateTenantResponse, AppError>> {
    const tokenResult = await getAdminToken();
    if (!tokenResult.ok) return tokenResult;

    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenResult.data}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return failure(new AppError(
          (body as { code?: string }).code ?? 'ADMIN_USER_CREATE_FAILED',
          (body as { message?: string }).message ?? 'Error al crear tenant',
        ));
      }

      const result: CreateTenantResponse = await response.json();

      await emitWithAudit('ADMIN.TENANT.CREATE', 'ADMIN', {
        tenantId: result.tenant.id,
        tenantSlug: result.tenant.slug,
        ownerEmail: result.owner.email,
        employeeCount: result.employees.length,
      }, {
        userId: '',
        tenantId: '',
        tenantUuid: result.tenant.id,
      });

      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al conectar con el servidor';
      return failure(new AppError('ADMIN_USER_CREATE_FAILED', message));
    }
  },

  async addEmployee(payload: { email: string; password: string; name: string; tenantId: string }): Promise<Result<{ id: string; email: string; name: string }, AppError>> {
    const tokenResult = await getAdminToken();
    if (!tokenResult.ok) return tokenResult;

    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenResult.data}`,
        },
        body: JSON.stringify({
          tenant: null,
          owner: null,
          employees: [{ email: payload.email, password: payload.password, name: payload.name }],
          existingTenantId: payload.tenantId,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return failure(new AppError(
          (body as { code?: string }).code ?? 'ADMIN_USER_CREATE_FAILED',
          (body as { message?: string }).message ?? 'Error al crear empleado',
        ));
      }

      const result = await response.json() as { employees: Array<{ id: string; email: string; name: string }> };
      return success(result.employees[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al conectar con el servidor';
      return failure(new AppError('ADMIN_USER_CREATE_FAILED', message));
    }
  },

  async updateTenant(id: string, data: Partial<Pick<Tenant, 'name' | 'rif'>>): Promise<Result<Tenant, AppError>> {
    const { data: updated, error } = await supabase
      .from('tenants')
      .update(data)
      .eq('id', id)
      .select('id, name, slug, rif, is_active, plan, created_at')
      .single();

    if (error || !updated) {
      return failure(new AppError('TENANT_NOT_FOUND', 'Error al actualizar tenant'));
    }

    return success({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      rif: updated.rif,
      isActive: updated.is_active ?? true,
      plan: (updated.plan ?? 'basic') as Tenant['plan'],
      createdAt: updated.created_at,
    });
  },

  async removeEmployee(userRoleId: string): Promise<Result<void, AppError>> {
    const { error } = await supabase
      .from('user_roles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userRoleId);

    if (error) {
      return failure(new AppError('TENANT_NOT_FOUND', 'Error al eliminar empleado'));
    }

    return success(undefined);
  },
};
