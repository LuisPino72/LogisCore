import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { EventBus, SystemEvents } from '@logiscore/core';
import { getDeliverySettlement, markDeliverySettlementPaid, type DeliverySettlementRow } from '../services/deliverySettlementService';
import { getDateRange } from '../services/reportsHelpers';
import type { ReportFilters } from '../types';

export function useDeliverySettlement(tenantId: string | null, filters: ReportFilters) {
  const [data, setData] = useState<DeliverySettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const dateRange = useMemo(() => getDateRange(filters), [filters]);

  const fetchData = useCallback(async (silent = false) => {
    if (!tenantId) return;
    if (!silent) setLoading(true);
    setError(null);
    const result = await getDeliverySettlement(tenantId, dateRange.start, dateRange.end);
    if (!mountedRef.current) return;
    if (result.ok) {
      setData(result.data);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, [tenantId, dateRange]);

  const paySettlement = useCallback(async (name: string) => {
    const tid = tenantId ?? '';
    const result = await markDeliverySettlementPaid(tid, name, dateRange.start, dateRange.end);
    if (!mountedRef.current) return result;
    if (result.ok) {
      await fetchData(true);
    } else {
      setError(result.error.message);
    }
    return result;
  }, [tenantId, fetchData, dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const subs = [
      EventBus.on(SystemEvents.SYNC_REFRESH_TABLE, (payload: unknown) => {
        const { table } = payload as { table?: string };
        if (table === '*' || table === 'sales') fetchData(true);
      }),
      EventBus.on(SystemEvents.ORDER_DELIVERED, () => fetchData(true)),
    ];
    return () => { subs.forEach((s) => EventBus.off(s)); };
  }, [tenantId, fetchData]);

  return { data, loading, error, refresh: fetchData, paySettlement };
}
