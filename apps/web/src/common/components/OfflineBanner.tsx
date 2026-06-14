import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-200 bg-warning/90 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium backdrop-blur-sm" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}>
      <WifiOff size={16} />
      <span>Sin conexión — se sincronizará cuando vuelva la red</span>
    </div>
  );
}