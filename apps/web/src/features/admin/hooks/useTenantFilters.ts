import { useState, useMemo } from 'react';
import { useFuzzySearch } from '../../../lib/useFuzzySearch';
import type { Tenant } from '../types';

type FilterStatus = 'all' | 'active' | 'inactive';

interface TenantFilters {
  search: string;
  status: FilterStatus;
  plan: string;
}

export function useTenantFilters(tenants: Tenant[]) {
  const [filters, setFilters] = useState<TenantFilters>({
    search: '',
    status: 'all',
    plan: 'all',
  });

  const fuzzyTenants = useFuzzySearch(tenants, filters.search, { keys: ['name', 'rif'] });

  const filteredTenants = useMemo(() => {
    return fuzzyTenants.filter((t) => {
      if (filters.status === 'active' && t.deletedAt) return false;
      if (filters.status === 'inactive' && !t.deletedAt) return false;
      if (filters.plan !== 'all' && t.plan !== filters.plan) return false;
      return true;
    });
  }, [fuzzyTenants, filters.status, filters.plan]);

  const setSearch = (search: string) => setFilters((f) => ({ ...f, search }));
  const setStatus = (status: FilterStatus) => setFilters((f) => ({ ...f, status }));
  const setPlan = (plan: string) => setFilters((f) => ({ ...f, plan }));

  return {
    filters,
    filteredTenants,
    setSearch,
    setStatus,
    setPlan,
  };
}
