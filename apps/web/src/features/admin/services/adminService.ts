import { type Result, success, failure, AppError } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { startOfDayVzla } from '../../../lib/date';
import type { Tenant, TenantPlan, UserRole, GlobalUser, CreateTenantResponse, SubscriptionView, DashboardStats, TenantAnalytics, GlobalCategory } from '../types';
import { CreateTenantWithUsersInputSchema, CreateEmployeeInputSchema, UpdateTenantSchema, CreateGlobalCategorySchema, ResetPasswordSchema, RestoreTenantSchema } from '../types';
import { AdminErrors } from '../types/errors';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const EDGE_FUNCTIONS = {
  createTenant: `${SUPABASE_URL}/functions/v1/admin-create-tenant`,
  addEmployee: `${SUPABASE_URL}/functions/v1/admin-add-employee`,
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
        plan: (subs?.plan as TenantPlan) ?? 'basic',
        createdAt: t.created_at as string,
        deletedAt: t.deleted_at as string | undefined,
      };
    });

    return success(tenants);
  },

  async softDeleteTenant(id: string): Promise<Result<void, AppError>> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.rpc('soft_delete_tenant', { p_tenant_id: id });

    if (error) {
      return failure(new AppError('TENANT_DELETE_FAILED', error.message || 'Error al desactivar el local'));
    }

    try {
      await emitWithAudit({
        eventName: 'ADMIN.TENANT.DELETE',
        module: 'ADMIN',
        payload: {
          tenantId: id,
          type: 'soft',
        },
        context: {
          userId: user?.id ?? '',
          tenantId: '',
          tenantUuid: id,
        },
      });
    } catch { /* audit best-effort */ }

    return success(undefined);
  },

  async hardDeleteTenant(id: string): Promise<Result<void, AppError>> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.rpc('hard_delete_tenant', { p_tenant_id: id });

    if (error) {
      return failure(new AppError('TENANT_HARD_DELETE_FAILED', error.message || 'Error al eliminar permanentemente el local'));
    }

    // Clean up Storage images for this tenant (fire-and-forget, non-critical)
    try { await supabase.rpc('hard_delete_tenant_storage', { p_tenant_id: id }); } catch {
      // Fallback: delete via Storage API (admin has DELETE RLS on bucket)
      try {
        const { data: files } = await supabase.storage.from('Products').list(id);
        if (files && files.length > 0) {
          const paths = files.map((f) => `${id}/${f.name}`);
          await supabase.storage.from('Products').remove(paths);
        }
      } catch { /* non-critical */ }
    }

    try {
      await emitWithAudit({
        eventName: 'ADMIN.TENANT.HARD_DELETE',
        module: 'ADMIN',
        payload: {
          tenantId: id,
          type: 'hard',
        },
        context: {
          userId: user?.id ?? '',
          tenantId: '',
          tenantUuid: id,
        },
      });
    } catch { /* audit best-effort */ }

    return success(undefined);
  },

  async fetchUsers(tenantId: string): Promise<Result<UserRole[], AppError>> {
    const { data, error } = await supabase
      .from('user_roles')
      .select('id, user_id, tenant_id, role, created_at')
      .is('deleted_at', null)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (error) {
      return failure(new AppError('USER_QUERY_FAILED', 'Error al cargar usuarios'));
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

  async createTenant(payload: unknown): Promise<Result<CreateTenantResponse, AppError>> {
    const parsed = CreateTenantWithUsersInputSchema.safeParse(payload);
    if (!parsed.success) {
      return failure(new AppError(AdminErrors.ADMIN_USER_CREATE_FAILED, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }
    const tokenResult = await getAdminToken();
    if (!tokenResult.ok) return tokenResult;
    const { data: { user } } = await supabase.auth.getUser();

    try {
      const response = await fetch(EDGE_FUNCTIONS.createTenant, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenResult.data}`,
        },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return failure(new AppError(
          (body as { code?: string }).code ?? 'ADMIN_USER_CREATE_FAILED',
          (body as { message?: string }).message ?? 'Error al crear tenant',
        ));
      }

      const result: CreateTenantResponse = await response.json();

      await emitWithAudit({
        eventName: 'ADMIN.TENANT.CREATE',
        module: 'ADMIN',
        payload: {
          tenantId: result.tenant.id,
          tenantSlug: result.tenant.slug,
          ownerEmail: result.owner.email,
          employeeCount: result.employees.length,
        },
        context: {
          userId: user?.id ?? '',
          tenantId: '',
          tenantUuid: result.tenant.id,
        },
      });

      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al conectar con el servidor';
      return failure(new AppError('ADMIN_USER_CREATE_FAILED', message));
    }
  },

  async addEmployee(payload: unknown): Promise<Result<{ id: string; email: string; name: string }, AppError>> {
    const parsed = CreateEmployeeInputSchema.safeParse(payload);
    if (!parsed.success) {
      return failure(new AppError(AdminErrors.ADMIN_USER_CREATE_FAILED, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }
    const tokenResult = await getAdminToken();
    if (!tokenResult.ok) return tokenResult;

    const data = parsed.data;
    try {
      const response = await fetch(EDGE_FUNCTIONS.addEmployee, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenResult.data}`,
        },
        body: JSON.stringify({
          tenantId: data.tenantId,
          employees: [{ email: data.email, password: data.password, name: data.name }],
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

  async updateTenant(id: string, data: unknown): Promise<Result<Tenant, AppError>> {
    const parsed = UpdateTenantSchema.safeParse(data);
    if (!parsed.success) {
      return failure(new AppError(AdminErrors.TENANT_NOT_FOUND, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }
    const { data: updated, error } = await supabase
      .from('tenants')
      .update(parsed.data)
      .eq('id', id)
      .select('id, name, slug, rif, direccion, telefono, created_at')
      .single();

    if (error || !updated) {
      return failure(new AppError('TENANT_NOT_FOUND', 'Error al actualizar tenant'));
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('tenant_id', id)
      .is('deleted_at', null)
      .maybeSingle();

    return success({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      rif: updated.rif,
      direccion: updated.direccion as string | undefined,
      telefono: updated.telefono as string | undefined,
      plan: (subscription?.plan as TenantPlan) ?? 'basic',
      createdAt: updated.created_at,
    });
  },

  async removeEmployee(userRoleId: string): Promise<Result<void, AppError>> {
    // Verificar que el employee pertenece al tenant del caller
    const { data: existing, error: fetchError } = await supabase
      .from('user_roles')
      .select('id, tenant_id')
      .eq('id', userRoleId)
      .single();

    if (fetchError || !existing) {
      return failure(new AppError('TENANT_NOT_FOUND', 'Empleado no encontrado'));
    }

    // Verificar que el tenant coincide con el del JWT (RLS también verifica, pero esto es defense-in-depth)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return failure(new AppError('UNAUTHORIZED', 'No autenticado'));
    }

    if (!existing.tenant_id) {
      return failure(new AppError('TENANT_NOT_FOUND', 'Empleado sin tenant asociado'));
    }

    const { data: callerRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing.tenant_id !== callerRole?.tenant_id) {
      return failure(new AppError('TENANT_FORBIDDEN', 'No autorizado para este empleado'));
    }

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
        plan: (subs?.plan as TenantPlan) ?? 'basic',
        status: (subs?.status as string) ?? 'inactive',
        expiresAt,
        daysRemaining,
      };
    });

    return success(views);
  },

  async renewSubscription(tenantId: string): Promise<Result<void, AppError>> {
    const parsed = RestoreTenantSchema.safeParse({ tenantId });
    if (!parsed.success) {
      return failure(new AppError(AdminErrors.SUBSCRIPTION_RENEW_FAILED, parsed.error.issues[0]?.message || 'Tenant inválido.'));
    }
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
    const parsed = RestoreTenantSchema.safeParse({ tenantId: id });
    if (!parsed.success) {
      return failure(new AppError(AdminErrors.ADMIN_RESTORE_FAILED, parsed.error.issues[0]?.message || 'Tenant inválido.'));
    }
    const { error } = await supabase.rpc('restore_tenant_cascade', { p_tenant_id: id });

    if (error) {
      return failure(new AppError(AdminErrors.ADMIN_RESTORE_FAILED, 'Error al reactivar el local'));
    }

    return success(undefined);
  },

  async resetPassword(userId: string, newPassword: string): Promise<Result<void, AppError>> {
    const parsed = ResetPasswordSchema.safeParse({ userId, newPassword });
    if (!parsed.success) {
      return failure(new AppError(AdminErrors.ADMIN_RESET_PASS_FAILED, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }
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
          body: JSON.stringify({ userId: parsed.data.userId, newPassword: parsed.data.newPassword }),
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

  async createGlobalCategory(input: unknown): Promise<Result<GlobalCategory, AppError>> {
    const parsed = CreateGlobalCategorySchema.safeParse(input);
    if (!parsed.success) {
      return failure(new AppError(AdminErrors.ADMIN_USER_CREATE_FAILED, parsed.error.issues[0]?.message || 'Datos inválidos.'));
    }
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: parsed.data.name, is_predefined: true, tenant_id: null })
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

  async fetchAuditEntries(filters?: {
    dateRange?: { start: string | null };
    module?: string | null;
    tenantId?: string | null;
    limit?: number;
  }): Promise<Result<AuditEntry[], AppError>> {
    try {
      let query = supabase
        .from('audit_trail')
        .select('id, event_name, event_module, user_id, payload, severity, created_at, tenant_id')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(filters?.limit ?? 500);

      if (filters?.module && filters.module !== 'all') {
        query = query.eq('event_module', filters.module);
      }
      if (filters?.tenantId) {
        query = query.eq('tenant_id', filters.tenantId);
      }
      if (filters?.dateRange?.start) {
        query = query.gte('created_at', filters.dateRange.start);
      }

      const { data, error } = await query;

      if (error) {
        return failure(new AppError(AdminErrors.AUDIT_FETCH_FAILED, `Error al cargar auditoría: ${error.message}`));
      }

      const entries: AuditEntry[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        eventName: row.event_name as string,
        eventModule: row.event_module as string,
        userId: row.user_id as string | null,
        payload: row.payload as Record<string, unknown> | null,
        severity: row.severity as string,
        createdAt: row.created_at as string,
        tenantId: row.tenant_id as string | null,
      }));

      return success(entries);
    } catch {
      return failure(new AppError(AdminErrors.AUDIT_FETCH_FAILED, 'Error inesperado al cargar auditoría'));
    }
  },

  async fetchOutboxEntries(filters?: {
    dateRange?: { start: string | null };
    module?: string | null;
    status?: string | null;
    limit?: number;
  }): Promise<Result<OutboxEntryRow[], AppError>> {
    try {
      let query = supabase
        .from('outbox')
        .select('id, event, module, payload, status, retries, last_error, next_retry_at, created_at, processed_at')
        .order('created_at', { ascending: false })
        .limit(filters?.limit ?? 200);

      if (filters?.module && filters.module !== 'all') {
        query = query.eq('module', filters.module);
      }
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.dateRange?.start) {
        query = query.gte('created_at', filters.dateRange.start);
      }

      const { data, error } = await query;

      if (error) {
        return failure(new AppError(AdminErrors.OUTBOX_FETCH_FAILED, `Error al cargar outbox: ${error.message}`));
      }

      const entries: OutboxEntryRow[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        event: row.event as string,
        module: row.module as string,
        payload: row.payload as Record<string, unknown> | null,
        status: row.status as string,
        retries: row.retries as number,
        lastError: row.last_error as string | null,
        nextRetryAt: row.next_retry_at as string | null,
        createdAt: row.created_at as string,
        processedAt: row.processed_at as string | null,
      }));

      return success(entries);
    } catch {
      return failure(new AppError(AdminErrors.OUTBOX_FETCH_FAILED, 'Error inesperado al cargar outbox'));
    }
  },

  async getTenantAnalytics(tenantId: string): Promise<Result<TenantAnalytics, AppError>> {
    const todayVzla = new Date(startOfDayVzla(new Date()));
    todayVzla.setUTCDate(1);
    todayVzla.setUTCHours(4, 0, 0, 0);
    const startOfMonth = todayVzla.toISOString();

    const [
      salesResult,
      productsResult,
      usersResult,
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('total_bs', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', startOfMonth)
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

export interface AuditEntry {
  id: string;
  eventName: string;
  eventModule: string;
  userId: string | null;
  payload: Record<string, unknown> | null;
  severity: string;
  createdAt: string;
  tenantId: string | null;
}

export interface OutboxEntryRow {
  id: string;
  event: string;
  module: string;
  payload: Record<string, unknown> | null;
  status: string;
  retries: number;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  processedAt: string | null;
}
