// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('sessionStorage', sessionStorageMock);
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'mocked-uuid-' + Math.random().toString(36).slice(2) },
  configurable: true,
});

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      refreshSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
    rpc: mocks.rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

vi.mock('../../services/audit/auditService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/audit/auditService')>();
  return { ...actual };
});

import { sessionGuard } from '../../features/auth/services/sessionGuardService';
import { offlineGrace } from '../../features/auth/services/offlineGraceService';

const SESSION_TOKEN_KEY = 'logiscore_session_token';
const GRACE_KEY = 'logiscore_offline_grace';

const clientSource = readFileSync(
  resolve(__dirname, '../../services/supabase/client.ts'),
  'utf-8',
);

describe('LOGIN-001-01: Token storage migration + Supabase config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    sessionStorageMock.clear();
  });

  describe('Escenario 1: Token storage migration', () => {
    it('Given: sessionGuard.generateSessionToken(). Then: token se guarda en sessionStorage, NO en localStorage', () => {
      const token = sessionGuard.generateSessionToken();
      expect(token).toBeTruthy();
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(token);
      expect(localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    });

    it('Given: token en sessionStorage. When: restoreSessionToken(). Then: retorna el token persistido', () => {
      const uuid = 'test-uuid-sprint1';
      sessionStorage.setItem(SESSION_TOKEN_KEY, uuid);
      const retrieved = sessionGuard.restoreSessionToken();
      expect(retrieved).toBe(uuid);
    });

    it('Given: token preexistente en localStorage (legacy). When: restoreSessionToken(). Then: NO lo lee (ya no migra)', () => {
      localStorage.setItem(SESSION_TOKEN_KEY, 'legacy-token');
      const retrieved = sessionGuard.restoreSessionToken();
      expect(retrieved).toBeNull();
    });

    it('Given: claim retorna SESSION_ALREADY_ACTIVE. When: sessionGuard.claim. Then: token se remueve de sessionStorage y NO aparece en localStorage', async () => {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'SESSION_ALREADY_ACTIVE' } });
      const result = await sessionGuard.claim(false);
      expect(result.ok).toBe(false);
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    });

    it('Given: offlineGrace.extend("tenant-x"). Then: state se guarda en sessionStorage, NO en localStorage', () => {
      offlineGrace.extend('tenant-x');
      expect(sessionStorage.getItem(GRACE_KEY)).toBeTruthy();
      expect(localStorage.getItem(GRACE_KEY)).toBeNull();
    });

    it('Given: state en sessionStorage. When: offlineGrace.clear(). Then: se remueve de sessionStorage', () => {
      offlineGrace.extend('tenant-x');
      expect(sessionStorage.getItem(GRACE_KEY)).toBeTruthy();
      offlineGrace.clear();
      expect(sessionStorage.getItem(GRACE_KEY)).toBeNull();
    });
  });

  describe('Escenario 2: Supabase persistSession disabled', () => {
    it('Given: client.ts. Then: contiene auth.persistSession = false', () => {
      expect(clientSource).toMatch(/persistSession:\s*false/);
    });

    it('Given: client.ts. Then: NO contiene log_level: debug (Escenario 9)', () => {
      expect(clientSource).not.toMatch(/log_level:\s*['"]debug['"]/);
    });
  });
});
