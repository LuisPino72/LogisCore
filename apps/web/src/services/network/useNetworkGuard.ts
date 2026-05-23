import { useSyncExternalStore, useCallback } from 'react';
import { networkAware } from './networkAwareService';

function subscribeToNetwork(callback: () => void): () => void {
  return networkAware.onChange(callback);
}

function getSnapshot(): boolean {
  return networkAware.isOnline();
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeToNetwork, getSnapshot, () => true);
}

export function useNetworkGuard(): {
  isOnline: boolean;
  guard: (action: string) => string | null;
} {
  const isOnline = useOnlineStatus();

  const guard = useCallback(
    (action: string): string | null => {
      if (!isOnline) {
        return `Necesitas internet para ${action}.`;
      }
      return null;
    },
    [isOnline],
  );

  return { isOnline, guard };
}
