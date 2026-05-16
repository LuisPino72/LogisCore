import { useState, useCallback } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { adminService } from '../services/adminService';
import type { Tenant, UserRole, GlobalUser, CreateTenantWithUsersInput, CreateTenantResponse, SubscriptionView, DashboardStats, TenantAnalytics } from '../types';

interface UseAdminPanelReturn {
  tenants: Tenant[];
  users: UserRole[];
  allUsers: GlobalUser[];
  subscriptions: SubscriptionView[];
  dashboardStats: DashboardStats | null;
  analytics: TenantAnalytics | null;
  isLoading: boolean;
  error: string | null;
  fetchTenants: () => Promise<void>;
  fetchUsers: (tenantId?: string) => Promise<void>;
  fetchAllUsers: () => Promise<void>;
  fetchSubscriptions: () => Promise<void>;
  fetchDashboardStats: () => Promise<void>;
  fetchAnalytics: (tenantId: string) => Promise<void>;
  renewSubscription: (tenantId: string) => Promise<Result<void, AppError>>;
  createTenant: (payload: CreateTenantWithUsersInput) => Promise<Result<CreateTenantResponse, AppError>>;
  addEmployee: (payload: { email: string; password: string; name: string; tenantId: string }) => Promise<Result<{ id: string; email: string; name: string }, AppError>>;
  updateTenant: (id: string, data: Partial<Pick<Tenant, 'name' | 'rif'>>) => Promise<Result<Tenant, AppError>>;
  removeEmployee: (userRoleId: string) => Promise<Result<void, AppError>>;
  softDeleteTenant: (id: string) => Promise<Result<void, AppError>>;
  hardDeleteTenant: (id: string) => Promise<Result<void, AppError>>;
  restoreTenant: (id: string) => Promise<Result<void, AppError>>;
  resetPassword: (userId: string, newPassword: string) => Promise<Result<void, AppError>>;
}

export function useAdminPanel(): UseAdminPanelReturn {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<UserRole[]>([]);
  const [allUsers, setAllUsers] = useState<GlobalUser[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionView[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<TenantAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await adminService.fetchTenants();
    if (result.ok) {
      setTenants(result.data);
    } else {
      setError(result.error.message);
    }
    setIsLoading(false);
  }, []);

  const fetchUsers = useCallback(async (tenantId?: string) => {
    setIsLoading(true);
    setError(null);
    const result = await adminService.fetchUsers(tenantId);
    if (result.ok) {
      setUsers(result.data);
    } else {
      setError(result.error.message);
    }
    setIsLoading(false);
  }, []);

  const fetchAllUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await adminService.fetchAllUsers();
    if (result.ok) {
      setAllUsers(result.data);
    } else {
      setError(result.error.message);
    }
    setIsLoading(false);
  }, []);

  const createTenant = useCallback(async (payload: CreateTenantWithUsersInput) => {
    const result = await adminService.createTenant(payload);
    if (result.ok) {
      await fetchTenants();
    }
    return result;
  }, [fetchTenants]);

  const addEmployee = useCallback(async (payload: { email: string; password: string; name: string; tenantId: string }) => {
    const result = await adminService.addEmployee(payload);
    if (result.ok) {
      await fetchUsers(payload.tenantId);
    }
    return result;
  }, [fetchUsers]);

  const updateTenant = useCallback(async (id: string, data: Partial<Pick<Tenant, 'name' | 'rif'>>) => {
    const result = await adminService.updateTenant(id, data);
    if (result.ok) {
      await fetchTenants();
    }
    return result;
  }, [fetchTenants]);

  const removeEmployee = useCallback(async (userRoleId: string) => {
    const result = await adminService.removeEmployee(userRoleId);
    if (result.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userRoleId));
    }
    return result;
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await adminService.fetchSubscriptionView();
    if (result.ok) {
      setSubscriptions(result.data);
    } else {
      setError(result.error.message);
    }
    setIsLoading(false);
  }, []);

  const renewSubscription = useCallback(async (tenantId: string) => {
    const result = await adminService.renewSubscription(tenantId);
    if (result.ok) {
      await fetchSubscriptions();
    }
    return result;
  }, [fetchSubscriptions]);

  const softDeleteTenant = useCallback(async (id: string) => {
    const result = await adminService.softDeleteTenant(id);
    if (result.ok) {
      await fetchTenants();
    }
    return result;
  }, [fetchTenants]);

  const hardDeleteTenant = useCallback(async (id: string) => {
    const result = await adminService.hardDeleteTenant(id);
    if (result.ok) {
      await fetchTenants();
    }
    return result;
  }, [fetchTenants]);

  const restoreTenant = useCallback(async (id: string) => {
    const result = await adminService.restoreTenant(id);
    if (result.ok) {
      await fetchTenants();
    }
    return result;
  }, [fetchTenants]);

  const resetPassword = useCallback(async (userId: string, newPassword: string) => {
    return adminService.resetPassword(userId, newPassword);
  }, []);

  const fetchDashboardStats = useCallback(async () => {
    const result = await adminService.fetchDashboardStats();
    if (result.ok) {
      setDashboardStats(result.data);
    }
  }, []);

  const fetchAnalytics = useCallback(async (tenantId: string) => {
    setAnalytics(null);
    const result = await adminService.getTenantAnalytics(tenantId);
    if (result.ok) {
      setAnalytics(result.data);
    }
  }, []);

  return {
    tenants,
    users,
    allUsers,
    subscriptions,
    dashboardStats,
    analytics,
    isLoading,
    error,
    fetchTenants,
    fetchUsers,
    fetchAllUsers,
    fetchSubscriptions,
    fetchDashboardStats,
    fetchAnalytics,
    renewSubscription,
    createTenant,
    addEmployee,
    updateTenant,
    removeEmployee,
    softDeleteTenant,
    hardDeleteTenant,
    restoreTenant,
    resetPassword,
  };
}
