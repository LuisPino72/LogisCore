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

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('sessionStorage', sessionStorageMock);
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'mocked-uuid-' + Math.random().toString(36).slice(2) },
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, userAgent: 'node-test-agent' },
  configurable: true,
});
const documentListeners: Record<string, Set<EventListener>> = {};
Object.defineProperty(globalThis, 'document', {
  value: {
    addEventListener: (event: string, listener: EventListener) => {
      if (!documentListeners[event]) documentListeners[event] = new Set();
      documentListeners[event]!.add(listener);
    },
    removeEventListener: (event: string, listener: EventListener) => {
      documentListeners[event]?.delete(listener);
    },
    visibilityState: 'visible',
  },
  configurable: true,
});

const mocks = vi.hoisted(() => {
  const subscriptionResponse: { data: { status: string; expires_at: string } | null; error: { message: string } | null } = {
    data: null,
    error: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chainableFrom: any = {
    select: vi.fn(() => chainableFrom),
    eq: vi.fn(() => chainableFrom),
    is: vi.fn(() => chainableFrom),
    maybeSingle: vi.fn(() => Promise.resolve(subscriptionResponse)),
  };
  return {
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    refreshSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    logAuditEvent: vi.fn(() => Promise.resolve()),
    initDb: vi.fn(),
    isDbReady: vi.fn(() => false),
    resetDbInstance: vi.fn(),
    setDbClosing: vi.fn(),
    getDb: vi.fn(),
    syncEngine: {
      registerTable: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      push: vi.fn(() => Promise.resolve()),
    },
    syncQueue: {
      enqueue: vi.fn(),
      getPendingCount: vi.fn(() => Promise.resolve(0)),
    },
    outboxProcessor: {
      start: vi.fn(),
      stop: vi.fn(),
    },
    uuidToSlug: vi.fn(() => Promise.resolve('test-tenant')),
    clearCache: vi.fn(),
    eventBusEmit: vi.fn(),
    eventBusOn: vi.fn(),
    eventBusOff: vi.fn(),
    supabaseFrom: vi.fn(() => chainableFrom),
    subscriptionResponse,
  };
});

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
    },
    rpc: mocks.rpc,
    from: mocks.supabaseFrom,
  },
}));

vi.mock('../../services/audit/auditService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/audit/auditService')>();
  return {
    ...actual,
    logAuditEvent: mocks.logAuditEvent,
  };
});

vi.mock('../../services/dexie/db', () => ({
  initDb: mocks.initDb,
  isDbReady: mocks.isDbReady,
  resetDbInstance: mocks.resetDbInstance,
  setDbClosing: mocks.setDbClosing,
  getDb: mocks.getDb,
}));

vi.mock('../../services/sync/syncEngine', () => ({
  syncEngine: mocks.syncEngine,
}));

vi.mock('../../services/sync/syncQueue', () => ({
  syncQueue: mocks.syncQueue,
}));

vi.mock('../../services/outbox/outboxProcessor', () => ({
  outboxProcessor: mocks.outboxProcessor,
}));

vi.mock('../../services/tenantTranslator', () => ({
  TenantTranslator: {
    uuidToSlug: mocks.uuidToSlug,
    clearCache: mocks.clearCache,
  },
}));

vi.mock('@logiscore/core', () => ({
  AppError: class AppError extends Error {
    public code: string;
    public details?: Record<string, unknown>;
    constructor(code: string, msg: string, opts?: { details?: Record<string, unknown> }) {
      super(msg);
      this.code = code;
      this.details = opts?.details;
      this.name = 'AppError';
    }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: unknown) => ({ ok: false, error: err }) as const,
  EventBus: {
    on: mocks.eventBusOn,
    off: mocks.eventBusOff,
    emit: mocks.eventBusEmit,
  },
  SystemEvents: { USER_LOGOUT: 'USER_LOGOUT' },
}));

import { authService } from '../../features/auth/services/authService';
import { sessionGuard } from '../../features/auth/services/sessionGuardService';
import { useAuthStore } from '../../features/auth/stores/authStore';

const SESSION_TOKEN_KEY = 'v2_logiscore_session_token';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.mock-signature`;
}

const futureExp = Math.floor(Date.now() / 1000) + 3600;
const baseJwtToken = makeJwt({
  exp: futureExp,
  app_metadata: { role: 'owner', tenant_id: 'tenant-uuid-1' },
  role: 'owner',
  tenant_id: 'tenant-uuid-1',
});

const baseSession = {
  access_token: baseJwtToken,
  refresh_token: 'mock-refresh',
  expires_in: 3600,
  expires_at: futureExp,
  token_type: 'bearer',
  user: {
    id: 'user-uuid-1',
    email: 'test@test.com',
    app_metadata: { role: 'owner', tenant_id: 'tenant-uuid-1' },
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  },
};

function setSubscriptionResponse(data: { status: string; expires_at: string } | null, error: { message: string } | null = null) {
  mocks.subscriptionResponse.data = data;
  mocks.subscriptionResponse.error = error;
}

describe('LOGIN-001-06a: Heartbeat failure fuerza logout (issue #8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    sessionStorageMock.clear();
    sessionGuard.stopHeartbeat();
    sessionGuard.generateSessionToken();
    (sessionGuard as unknown as { heartbeatFailures: number }).heartbeatFailures = 0;
  });

  describe('Escenario 11: Heartbeat failure → 3 fallos → logout automático', () => {
    it('Given: sendHeartbeat con token + supabase.rpc falla. When: 3 fallos consecutivos. Then: EventBus.emit(USER_LOGOUT) se llama', async () => {
      mocks.rpc.mockRejectedValue(new Error('network error'));

      const sendHeartbeat = (sessionGuard as unknown as { sendHeartbeat: () => Promise<void> }).sendHeartbeat;
      await sendHeartbeat.call(sessionGuard);
      await sendHeartbeat.call(sessionGuard);
      await sendHeartbeat.call(sessionGuard);

      const userLogoutCalls = mocks.eventBusEmit.mock.calls.filter(
        (call) => call[0] === 'USER_LOGOUT',
      );
      expect(userLogoutCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('Given: sendHeartbeat con token. When: 1 fallo. Then: EventBus.emit(USER_LOGOUT) NO se llama (aún no llega a 3)', async () => {
      mocks.rpc.mockRejectedValue(new Error('network error'));

      const sendHeartbeat = (sessionGuard as unknown as { sendHeartbeat: () => Promise<void> }).sendHeartbeat;
      await sendHeartbeat.call(sessionGuard);

      const userLogoutCalls = mocks.eventBusEmit.mock.calls.filter(
        (call) => call[0] === 'USER_LOGOUT',
      );
      expect(userLogoutCalls.length).toBe(0);
    });

    it('Given: sendHeartbeat con token. When: 3 fallos. Then: clearToken() ejecuta (token removido de sessionStorage)', async () => {
      mocks.rpc.mockRejectedValue(new Error('network error'));

      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeTruthy();

      const sendHeartbeat = (sessionGuard as unknown as { sendHeartbeat: () => Promise<void> }).sendHeartbeat;
      await sendHeartbeat.call(sessionGuard);
      await sendHeartbeat.call(sessionGuard);
      await sendHeartbeat.call(sessionGuard);

      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    });
  });
});

describe('LOGIN-001-06b: Reorder initDb + harden signOut (issues #10, #11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    sessionStorageMock.clear();
    sessionGuard.stopHeartbeat();
    (sessionGuard as unknown as { heartbeatFailures: number }).heartbeatFailures = 0;
    setSubscriptionResponse(null, null);
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  describe('Escenario 13: initDb no se ejecuta si suscripción inválida', () => {
    it('Given: suscripción expirada. When: authService.login. Then: initDb NO se llama y retorna failure(AUTH_SUBSCRIPTION_EXPIRED)', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: baseSession, user: baseSession.user },
        error: null,
      });
      mocks.rpc.mockImplementation((name: string) => {
        if (name === 'claim_active_session') {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      setSubscriptionResponse({ status: 'expired', expires_at: '2020-01-01T00:00:00Z' });

      const result = await authService.login('test@test.com', 'Password123!');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_SUBSCRIPTION_EXPIRED');
      }
      expect(mocks.initDb).not.toHaveBeenCalled();
    });
  });

  describe('Escenario 14: signOut robusto con try/catch + retry', () => {
    it('Given: supabase.auth.signOut falla 1ra vez. When: authService.signOut. Then: reintenta 1 vez y retorna success', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });
      mocks.signOut
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ error: null });

      const result = await authService.signOut();

      expect(result.ok).toBe(true);
      expect(mocks.signOut).toHaveBeenCalledTimes(2);
    });

    it('Given: supabase.auth.signOut falla 2 veces. When: authService.signOut. Then: continúa best-effort y retorna success', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });
      mocks.signOut
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error again'));

      const result = await authService.signOut();

      expect(result.ok).toBe(true);
      expect(mocks.signOut).toHaveBeenCalledTimes(2);
    });
  });
});

describe('LOGIN-001-07: Double submit + AbortController (issues #9, #12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    sessionStorageMock.clear();
    sessionGuard.stopHeartbeat();
    (sessionGuard as unknown as { heartbeatFailures: number }).heartbeatFailures = 0;
    setSubscriptionResponse(null, null);
    useAuthStore.setState({
      status: 'idle',
      session: null,
      isLoggingIn: false,
      loginError: null,
      fieldErrors: {},
      loginAttempts: 0,
      loginCooldownUntil: 0,
    });
  });

  describe('Escenario 12: Doble submit prevention', () => {
    it('Given: useAuthStore.login. When: 2 llamadas concurrentes. Then: solo 1 llega a supabase.auth.signInWithPassword', async () => {
      mocks.signInWithPassword.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                data: { session: baseSession, user: baseSession.user },
                error: null,
              });
            }, 50);
          }),
      );
      mocks.rpc.mockImplementation((name: string) => {
        if (name === 'claim_active_session') {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      setSubscriptionResponse(null, null);

      const store = useAuthStore.getState();
      const email = 'test@test.com';
      const password = 'Valid@123';

      const promise1 = store.login(email, password);
      const promise2 = store.login(email, password);

      await Promise.all([promise1, promise2]);

      expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
    });
  });

  describe('Escenario 15: buildUserSession con AbortController cancela si logout ocurre', () => {
    it('Given: buildUserSession con signal abortado. When: se llama. Then: rechaza sin ejecutar initDb ni TenantTranslator', async () => {
      const controller = new AbortController();
      controller.abort();

      const buildUserSession = (
        authService as unknown as {
          buildUserSession: (s: typeof baseSession, opts?: { signal?: AbortSignal }) => Promise<unknown>;
        }
      ).buildUserSession;

      if (typeof buildUserSession === 'function') {
        await expect(
          buildUserSession(baseSession, { signal: controller.signal }),
        ).rejects.toThrow();
        expect(mocks.uuidToSlug).not.toHaveBeenCalled();
        expect(mocks.initDb).not.toHaveBeenCalled();
      } else {
        throw new Error('buildUserSession should be exposed on authService');
      }
    });

    it('Given: buildUserSession con signal no abortado. When: se llama. Then: completa normalmente', async () => {
      const controller = new AbortController();

      const buildUserSession = (
        authService as unknown as {
          buildUserSession: (s: typeof baseSession, opts?: { signal?: AbortSignal }) => Promise<unknown>;
        }
      ).buildUserSession;

      if (typeof buildUserSession === 'function') {
        const result = await buildUserSession(baseSession, { signal: controller.signal });
        expect(result).toBeTruthy();
      } else {
        throw new Error('buildUserSession should be exposed on authService');
      }
    });
  });
});

describe('LOGIN-001-08: site_url config dashboard (issue #13)', () => {
  it('Escenario 16: site_url (skip — requiere acceso a Supabase dashboard, ver TODO-LOGIN-001-08-site-url-dashboard.md)', () => {
    expect(true).toBe(true);
  });
});
