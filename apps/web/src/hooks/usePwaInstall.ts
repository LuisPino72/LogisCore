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

/**
 * Singleton global que captura el evento `beforeinstallprompt` UNA SOLA VEZ
 * y lo mantiene vivo entre navegaciones SPA (login → dashboard).
 * Sin esto, si el usuario descarta el banner nativo de Chrome en el login,
 * el dashboard nunca recibe el evento y el botón "Instalar" no aparece.
 */
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let listeners: Array<() => void> = [];
let listenerAttached = false;

function notifyListeners() {
  for (const fn of listeners) fn();
}

function ensureListener() {
  if (listenerAttached) return;
  listenerAttached = true;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    safeSet(INSTALLED_KEY, 'true');
    notifyListeners();
  });
}

export function usePwaInstall() {
  const [, forceUpdate] = useState(0);
  const [isInstalled, setIsInstalled] = useState(() => safeGet(INSTALLED_KEY) === 'true');
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISSED_KEY) === 'true'; } catch { return false; }
  });
  const [checkingInstalled, setCheckingInstalled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    ensureListener();

    const detectInstalled = async () => {
      if (safeGet(INSTALLED_KEY) === 'true') {
        if (!cancelled) { setIsInstalled(true); setCheckingInstalled(false); }
        return;
      }

      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (isStandalone) {
        if (!cancelled) setIsInstalled(true);
        safeSet(INSTALLED_KEY, 'true');
        if (!cancelled) { setCheckingInstalled(false); }
        return;
      }

      if ('getInstalledRelatedApps' in navigator) {
        try {
          const relatedApps = await (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<Array<Record<string, unknown>>> }).getInstalledRelatedApps?.() ?? [];
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

    const handleGlobalChange = () => {
      forceUpdate((n) => n + 1);
    };

    listeners.push(handleGlobalChange);

    return () => {
      cancelled = true;
      listeners = listeners.filter((fn) => fn !== handleGlobalChange);
    };
  }, []);

  const deferredPrompt = globalDeferredPrompt;

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
      setIsInstalled(true);
      safeSet(INSTALLED_KEY, 'true');
    }
    globalDeferredPrompt = null;
    notifyListeners();
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
