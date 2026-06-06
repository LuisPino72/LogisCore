// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear: () => {
      store = {};
    },
    getItem: (key: string) => (key in store ? store[key]! : null),
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
  };
}

const sessionStorageMock = createStorageMock();
vi.stubGlobal('sessionStorage', sessionStorageMock);

import { offlineGrace } from '../../features/auth/services/offlineGraceService';

const GRACE_KEY = 'v2_logiscore_offline_grace';
const NOW = 1_700_000_000_000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

describe('LOGIN-001-11 offlineGraceService: extend / isExpired / clear / getTenantSlug / getRemainingMinutes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorageMock.clear();
    (offlineGrace as unknown as { state: unknown }).state = null;
  });

  describe('Escenario A: extend + isExpired dentro de 6h', () => {
    it('Given: extend("tenant-x") + Date.now retornando NOW. When: isExpired() inmediatamente. Then: false', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      offlineGrace.extend('tenant-x');
      expect(offlineGrace.isExpired()).toBe(false);
    });

    it('Given: extend + 5h59m transcurridas. When: isExpired. Then: false (dentro de grace)', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      offlineGrace.extend('tenant-x');
      vi.spyOn(Date, 'now').mockReturnValue(NOW + SIX_HOURS_MS - 60_000);
      expect(offlineGrace.isExpired()).toBe(false);
    });
  });

  describe('Escenario B: isExpired más de 6h', () => {
    it('Given: extend + 6h1m transcurridas. When: isExpired. Then: true', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      offlineGrace.extend('tenant-x');
      vi.spyOn(Date, 'now').mockReturnValue(NOW + SIX_HOURS_MS + 60_000);
      expect(offlineGrace.isExpired()).toBe(true);
    });

    it('Given: state nunca seteado. When: isExpired. Then: true (sin grace)', () => {
      expect(offlineGrace.isExpired()).toBe(true);
    });
  });

  describe('Escenario C: clear', () => {
    it('Given: extend + clear. When: getTenantSlug + isExpired. Then: null + true', () => {
      offlineGrace.extend('tenant-x');
      expect(sessionStorage.getItem(GRACE_KEY)).toBeTruthy();
      offlineGrace.clear();
      expect(sessionStorage.getItem(GRACE_KEY)).toBeNull();
      expect(offlineGrace.getTenantSlug()).toBeNull();
      expect(offlineGrace.isExpired()).toBe(true);
    });
  });

  describe('Cobertura adicional', () => {
    it('Given: extend("tenant-y"). When: getTenantSlug. Then: retorna "tenant-y"', () => {
      offlineGrace.extend('tenant-y');
      expect(offlineGrace.getTenantSlug()).toBe('tenant-y');
    });

    it('Given: extend + reset state interna + sessionStorage tiene data. When: getTenantSlug. Then: load() restaura', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      offlineGrace.extend('tenant-z');
      (offlineGrace as unknown as { state: unknown }).state = null;
      expect(offlineGrace.getTenantSlug()).toBe('tenant-z');
    });

    it('Given: extend + 3h transcurridas. When: getRemainingMinutes. Then: ~180 minutos', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      offlineGrace.extend('tenant-x');
      vi.spyOn(Date, 'now').mockReturnValue(NOW + 3 * 60 * 60 * 1000);
      expect(offlineGrace.getRemainingMinutes()).toBe(180);
    });

    it('Given: state expirado. When: getRemainingMinutes. Then: 0', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      offlineGrace.extend('tenant-x');
      vi.spyOn(Date, 'now').mockReturnValue(NOW + SIX_HOURS_MS + 60_000);
      expect(offlineGrace.getRemainingMinutes()).toBe(0);
    });

    it('Given: sin state. When: getRemainingMinutes. Then: 0', () => {
      expect(offlineGrace.getRemainingMinutes()).toBe(0);
    });
  });
});
