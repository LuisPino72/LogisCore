import { useState, useEffect } from 'react';
import { TenantTranslator } from '../../../services/tenantTranslator';
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
      TenantTranslator.slugToUuid(selectedTenantSlug)
        .then((uuid) => { if (!cancelled) setEffectiveTenantId(uuid); })
        .catch(() => { if (!cancelled) setEffectiveTenantId(null); });
    } else {
      setEffectiveTenantId(null);
    }
    return () => { cancelled = true; };
  }, [session?.tenantId, selectedTenantSlug, isAdminViewingTenant]);

  return effectiveTenantId;
}
