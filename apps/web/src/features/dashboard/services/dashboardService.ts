import { type Result, success, failure, AppError } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';
import { DashboardErrors } from '../../../specs/dashboard/errors';
import type { TenantInfoResponse, SubscriptionResponse } from '../types';

export const dashboardService = {
  async getTenantInfo(tenantId: string): Promise<Result<TenantInfoResponse, AppError>> {
    const { data, error } = await supabase
      .from('tenants')
      .select('name, slug, rif')
      .eq('id', tenantId)
      .is('deleted_at', null)
      .single();

    if (error) {
      return failure(new AppError(DashboardErrors.TENANT_INFO_FAILED, 'Error al cargar información del negocio'));
    }

    return success(data);
  },

  async getSubscriptionInfo(tenantId: string): Promise<Result<SubscriptionResponse, AppError>> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      return failure(new AppError(DashboardErrors.SUBSCRIPTION_INFO_FAILED, 'Error al cargar suscripción'));
    }

    return success(data);
  },

  async getEmployeeCount(tenantId: string): Promise<Result<number, AppError>> {
    const { count, error } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'employee')
      .is('deleted_at', null);

    if (error) {
      return failure(new AppError(DashboardErrors.EMPLOYEES_LOAD_FAILED, 'Error al cargar empleados'));
    }

    return success(count ?? 0);
  },
};
