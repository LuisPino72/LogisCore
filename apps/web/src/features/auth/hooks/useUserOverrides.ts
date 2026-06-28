import { useState, useCallback } from 'react';
import type { UserPermissionOverride, CreateOverrideInput } from '../../../specs/roles';
import { userPermissionOverrideService } from '../services/userPermissionOverrideService';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../../../stores/toastStore';
import { handleServiceError } from '../../../common/utils/handleServiceError';

export function useUserOverrides() {
  const session = useAuthStore((s) => s.session);
  const { addToast } = useToastStore();
  const [overrides, setOverrides] = useState<UserPermissionOverride[]>([]);
  const [loading, setLoading] = useState(false);

  const loadOverrides = useCallback(async (userId?: string) => {
    setLoading(true);
    const targetUserId = userId ?? session?.userId;
    if (!targetUserId) {
      setLoading(false);
      return;
    }
    const result = await userPermissionOverrideService.getOverrides(targetUserId);
    if (result.ok) {
      setOverrides(result.data as UserPermissionOverride[]);
    } else {
      handleServiceError(result);
    }
    setLoading(false);
  }, [session?.userId]);

  const addOverride = useCallback(async (input: CreateOverrideInput) => {
    const result = await userPermissionOverrideService.addOverride(input);
    if (result.ok) {
      addToast({ type: 'success', message: 'Permiso individual actualizado.', duration: 3000 });
      await loadOverrides(input.userId);
    } else {
      handleServiceError(result);
    }
    return result;
  }, [addToast, loadOverrides]);

  const removeOverride = useCallback(async (id: string) => {
    const result = await userPermissionOverrideService.removeOverride(id);
    if (result.ok) {
      addToast({ type: 'success', message: 'Permiso eliminado.', duration: 3000 });
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    } else {
      handleServiceError(result);
    }
    return result;
  }, [addToast]);

  return { overrides, loading, loadOverrides, addOverride, removeOverride };
}
