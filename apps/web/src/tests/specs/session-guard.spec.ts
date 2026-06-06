// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError, EventBus, SystemEvents } from '@logiscore/core';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));

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

Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'mocked-uuid-' + Math.random().toString(36).slice(2) },
  configurable: true,
});

Object.defineProperty(globalThis, 'document', {
  value: {
    addEventListener: mocks.addEventListener,
    removeEventListener: mocks.removeEventListener,
    visibilityState: 'visible',
  },
  configurable: true,
});

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, userAgent: 'node-test' },
  configurable: true,
});

import { sessionGuard } from '../../features/auth/services/sessionGuardService';

const SESSION_TOKEN_KEY = 'v2_logiscore_session_token';

function resetSingleton(): void {
  (sessionGuard as unknown as { token: string | null }).token = null;
  (sessionGuard as unknown as { heartbeatTimer: ReturnType<typeof setInterval> | null }).heartbeatTimer = null;
  (sessionGuard as unknown as { heartbeatFailures: number }).heartbeatFailures = 0;
  sessionStorageMock.clear();
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(() => Promise.resolve({ data: null, error: null }));
  mocks.addEventListener.mockClear();
  mocks.removeEventListener.mockClear();
}

describe('LOGIN-001-11 sessionGuardService: claim / release / heartbeat / token lifecycle', () => {
  beforeEach(() => {
    resetSingleton();
  });

  describe('getSessionToken / generateSessionToken / restoreSessionToken', () => {
    it('Given: state limpio + storage vacio. When: getSessionToken. Then: null', () => {
      expect(sessionGuard.getSessionToken()).toBeNull();
    });

    it('Given: state limpio + storage vacio. When: generateSessionToken. Then: retorna uuid + persiste en sessionStorage', () => {
      const token = sessionGuard.generateSessionToken();
      expect(token).toMatch(/^mocked-uuid-/);
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(token);
    });

    it('Given: token en sessionStorage + state interno null. When: getSessionToken. Then: restaura del storage', () => {
      sessionStorageMock.setItem(SESSION_TOKEN_KEY, 'uuid-persisted');
      expect(sessionGuard.getSessionToken()).toBe('uuid-persisted');
    });

    it('Given: token en sessionStorage + state null. When: restoreSessionToken. Then: retorna el token y lo guarda en state', () => {
      sessionStorageMock.setItem(SESSION_TOKEN_KEY, 'uuid-stored');
      expect(sessionGuard.restoreSessionToken()).toBe('uuid-stored');
      expect((sessionGuard as unknown as { token: string | null }).token).toBe('uuid-stored');
    });

    it('Given: storage vacio. When: restoreSessionToken. Then: null', () => {
      expect(sessionGuard.restoreSessionToken()).toBeNull();
    });
  });

  describe('claim: admin bypass', () => {
    it('Given: adminBypass=true. When: claim. Then: success sin llamar RPC', async () => {
      const result = await sessionGuard.claim(true);
      expect(result.ok).toBe(true);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });

  describe('claim: genera token + llama RPC', () => {
    it('Given: state limpio + adminBypass=false + rpc OK. When: claim. Then: success y rpc llamado con claim_active_session', async () => {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
      const result = await sessionGuard.claim(false);
      expect(result.ok).toBe(true);
      expect(mocks.rpc).toHaveBeenCalledWith(
        'claim_active_session',
        expect.objectContaining({ p_session_token: expect.stringMatching(/^mocked-uuid-/) }),
      );
    });

    it('Given: rpc retorna SESSION_ALREADY_ACTIVE. When: claim. Then: failure(AUTH_SESSION_ACTIVE) + token clearado', async () => {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'SESSION_ALREADY_ACTIVE' } });
      const result = await sessionGuard.claim(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_SESSION_ACTIVE');
        expect(result.error).toBeInstanceOf(AppError);
      }
      expect((sessionGuard as unknown as { token: string | null }).token).toBeNull();
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    });

    it('Given: rpc error generico. When: claim. Then: failure(AUTH_SESSION_ERROR)', async () => {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'something else' } });
      const result = await sessionGuard.claim(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_SESSION_ERROR');
      }
    });
  });

  describe('release', () => {
    it('Given: token seteado. When: release. Then: rpc llamado + token clearado', async () => {
      sessionGuard.generateSessionToken();
      await sessionGuard.release();
      expect(mocks.rpc).toHaveBeenCalledWith('release_active_session', expect.any(Object));
      expect((sessionGuard as unknown as { token: string | null }).token).toBeNull();
    });

    it('Given: state sin token. When: release. Then: NO llama RPC pero limpia sin error', async () => {
      await sessionGuard.release();
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });

  describe('startHeartbeat / stopHeartbeat', () => {
    it('Given: startHeartbeat. When: stopHeartbeat inmediato. Then: setInterval se limpia y addEventListener llamado', () => {
      sessionGuard.startHeartbeat();
      const timer1 = (sessionGuard as unknown as { heartbeatTimer: ReturnType<typeof setInterval> | null }).heartbeatTimer;
      expect(timer1).not.toBeNull();
      expect(mocks.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      sessionGuard.stopHeartbeat();
      expect((sessionGuard as unknown as { heartbeatTimer: ReturnType<typeof setInterval> | null }).heartbeatTimer).toBeNull();
      expect(mocks.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
  });

  describe('heartbeat fallido N veces dispara logout', () => {
    it('Given: token + rpc heartbeat falla 3 veces. When: sendHeartbeat (privado, simulado). Then: emite USER_LOGOUT + clearToken + stopHeartbeat', async () => {
      const emitSpy = vi.spyOn(EventBus, 'emit');
      mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
      const claimResult = await sessionGuard.claim(false);
      expect(claimResult.ok).toBe(true);

      mocks.rpc.mockRejectedValueOnce(new Error('network'));
      mocks.rpc.mockRejectedValueOnce(new Error('network'));
      mocks.rpc.mockRejectedValueOnce(new Error('network'));

      const sendHeartbeat = (sessionGuard as unknown as { sendHeartbeat: () => Promise<void> }).sendHeartbeat.bind(sessionGuard);
      await sendHeartbeat();
      await sendHeartbeat();
      await sendHeartbeat();

      expect(emitSpy).toHaveBeenCalledWith(SystemEvents.USER_LOGOUT);
      expect((sessionGuard as unknown as { token: string | null }).token).toBeNull();
      expect((sessionGuard as unknown as { heartbeatTimer: ReturnType<typeof setInterval> | null }).heartbeatTimer).toBeNull();
    });
  });
});
