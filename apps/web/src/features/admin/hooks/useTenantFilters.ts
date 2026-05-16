import { useState, useMemo } from 'react';
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

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      // Search by name or RIF
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const nameMatch = t.name.toLowerCase().includes(q);
        const rifMatch = t.rif.toLowerCase().includes(q);
        if (!nameMatch && !rifMatch) return false;
      }

      // Status filter
      if (filters.status === 'active' && t.deletedAt) return false;
      if (filters.status === 'inactive' && !t.deletedAt) return false;

      // Plan filter
      if (filters.plan !== 'all' && t.plan !== filters.plan) return false;

      return true;
    });
  }, [tenants, filters]);

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
