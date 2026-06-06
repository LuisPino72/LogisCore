import { useState, useCallback } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { adminService } from '../services/adminService';
import { CreateEmployeeInputSchema } from '../types';
import type { Tenant, UserRole, GlobalUser, CreateTenantResponse, SubscriptionView, DashboardStats, TenantAnalytics, GlobalCategory } from '../types';

interface UseAdminPanelReturn {
  tenants: Tenant[];
  users: UserRole[];
  allUsers: GlobalUser[];
  subscriptions: SubscriptionView[];
  globalCategories: GlobalCategory[];
  dashboardStats: DashboardStats | null;
  analytics: TenantAnalytics | null;
  isLoading: boolean;
  error: string | null;
  fetchTenants: () => Promise<void>;
  fetchUsers: (tenantId: string) => Promise<void>;
  fetchAllUsers: () => Promise<void>;
  fetchSubscriptions: () => Promise<void>;
  fetchGlobalCategories: () => Promise<void>;
  fetchDashboardStats: () => Promise<void>;
  fetchAnalytics: (tenantId: string) => Promise<void>;
  renewSubscription: (tenantId: string) => Promise<Result<void, AppError>>;
  createTenant: (payload: unknown) => Promise<Result<CreateTenantResponse, AppError>>;
  addEmployee: (payload: unknown) => Promise<Result<{ id: string; email: string; name: string }, AppError>>;
  updateTenant: (id: string, data: unknown) => Promise<Result<Tenant, AppError>>;
  removeEmployee: (userRoleId: string) => Promise<Result<void, AppError>>;
  softDeleteTenant: (id: string) => Promise<Result<void, AppError>>;
  hardDeleteTenant: (id: string) => Promise<Result<void, AppError>>;
  restoreTenant: (id: string) => Promise<Result<void, AppError>>;
  resetPassword: (userId: string, newPassword: string) => Promise<Result<void, AppError>>;
  createGlobalCategory: (input: unknown) => Promise<Result<GlobalCategory, AppError>>;
  updateGlobalCategory: (id: string, name: string) => Promise<Result<GlobalCategory, AppError>>;
  deleteGlobalCategory: (id: string) => Promise<Result<void, AppError>>;
}

export function useAdminPanel(): UseAdminPanelReturn {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<UserRole[]>([]);
  const [allUsers, setAllUsers] = useState<GlobalUser[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionView[]>([]);
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
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

  const fetchUsers = useCallback(async (tenantId: string) => {
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

  const createTenant = useCallback(async (payload: unknown) => {
    const result = await adminService.createTenant(payload);
    if (result.ok) {
      await fetchTenants();
    }
    return result;
  }, [fetchTenants]);

  const addEmployee = useCallback(async (payload: unknown) => {
    const result = await adminService.addEmployee(payload);
    if (result.ok) {
      const parsed = CreateEmployeeInputSchema.safeParse(payload);
      if (parsed.success) {
        await fetchUsers(parsed.data.tenantId);
      }
    }
    return result;
  }, [fetchUsers]);

  const updateTenant = useCallback(async (id: string, data: unknown) => {
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
      await fetchSubscriptions();
    }
    return result;
  }, [fetchTenants, fetchSubscriptions]);

  const resetPassword = useCallback(async (userId: string, newPassword: string) => {
    return adminService.resetPassword(userId, newPassword);
  }, []);

  const fetchDashboardStats = useCallback(async () => {
    const result = await adminService.fetchDashboardStats();
    if (result.ok) {
      setDashboardStats(result.data);
    }
  }, []);

  const fetchGlobalCategories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await adminService.fetchGlobalCategories();
    if (result.ok) {
      setGlobalCategories(result.data);
    } else {
      setError(result.error.message);
    }
    setIsLoading(false);
  }, []);

  const createGlobalCategory = useCallback(async (input: unknown) => {
    const result = await adminService.createGlobalCategory(input);
    if (result.ok) {
      await fetchGlobalCategories();
    }
    return result;
  }, [fetchGlobalCategories]);

  const updateGlobalCategory = useCallback(async (id: string, name: string) => {
    const result = await adminService.updateGlobalCategory(id, name);
    if (result.ok) {
      await fetchGlobalCategories();
    }
    return result;
  }, [fetchGlobalCategories]);

  const deleteGlobalCategory = useCallback(async (id: string) => {
    const result = await adminService.deleteGlobalCategory(id);
    if (result.ok) {
      await fetchGlobalCategories();
    }
    return result;
  }, [fetchGlobalCategories]);

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
    globalCategories,
    dashboardStats,
    analytics,
    isLoading,
    error,
    fetchTenants,
    fetchUsers,
    fetchAllUsers,
    fetchSubscriptions,
    fetchGlobalCategories,
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
    createGlobalCategory,
    updateGlobalCategory,
    deleteGlobalCategory,
  };
}
