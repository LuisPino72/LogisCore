import { type Result, success, failure, AppError } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { startOfDayVzla } from '../../../lib/date';
import type { Tenant, TenantPlan, UserRole, GlobalUser, CreateTenantResponse, SubscriptionView, DashboardStats, TenantAnalytics, GlobalCategory } from '../types';
import { CreateTenantWithUsersInputSchema, CreateEmployeeInputSchema, UpdateTenantSchema, CreateGlobalCategorySchema, ResetPasswordSchema, RestoreTenantSchema } from '../types';
import { AdminErrors } from '../types/errors';
import { emitWithAudit } from '../../../services/audit/emitWithAudit';
import { TenantTranslator } from '../../../services/tenantTranslator';
import type { Role, CreateRoleInput, UpdateRoleInput } from '../../../specs/roles';
import { CreateRoleInputSchema, UpdateRoleInputSchema } from '../../../specs/roles';
import { RoleErrors, ROLE_ERROR_MESSAGES } from '../../../specs/roles/errors';
import { getDb } from '../../../services/dexie/db';
import type { DexieRegisterConfig, DexieCashRegister } from '../../../services/dexie/db';
import { syncQueue } from '../../../services/sync/syncQueue';
import { useAuthStore } from '../../../features/auth/stores/authStore';

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
      .select('id, name, slug, rif, direccion, telefono, logo_url, created_at, deleted_at, subscriptions!inner(plan, status)')
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
        logoUrl: (t.logo_url as string) ?? undefined,
        plan: (subs?.plan as TenantPlan) ?? 'basic',
        createdAt: t.created_at as string,
        deletedAt: t.deleted_at as string | undefined,
      };
    });

    return success(tenants);
  },

  async softDeleteTenant(id: string): Promise<Result<void, AppError>> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('tenants')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);

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

    // Audit BEFORE delete (tenant must exist for FK)
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

    const { error } = await supabase.rpc('hard_delete_tenant', { p_tenant_id: id });

    if (error) {
      return failure(new AppError('TENANT_HARD_DELETE_FAILED', error.message || 'Error al eliminar permanentemente el local'));
    }

    // Clean up Storage images for this tenant (fire-and-forget, non-critical)
    try {
      const listRecursive = async (prefix: string): Promise<string[]> => {
        const { data: items } = await supabase.storage.from('Products').list(prefix);
        if (!items || items.length === 0) return [];
        const paths: string[] = [];
        for (const item of items) {
          const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id === null) {
            // Folder — recurse
            const subPaths = await listRecursive(fullPath);
            paths.push(...subPaths);
          } else {
            paths.push(fullPath);
          }
        }
        return paths;
      };
      const paths = await listRecursive(id);
      if (paths.length > 0) {
        await supabase.storage.from('Products').remove(paths);
      }
    } catch { /* non-critical */ }

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

    // Enrich with emails from auth.users — solo si el usuario actual es admin u owner
    const session = useAuthStore.getState().session;
    if (session?.role === 'admin' || session?.role === 'owner') {
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
    }

    // Excluir al owner de la lista de empleados
    const ownerUserId = useAuthStore.getState().session?.userId;
    if (ownerUserId) {
      const ownerIdx = users.findIndex((u) => u.userId === ownerUserId);
      if (ownerIdx !== -1) users.splice(ownerIdx, 1);
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

      // PLAN-MULTICAJAS: Seed "Caja Principal" por defecto al crear tenant
      try {
        await supabase
          .from('registers_config')
          .insert({
            tenant_id: result.tenant.id,
            name: 'Caja Principal',
            is_active: true,
          });
      } catch {
        // Non-critical: el tenant se creó correctamente, la caja puede crearse manualmente
      }

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

      // If roleId was specified, update the user_roles entry to the target role
      if (data.roleId && result.employees[0]) {
        const { data: roleRow } = await supabase
          .from('roles')
          .select('name')
          .eq('id', data.roleId)
          .is('deleted_at', null)
          .single();

        if (roleRow) {
          await supabase
            .from('user_roles')
            .update({ role: roleRow.name })
            .eq('user_id', result.employees[0].id)
            .is('deleted_at', null);
        }
      }

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

  async updateUserRole(userRoleId: string, roleId: string): Promise<Result<void, AppError>> {
    // Resolve role name from roles table
    const { data: role } = await supabase
      .from('roles')
      .select('name')
      .eq('id', roleId)
      .is('deleted_at', null)
      .single();

    if (!role) {
      return failure(new AppError('ROLE_NOT_FOUND', 'Rol no encontrado'));
    }

    if (role.name && role.name.toLowerCase() === 'admin') {
      return failure(new AppError('ROLE_FORBIDDEN', 'No puedes asignar el rol de administrador. Este rol está reservado.'));
    }

    const { error } = await supabase
      .from('user_roles')
      .update({ role: role.name })
      .eq('id', userRoleId);

    if (error) {
      return failure(new AppError('ROLE_UPDATE_FAILED', 'Error al actualizar rol del usuario'));
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
      return failure(new AppError(AdminErrors.SUBSCRIPTION_RENEW_FAILED, parsed.error.issues[0]?.message || 'Negocio no válido.'));
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
      return failure(new AppError(AdminErrors.ADMIN_RESTORE_FAILED, parsed.error.issues[0]?.message || 'Negocio no válido.'));
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

  async uploadLogo(tenantId: string, file: File): Promise<Result<string, AppError>> {
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_SIZE = 2 * 1024 * 1024;

    if (!ALLOWED_TYPES.includes(file.type)) {
      return failure(new AppError('LOGO_INVALID_FORMAT', 'Formato no válido. Usa JPG, PNG o WebP.'));
    }
    if (file.size > MAX_SIZE) {
      return failure(new AppError('LOGO_TOO_LARGE', 'El logo debe ser menor a 2MB.'));
    }

    let token: string;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token ?? '';
      if (!token) {
        return failure(new AppError('LOGO_UPLOAD_FAILED', 'No hay sesión activa.'));
      }
    } catch {
      return failure(new AppError('LOGO_UPLOAD_FAILED', 'Error de autenticación.'));
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const tenantUuid = await TenantTranslator.slugToUuid(tenantId);
    const filePath = `logos/${tenantUuid}.${ext}`;
    const storageUrl = `${SUPABASE_URL}/storage/v1/object/Products/${filePath}`;

    try {
      const buffer = await file.arrayBuffer();
      const res = await fetch(storageUrl, {
        method: 'PUT',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'content-type': file.type,
          'cache-control': '3600',
        },
        body: buffer,
      });

      if (!res.ok) {
        if (res.status === 413) {
          return failure(new AppError('LOGO_TOO_LARGE', 'El logo debe ser menor a 2MB.'));
        }
        return failure(new AppError('LOGO_UPLOAD_FAILED', 'Error al subir el logo. Verifica tu conexión.'));
      }
    } catch {
      return failure(new AppError('LOGO_UPLOAD_FAILED', 'Error de red al subir el logo.'));
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/Products/${filePath}`;

    const { error: updateError } = await supabase
      .from('tenants')
      .update({ logo_url: publicUrl })
      .eq('id', tenantId);

    if (updateError) {
      return failure(new AppError('LOGO_UPLOAD_FAILED', 'Logo subido pero no se pudo guardar la referencia.'));
    }

    return success(publicUrl);
  },

  async deleteLogo(logoUrl: string): Promise<void> {
    try {
      const parts = logoUrl.split('/Products/');
      if (parts.length < 2) return;
      const filePath = parts[1];
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      if (!token) return;
      const storageUrl = `${SUPABASE_URL}/storage/v1/object/Products/${filePath}`;
      await fetch(storageUrl, {
        method: 'DELETE',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch { /* best-effort */ }
  },

  async fetchRoles(): Promise<Result<(Role & { permissionCount: number })[], AppError>> {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, description, is_system, rls_tier, created_at, deleted_at')
      .order('created_at', { ascending: true });

    if (error) {
      return failure(new AppError('ROLE_FETCH_FAILED', 'Error al cargar roles'));
    }

    const roles: Role[] = (data ?? [])
      .filter((r: Record<string, unknown>) => !r.deleted_at)
      .map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        description: (r.description as string) ?? undefined,
        isSystem: r.is_system as boolean,
        rlsTier: r.rls_tier as 'admin' | 'owner' | 'employee',
        createdAt: r.created_at as string,
      }));

    const permCounts = new Map<string, number>();
    const { data: perms } = await supabase
      .from('role_permissions')
      .select('role_id');
    if (perms) {
      for (const p of perms as Array<{ role_id: string }>) {
        permCounts.set(p.role_id, (permCounts.get(p.role_id) ?? 0) + 1);
      }
    }

    return success(roles.map((r) => ({ ...r, permissionCount: permCounts.get(r.id) ?? 0 })));
  },

  async fetchRolePermissions(roleId: string): Promise<Result<string[], AppError>> {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role_id', roleId);

    if (error) {
      return failure(new AppError('PERMISSION_FETCH_FAILED', 'Error al cargar permisos'));
    }

    return success((data ?? []).map((r: Record<string, unknown>) => r.permission as string));
  },

  async createRole(input: CreateRoleInput): Promise<Result<Role & { permissionCount?: number }, AppError>> {
    const parsed = CreateRoleInputSchema.safeParse(input);
    if (!parsed.success) {
      return failure(new AppError('ROLE_CREATE_FAILED', parsed.error.issues[0]?.message || 'Datos inválidos'));
    }

    const { name, description, rlsTier, permissions } = parsed.data;

    const RESERVED_NAMES = ['admin', 'owner', 'employee'];
    if (RESERVED_NAMES.includes(name.toLowerCase())) {
      return failure(new AppError('ROLE_NAME_RESERVED', `El nombre "${name}" es un rol reservado del sistema y no puede ser creado.`));
    }

    if (rlsTier === 'admin') {
      return failure(new AppError('ROLE_TIER_RESERVED', 'El nivel de acceso "admin" es reservado y no puede ser asignado a roles personalizados.'));
    }

    const { data: role, error: roleError } = await supabase
      .from('roles')
      .insert({ name, description: description ?? null, rls_tier: rlsTier, is_system: false })
      .select('id, name, description, is_system, rls_tier, created_at')
      .single();

    if (roleError || !role) {
      if (roleError?.message?.includes('duplicate key') || roleError?.message?.includes('roles_name_unique')) {
        return failure(new AppError(RoleErrors.ROLE_NAME_EXISTS, ROLE_ERROR_MESSAGES[RoleErrors.ROLE_NAME_EXISTS]));
      }
      return failure(new AppError('ROLE_CREATE_FAILED', roleError?.message || 'Error al crear rol'));
    }

    if (permissions.length > 0) {
      const { error: permError } = await supabase
        .from('role_permissions')
        .insert(permissions.map((p: string) => ({ role_id: role.id, permission: p })));

      if (permError) {
        await supabase.from('roles').delete().eq('id', role.id);
        return failure(new AppError('ROLE_CREATE_FAILED', 'Error al asignar permisos'));
      }
    }

    await emitWithAudit({
      eventName: 'ADMIN.ROLE.CREATE',
      module: 'ADMIN',
      payload: { roleId: role.id, name: role.name, permissionsCount: permissions.length },
      context: { userId: (await supabase.auth.getUser()).data.user?.id ?? '', tenantId: '', tenantUuid: '' },
    });

    return success({
      id: role.id,
      name: role.name,
      description: role.description ?? undefined,
      isSystem: role.is_system,
      rlsTier: role.rls_tier,
      createdAt: role.created_at,
      permissionCount: permissions.length,
    });
  },

  async updateRole(id: string, input: UpdateRoleInput): Promise<Result<Role, AppError>> {
    const parsed = UpdateRoleInputSchema.safeParse(input);
    if (!parsed.success) {
      return failure(new AppError('ROLE_UPDATE_FAILED', parsed.error.issues[0]?.message || 'Datos inválidos'));
    }

    const { data: existing } = await supabase
      .from('roles')
      .select('is_system')
      .eq('id', id)
      .single();

    if (existing?.is_system) {
      return failure(new AppError(RoleErrors.ROLE_IS_SYSTEM, ROLE_ERROR_MESSAGES[RoleErrors.ROLE_IS_SYSTEM]));
    }

    const RESERVED_NAMES = ['admin', 'owner', 'employee'];
    if (parsed.data.name && RESERVED_NAMES.includes(parsed.data.name.toLowerCase())) {
      return failure(new AppError('ROLE_NAME_RESERVED', `El nombre "${parsed.data.name}" es un rol reservado del sistema.`));
    }

    if (parsed.data.rlsTier === 'admin') {
      return failure(new AppError('ROLE_TIER_RESERVED', 'El nivel de acceso "admin" es reservado y no puede ser asignado.'));
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.rlsTier !== undefined) updateData.rls_tier = parsed.data.rlsTier;

    const { data: updated, error } = await supabase
      .from('roles')
      .update(updateData)
      .eq('id', id)
      .select('id, name, description, is_system, rls_tier, created_at')
      .single();

    if (error || !updated) {
      return failure(new AppError('ROLE_UPDATE_FAILED', error?.message || 'Error al actualizar rol'));
    }

    return success({
      id: updated.id,
      name: updated.name,
      description: updated.description ?? undefined,
      isSystem: updated.is_system,
      rlsTier: updated.rls_tier,
      createdAt: updated.created_at,
    });
  },

  async upsertRolePermissions(roleId: string, permissions: string[]): Promise<Result<void, AppError>> {
    const { data: existing } = await supabase
      .from('roles')
      .select('is_system')
      .eq('id', roleId)
      .single();

    if (existing?.is_system) {
      return failure(new AppError(RoleErrors.ROLE_IS_SYSTEM, ROLE_ERROR_MESSAGES[RoleErrors.ROLE_IS_SYSTEM]));
    }

    const { error: delError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId);

    if (delError) {
      return failure(new AppError('PERMISSION_UPDATE_FAILED', 'Error al actualizar permisos'));
    }

    if (permissions.length > 0) {
      const { error: insError } = await supabase
        .from('role_permissions')
        .insert(permissions.map((p: string) => ({ role_id: roleId, permission: p })));

      if (insError) {
        return failure(new AppError('PERMISSION_UPDATE_FAILED', 'Error al guardar permisos'));
      }
    }

    return success(undefined);
  },

  async deleteRole(id: string): Promise<Result<void, AppError>> {
    const { data: existing } = await supabase
      .from('roles')
      .select('is_system, name')
      .eq('id', id)
      .single();

    if (!existing) {
      return failure(new AppError(RoleErrors.ROLE_NOT_FOUND, ROLE_ERROR_MESSAGES[RoleErrors.ROLE_NOT_FOUND]));
    }

    if (existing.is_system) {
      return failure(new AppError(RoleErrors.ROLE_IS_SYSTEM, 'No se puede eliminar un rol del sistema'));
    }

    const { error } = await supabase
      .from('roles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return failure(new AppError('ROLE_DELETE_FAILED', 'Error al eliminar rol'));
    }

    return success(undefined);
  },

  async forceCloseSession(sessionId: string): Promise<Result<DexieCashRegister, AppError>> {
    const db = getDb();
    const session = await db.cashRegisters.get(sessionId);
    if (!session) return failure(new AppError('SESSION_NOT_FOUND', 'Sesión no encontrada'));

    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const updated: Partial<DexieCashRegister> = {
      closedBy: user?.id || 'system',
      closedAt: now,
      closingBalanceBs: (session.openingBalanceBs ?? 0) + session.totalSalesBs + (session.collectedDebtBs || 0),
      closingRate: session.openingRate,
      expectedClosingBs: (session.openingBalanceBs ?? 0) + session.totalSalesBs + (session.collectedDebtBs || 0),
      differenceBs: 0,
      isOpen: false,
    };
    await db.cashRegisters.update(sessionId, updated);
    await syncQueue.enqueue('cashRegisters', 'UPDATE', sessionId, updated as Record<string, unknown>, session.tenantId);
    const updatedSession = await db.cashRegisters.get(sessionId);
    return success(updatedSession!);
  },

  // ============================================================
  // PLAN-MULTICAJAS: CRUD de registers_config
  // ============================================================

  async createRegister(input: { tenantId: string; name: string }): Promise<Result<DexieRegisterConfig, AppError>> {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const config: DexieRegisterConfig = {
      id,
      tenantId: input.tenantId,
      name: input.name,
      isActive: true,
      createdAt: now,
    };
    await db.registerConfigs.add(config);
    await syncQueue.enqueue('registers_config', 'CREATE', id, {
      id, name: input.name, is_active: true, created_at: now, updated_at: now, tenant_id: input.tenantId,
    }, input.tenantId);
    return success(config);
  },

  async updateRegister(id: string, input: Partial<Pick<DexieRegisterConfig, 'name' | 'isActive'>>): Promise<Result<DexieRegisterConfig, AppError>> {
    const db = getDb();
    const updatedAt = new Date().toISOString();
    await db.registerConfigs.update(id, { ...input, updatedAt });
    const updated = await db.registerConfigs.get(id);
    if (!updated) return failure(new AppError('REGISTER_NOT_FOUND', 'Caja no encontrada'));
    const remoteFields: Record<string, unknown> = { updated_at: updatedAt };
    if (input.name !== undefined) remoteFields.name = input.name;
    if (input.isActive !== undefined) remoteFields.is_active = input.isActive;
    await syncQueue.enqueue('registers_config', 'UPDATE', id, remoteFields, updated.tenantId);
    return success(updated);
  },

  async deleteRegister(id: string): Promise<Result<void, AppError>> {
    const db = getDb();
    const config = await db.registerConfigs.get(id);
    if (!config) return success(undefined);
    const activeSession = await db.cashRegisters.where({ registerId: id, isOpen: true }).first();
    if (activeSession) return failure(new AppError('REGISTER_HAS_ACTIVE_SESSION', 'No se puede eliminar una caja con sesión activa'));
    await db.registerConfigs.delete(id);
    await syncQueue.enqueue('registers_config', 'DELETE', id, { id, deleted_at: new Date().toISOString() }, config.tenantId);
    return success(undefined);
  },

  async getRegisters(tenantId: string): Promise<Result<DexieRegisterConfig[], AppError>> {
    const db = getDb();
    const registers = await db.registerConfigs.where('tenantId').equals(tenantId).toArray();
    return success(registers);
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
