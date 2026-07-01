import { useState, useEffect } from 'react';
import { TenantTranslator } from '../../../services/tenantTranslator';
import { initDb } from '../../../services/dexie/dbInstance';
import { useAuthStore } from '../../auth/stores/authStore';
import type { UserSession } from '@logiscore/core';

interface UseTenantResolutionInput {
  session: UserSession | null;
  selectedTenantSlug: string | null;
  isAdminViewingTenant: boolean;
}

export function useTenantResolution({
  session,
  selectedTenantSlug,
  isAdminViewingTenant,
}: UseTenantResolutionInput): string | null {
  const [effectiveTenantId, setEffectiveTenantId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (session?.tenantId) {
      setEffectiveTenantId(session.tenantId);
    } else if (isAdminViewingTenant && selectedTenantSlug) {
      initDb(selectedTenantSlug);
      TenantTranslator.slugToUuid(selectedTenantSlug)
        .then((uuid) => {
          if (cancelled) return;
          setEffectiveTenantId(uuid);
          const currentSession = useAuthStore.getState().session;
          if (currentSession && uuid) {
            useAuthStore.getState().setSession({
              ...currentSession,
              tenantId: uuid,
              tenantSlug: selectedTenantSlug,
            });
          }
        })
        .catch(() => { if (!cancelled) setEffectiveTenantId(null); });
    } else {
      setEffectiveTenantId(null);
    }
    return () => { cancelled = true; };
  }, [session?.tenantId, selectedTenantSlug, isAdminViewingTenant]);

  return effectiveTenantId;
}
