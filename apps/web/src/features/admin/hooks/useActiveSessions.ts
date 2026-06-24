import { useState, useEffect, useCallback } from 'react';
import { getDb } from '../../../services/dexie/db';
import type { DexieCashRegister } from '../../../services/dexie/db';

interface ActiveSession extends DexieCashRegister {
  registerName?: string;
  operatorName?: string;
}

export function useActiveSessions(tenantId: string | null) {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!tenantId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const db = getDb();
      const activeSessions = await db.cashRegisters
        .where({ tenantId, isOpen: true })
        .filter((s) => !s.deletedAt)
        .toArray();

      const registerIds = activeSessions.map((s) => s.registerId).filter(Boolean) as string[];
      const registers = registerIds.length > 0
        ? await db.registerConfigs.where('id').anyOf(registerIds).toArray()
        : [];
      const registerMap = new Map(registers.map((r) => [r.id, r.name]));

      const enriched: ActiveSession[] = activeSessions.map((s) => ({
        ...s,
        registerName: s.registerId ? registerMap.get(s.registerId) : undefined,
      }));

      setSessions(enriched);
    } catch {
      setSessions([]);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  return { sessions, loading, refresh: fetchSessions };
}
