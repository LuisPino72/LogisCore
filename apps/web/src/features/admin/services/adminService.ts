import { type Result, success, failure, AppError } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { startOfDayVzla } from '../../../lib/date';
import type { Tenant, UserRole, GlobalUser, CreateTenantWithUsersInput, CreateTenantResponse, SubscriptionView, DashboardStats, TenantAnalytics, GlobalCategory, CreateGlobalCategoryInput } from '../types';
import { AdminErrors } from '../types/errors';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const EDGE_FUNCTIONS = {
  createTenant: `${SUPABASE_URL}/functions/v1/admin-create-tenant`,
  listUsers: `${SUPABASE_URL}/functions/v1/admin-list-users`,
  resetPassword: `${SUPABASE_URL}/functions/v1/admin-reset-password`,
} as const;

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
      .select('id, name, slug, rif, direccion, telefono, created_at, deleted_at, subscriptions!inner(plan, status)')
      .order('deleted_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      return failure(new AppError('TENANT_NOT_FOUND', 'Error al cargar Tenants'));
    }

    const tenants: Tenant[] = (data ?? []).map((t: Record<string, unknown>) => {
      const subs = t.subscriptions as Record<string, unknown> | undefined;
      return {
        id: t.id as string,
        name: t.name as string,
        slug: t.slug as string,
        rif: t.rif as string,
        direccion: t.direccion as string | undefined,
        telefono: t.telefono as string | undefined,
        plan: (subs?.plan as string) ?? 'basic',
        createdAt: t.created_at as string,
        deletedAt: t.deleted_at as string | undefined,
      };
    });

    return success(tenants);
  },

  async softDeleteTenant(id: string): Promise<Result<void, AppError>> {
    const { error } = await supabase.rpc('soft_delete_tenant', { p_tenant_id: id });

    if (error) {
      return failure(new AppError('TENANT_DELETE_FAILED', error.message || 'Error al desactivar el local'));
    }

    try {
      await emitWithAudit('ADMIN.TENANT.DELETE', 'ADMIN', {
        tenantId: id,
        type: 'soft',
      }, {
        userId: '',
        tenantId: '',
        tenantUuid: id,
      });
    } catch {
      // Non-critical: audit fallo, pero el soft delete ya fue exitoso
    }

    return success(undefined);
  },

  async hardDeleteTenant(id: string): Promise<Result<void, AppError>> {
    const { error } = await supabase.rpc('hard_delete_tenant', { p_tenant_id: id });

    if (error) {
      return failure(new AppError('TENANT_HARD_DELETE_FAILED', error.message || 'Error al eliminar permanentemente el local'));
    }

    // Clean up Storage images for this tenant (fire-and-forget, non-critical)
    try {
      await supabase.rpc('hard_delete_tenant_storage', { p_tenant_id: id });
    } catch {
      // Non-critical: storage cleanup failure should not block tenant deletion
    }

    try {
      await emitWithAudit('ADMIN.TENANT.HARD_DELETE', 'ADMIN', {
        tenantId: id,
        type: 'hard',
      }, {
        userId: '',
        tenantId: '',
        tenantUuid: id,
      });
    } catch {
      // Non-critical: audit fallo, pero el hard delete ya fue exitoso
    }

    return success(undefined);
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

    // Fetch emails from auth.users via edge function
    const tokenResult = await getAdminToken();
    if (tokenResult.ok) {
      try {
        const response = await fetch(
          EDGE_FUNCTIONS.listUsers,
          { headers: { 'Authorization': `Bearer ${tokenResult.data}` } },
        );
        if (response.ok) {
          const allUsers: GlobalUser[] = await response.json();
          const userMap = new Map(allUsers.map((u) => [u.userId, { email: u.email, name: u.name }]));
          for (const u of users) {
            const match = userMap.get(u.userId);
            if (match) {
              u.email = match.email;
              u.name = match.name;
            }
          }
        }
      } catch {
        // fallback: keep email/name empty
      }
    }

    return success(users);
  },

  async fetchAllUsers(): Promise<Result<import('../types').GlobalUser[], AppError>> {
    const tokenResult = await getAdminToken();
    if (!tokenResult.ok) return tokenResult;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-users`,
        { headers: { 'Authorization': `Bearer ${tokenResult.data}` } },
      );

      if (!response.ok) {
        return failure(new AppError('TENANT_NOT_FOUND', 'Error al cargar usuarios'));
      }

      const data: import('../types').GlobalUser[] = await response.json();
      return success(data);
    } catch {
      return failure(new AppError('TENANT_NOT_FOUND', 'Error al cargar usuarios'));
    }
  },

  async createTenant(payload: CreateTenantWithUsersInput): Promise<Result<CreateTenantResponse, AppError>> {
    const tokenResult = await getAdminToken();
    if (!tokenResult.ok) return tokenResult;

    try {
      const response = await fetch(EDGE_FUNCTIONS.createTenant, {
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
      const response = await fetch(EDGE_FUNCTIONS.createTenant, {
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

  async updateTenant(id: string, data: Partial<Pick<Tenant, 'name' | 'rif' | 'direccion' | 'telefono'>>): Promise<Result<Tenant, AppError>> {
    const { data: updated, error } = await supabase
      .from('tenants')
      .update(data)
      .eq('id', id)
      .select('id, name, slug, rif, direccion, telefono, created_at')
      .single();

    if (error || !updated) {
      return failure(new AppError('TENANT_NOT_FOUND', 'Error al actualizar tenant'));
    }

    return success({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      rif: updated.rif,
      direccion: updated.direccion as string | undefined,
      telefono: updated.telefono as string | undefined,
      plan: 'basic',
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

  async fetchSubscriptionView(): Promise<Result<SubscriptionView[], AppError>> {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, slug, direccion, telefono, subscriptions(plan, status, expires_at)')
      .is('deleted_at', null)
      .order('name');

    if (error) {
      return failure(new AppError('ADMIN_ONLY', 'Error al cargar suscripciones'));
    }

    const views: SubscriptionView[] = (data ?? []).map((t: Record<string, unknown>) => {
      const subs = (t.subscriptions as Record<string, unknown>[] | undefined)?.[0];
      const expiresAt = (subs?.expires_at as string) ?? null;
      const daysRemaining = expiresAt
        ? Math.round((new Date(startOfDayVzla(new Date(expiresAt))).getTime() - new Date(startOfDayVzla()).getTime()) / 86400000)
        : -999;

      return {
        tenantId: t.id as string,
        tenantName: t.name as string,
        tenantSlug: t.slug as string,
        plan: (subs?.plan as string) ?? 'basic',
        status: (subs?.status as string) ?? 'inactive',
        expiresAt,
        daysRemaining,
      };
    });

    return success(views);
  },

  async renewSubscription(tenantId: string): Promise<Result<void, AppError>> {
    const { data: current } = await supabase
      .from('subscriptions')
      .select('expires_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    const baseDate = current?.expires_at
      ? new Date(current.expires_at)
      : new Date();

    if (baseDate < new Date()) {
      baseDate.setTime(Date.now());
    }

    baseDate.setDate(baseDate.getDate() + 30);
    const newExpiresAt = baseDate.toISOString();

    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (error) {
      return failure(new AppError('SUBSCRIPTION_RENEW_FAILED', 'Error al renovar suscripción'));
    }

    return success(undefined);
  },

  async restoreTenant(id: string): Promise<Result<void, AppError>> {
    const { error } = await supabase.rpc('restore_tenant_cascade', { p_tenant_id: id });

    if (error) {
      return failure(new AppError(AdminErrors.ADMIN_RESTORE_FAILED, 'Error al reactivar el local'));
    }

    return success(undefined);
  },

  async resetPassword(userId: string, newPassword: string): Promise<Result<void, AppError>> {
    const tokenResult = await getAdminToken();
    if (!tokenResult.ok) return tokenResult;

    try {
      const response = await fetch(
        EDGE_FUNCTIONS.resetPassword,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenResult.data}`,
          },
          body: JSON.stringify({ userId, newPassword }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return failure(new AppError(
          (body as { code?: string }).code ?? AdminErrors.ADMIN_RESET_PASS_FAILED,
          (body as { message?: string }).message ?? 'Error al resetear contraseña',
        ));
      }

      return success(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al conectar con el servidor';
      return failure(new AppError(AdminErrors.ADMIN_RESET_PASS_FAILED, message));
    }
  },

  async fetchDashboardStats(): Promise<Result<DashboardStats, AppError>> {
    const [
      activeTenantsResult,
      inactiveTenantsResult,
      totalUsersResult,
    ] = await Promise.all([
      supabase.from('tenants').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('tenants').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      supabase.from('user_roles').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    ]);

    const totalActiveTenants = activeTenantsResult.count ?? 0;
    const totalInactiveTenants = inactiveTenantsResult.count ?? 0;
    const totalUsers = totalUsersResult.count ?? 0;

    // Count expiring subscriptions (active + expires within 7 days)
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 86400000).toISOString();
    const { data: expiringData } = await supabase
      .from('subscriptions')
      .select('tenant_id')
      .lte('expires_at', sevenDaysLater)
      .gte('expires_at', now.toISOString())
      .eq('status', 'active')
      .is('deleted_at', null);

    const expiringSubscriptions = expiringData?.length ?? 0;

    return success({
      totalActiveTenants,
      totalInactiveTenants,
      expiringSubscriptions,
      totalUsers,
    });
  },

  async fetchGlobalCategories(): Promise<Result<GlobalCategory[], AppError>> {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, created_at, updated_at')
      .is('tenant_id', null)
      .is('deleted_at', null)
      .order('name');

    if (error) {
      return failure(new AppError('CATEGORY_QUERY_FAILED', 'Error al cargar categorías globales'));
    }

    const categories: GlobalCategory[] = (data ?? []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: c.name as string,
      createdAt: c.created_at as string,
      updatedAt: c.updated_at as string | undefined,
    }));

    return success(categories);
  },

  async createGlobalCategory(input: CreateGlobalCategoryInput): Promise<Result<GlobalCategory, AppError>> {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: input.name, is_predefined: true, tenant_id: null })
      .select('id, name, created_at, updated_at')
      .single();

    if (error || !data) {
      return failure(new AppError('CATEGORY_CREATE_FAILED', error?.message ?? 'Error al crear categoría'));
    }

    const category: GlobalCategory = {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return success(category);
  },

  async updateGlobalCategory(id: string, name: string): Promise<Result<GlobalCategory, AppError>> {
    const { data, error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', id)
      .select('id, name, created_at, updated_at')
      .single();

    if (error || !data) {
      return failure(new AppError('CATEGORY_UPDATE_FAILED', error?.message ?? 'Error al actualizar categoría'));
    }

    return success({
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  },

  async deleteGlobalCategory(id: string): Promise<Result<void, AppError>> {
    const { error } = await supabase
      .from('categories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return failure(new AppError('CATEGORY_DELETE_FAILED', error?.message ?? 'Error al eliminar categoría'));
    }

    return success(undefined);
  },

  async getTenantAnalytics(tenantId: string): Promise<Result<TenantAnalytics, AppError>> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      salesResult,
      productsResult,
      usersResult,
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('total_bs', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', startOfMonth.toISOString())
        .is('deleted_at', null),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      supabase
        .from('user_roles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
    ]);

    return success({
      monthlySalesCount: salesResult.count ?? 0,
      monthlySalesTotalBs: 0, // En un futuro podríamos sumar total_bs real
      activeProducts: productsResult.count ?? 0,
      totalUsers: usersResult.count ?? 0,
    });
  },
};
