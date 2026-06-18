import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa_install_dismissed';
const INSTALLED_KEY = 'pwa_installed';

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* no storage */ }
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => safeGet(INSTALLED_KEY) === 'true');
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISSED_KEY) === 'true'; } catch { return false; }
  });
  const [checkingInstalled, setCheckingInstalled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const detectInstalled = async () => {
      if (safeGet(INSTALLED_KEY) === 'true') {
        if (!cancelled) { setIsInstalled(true); setCheckingInstalled(false); }
        return;
      }

      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true;
      if (isStandalone) {
        if (!cancelled) setIsInstalled(true);
        safeSet(INSTALLED_KEY, 'true');
        if (!cancelled) { setCheckingInstalled(false); }
        return;
      }

      if ('getInstalledRelatedApps' in navigator) {
        try {
          const relatedApps = await (navigator as any).getInstalledRelatedApps();
          if (relatedApps.length > 0) {
            if (!cancelled) setIsInstalled(true);
            safeSet(INSTALLED_KEY, 'true');
            if (!cancelled) { setCheckingInstalled(false); }
            return;
          }
        } catch { /* getInstalledRelatedApps not supported */ }
      }

      if (!cancelled) setCheckingInstalled(false);
    };

    detectInstalled();

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      safeSet(INSTALLED_KEY, 'true');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        safeSet(INSTALLED_KEY, 'true');
      }
    } catch {
      // prompt() can throw if app is already installed or prompt dismissed
      setIsInstalled(true);
      safeSet(INSTALLED_KEY, 'true');
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* ignore */ }
  }, []);

  return {
    isInstallable: !!deferredPrompt && !isInstalled,
    isInstalled,
    dismissed,
    install,
    dismiss,
    showInstructions: !deferredPrompt && !isInstalled && !dismissed,
    checkingInstalled,
  };
}
