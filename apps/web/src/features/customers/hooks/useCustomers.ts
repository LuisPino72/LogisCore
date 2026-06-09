import { useEffect, useRef, useCallback } from 'react';
import { EventBus } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { useCustomerStore } from '../stores/customerStore';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerHistoryQuery,
} from '../../../specs/customers';

export function useCustomers(tenantId: string | null) {
  const customers = useCustomerStore((s) => s.customers);
  const loading = useCustomerStore((s) => s.loading);
  const error = useCustomerStore((s) => s.error);
  const selectedCustomer = useCustomerStore((s) => s.selectedCustomer);
  const history = useCustomerStore((s) => s.history);
  const historyTotal = useCustomerStore((s) => s.historyTotal);
  const historyLoading = useCustomerStore((s) => s.historyLoading);
  const stats = useCustomerStore((s) => s.stats);

  const fetchCustomers = useCustomerStore((s) => s.fetchCustomers);
  const fetchCustomerById = useCustomerStore((s) => s.fetchCustomerById);
  const fetchCustomerHistory = useCustomerStore((s) => s.fetchCustomerHistory);
  const fetchCustomerStats = useCustomerStore((s) => s.fetchCustomerStats);
  const createCustomer = useCustomerStore((s) => s.createCustomer);
  const updateCustomer = useCustomerStore((s) => s.updateCustomer);
  const deleteCustomer = useCustomerStore((s) => s.deleteCustomer);
  const setSelectedCustomer = useCustomerStore((s) => s.setSelectedCustomer);
  const reset = useCustomerStore((s) => s.reset);

  const session = useAuthStore((s) => s.session);
  const initialFetchDone = useRef(false);

  const doFetch = useCallback(async () => {
    if (!tenantId) return;
    await fetchCustomers(tenantId);
  }, [tenantId, fetchCustomers]);

  useEffect(() => {
    if (!tenantId || initialFetchDone.current) return;
    initialFetchDone.current = true;
    doFetch();
  }, [tenantId, doFetch]);

  useEffect(() => {
    if (!tenantId) return;

    const sub = EventBus.on('SYNC.REFRESH_TABLE', (payload: unknown) => {
      const { table } = payload as { table?: string };
      if (!table || table === 'customers' || table === 'sales') {
        fetchCustomers(tenantId, true);
      }
    });

    const subCreated = EventBus.on('CUSTOMER.CREATED', () => {
      fetchCustomers(tenantId, true);
    });
    const subUpdated = EventBus.on('CUSTOMER.UPDATED', () => {
      fetchCustomers(tenantId, true);
    });
    const subDeleted = EventBus.on('CUSTOMER.DELETED', () => {
      fetchCustomers(tenantId, true);
    });

    return () => {
      EventBus.off(sub);
      EventBus.off(subCreated);
      EventBus.off(subUpdated);
      EventBus.off(subDeleted);
    };
  }, [tenantId, fetchCustomers]);

  return {
    customers,
    loading,
    error,
    selectedCustomer,
    history,
    historyTotal,
    historyLoading,
    stats,
    fetchCustomers,
    fetchCustomerById,
    fetchCustomerHistory,
    fetchCustomerStats,
    createCustomer: (input: CreateCustomerInput) =>
      tenantId && session?.userId ? createCustomer(tenantId, session.userId, input) : Promise.resolve(null),
    updateCustomer: (id: string, input: UpdateCustomerInput) =>
      tenantId ? updateCustomer(id, input, tenantId) : Promise.resolve(false),
    deleteCustomer: (id: string) =>
      tenantId ? deleteCustomer(id, tenantId) : Promise.resolve(false),
    fetchHistory: useCallback(
      (query: CustomerHistoryQuery) =>
        tenantId ? fetchCustomerHistory(query, tenantId) : Promise.resolve(),
      [tenantId, fetchCustomerHistory],
    ),
    fetchStats: useCallback(
      (customerId: string) =>
        tenantId ? fetchCustomerStats(customerId, tenantId) : Promise.resolve(),
      [tenantId, fetchCustomerStats],
    ),
    setSelectedCustomer,
    reset,
    userId: session?.userId ?? null,
    role: session?.role ?? null,
  };
}
