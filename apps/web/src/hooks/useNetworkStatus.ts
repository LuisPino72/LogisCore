import { useState, useEffect } from 'react';
import { networkAware } from '../services/network/networkAwareService';

export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    return networkAware.onChange((state) => {
      setIsOnline(state.online);
    });
  }, []);

  return { isOnline };
}
