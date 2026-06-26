import { useEffect, useRef, useCallback } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { useAuthStore } from '../../auth/stores/authStore';
import { useCustomerStore } from '../stores/customerStore';
import { useDebouncedCallback } from '../../../common/hooks/useDebouncedCallback';
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

  const refresh = useDebouncedCallback(() => {
    if (!tenantId) return;
    fetchCustomers(tenantId, true);
  }, 300, 1000);

  useEffect(() => {
    if (!tenantId) return;

    const subs = [
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (!table || table === 'customers' || table === 'sales') {
          refresh();
        }
      }),
      EventBus.on(SystemEvents.CUSTOMER_CREATED, refresh),
      EventBus.on(SystemEvents.CUSTOMER_UPDATED, refresh),
      EventBus.on(SystemEvents.CUSTOMER_DELETED, refresh),
      EventBus.on(SystemEvents.SALE_COMPLETED, refresh),
      EventBus.on(SystemEvents.DEBT_COLLECTED, refresh),
    ];

    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, refresh]);

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
