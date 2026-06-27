import { useState, useCallback, useEffect } from 'react';
import { getDeliverySettlement, type DeliverySettlementRow } from '../services/deliverySettlementService';

interface DateRange {
  start: string;
  end: string;
}

function getTodayRange(): DateRange {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  return { start: `${today}T00:00:00`, end: `${today}T23:59:59` };
}

export function useDeliverySettlement(tenantId: string | null) {
  const [data, setData] = useState<DeliverySettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<DateRange>(getTodayRange);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const result = await getDeliverySettlement(tenantId, date.start, date.end);
    if (result.ok) setData(result.data);
    setLoading(false);
  }, [tenantId, date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, date, setDate, refresh: fetchData };
}
