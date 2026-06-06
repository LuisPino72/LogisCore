// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError, EventBus, SystemEvents } from '@logiscore/core';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
  getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
  refreshSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        is: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  })),
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
  uuidToSlug: vi.fn(() => Promise.resolve('tenant-slug-x')),
  clearCache: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  claim: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  release: vi.fn(() => Promise.resolve()),
  generateSessionToken: vi.fn(() => 'mock-uuid'),
  restoreSessionToken: vi.fn(() => 'mock-uuid'),
  startHeartbeat: vi.fn(),
  offlineGrace: {
    isExpired: vi.fn(() => false),
    getTenantSlug: vi.fn(() => 'tenant-slug-x'),
    extend: vi.fn(),
    clear: vi.fn(),
    state: null as unknown,
  },
  getRemainingMinutes: vi.fn(() => 180),
}));

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
    },
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

vi.mock('../../services/tenantTranslator', () => ({
  TenantTranslator: {
    uuidToSlug: mocks.uuidToSlug,
    clearCache: mocks.clearCache,
  },
}));

vi.mock('../../services/dexie/db', () => ({
  initDb: mocks.initDb,
  setDbClosing: mocks.setDbClosing,
  getDb: mocks.getDb,
  isDbReady: mocks.isDbReady,
  resetDbInstance: mocks.resetDbInstance,
}));

vi.mock('../../services/sync/syncEngine', () => ({
  syncEngine: mocks.syncEngine,
}));

vi.mock('../../services/sync/syncQueue', () => ({
  syncQueue: mocks.syncQueue,
}));

vi.mock('../../services/audit/auditService', () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

vi.mock('../../services/outbox/outboxProcessor', () => ({
  outboxProcessor: mocks.outboxProcessor,
}));

vi.mock('../../features/auth/services/sessionGuardService', () => ({
  sessionGuard: {
    claim: mocks.claim,
    release: mocks.release,
    generateSessionToken: mocks.generateSessionToken,
    restoreSessionToken: mocks.restoreSessionToken,
    startHeartbeat: mocks.startHeartbeat,
    addEventListener: mocks.addEventListener,
    removeEventListener: mocks.removeEventListener,
  },
}));

vi.mock('../../features/auth/services/offlineGraceService', () => ({
  offlineGrace: mocks.offlineGrace,
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

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('sessionStorage', sessionStorageMock);

Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'mocked-uuid-' + Math.random().toString(36).slice(2) },
  configurable: true,
});

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, userAgent: 'node-test' },
  configurable: true,
});

import { authService } from '../../features/auth/services/authService';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.mock-sig`;
}

const NOW = 1_700_000_000_000;
const FUTURE_EXP = Math.floor(NOW / 1000) + 3600;
const ADMIN_TOKEN = makeJwt({
  exp: FUTURE_EXP,
  app_metadata: { role: 'admin', tenant_id: 'tenant-uuid-1' },
  sub: 'user-id-1',
  email: 'admin@test.com',
});
const OWNER_TOKEN = makeJwt({
  exp: FUTURE_EXP,
  app_metadata: { role: 'owner', tenant_id: 'tenant-uuid-2' },
  sub: 'user-id-2',
  email: 'owner@test.com',
});

function resetAllMocks(): void {
  for (const key of Object.keys(mocks)) {
    const m = (mocks as unknown as Record<string, unknown>)[key];
    if (typeof m === 'function' && 'mockReset' in m) {
      (m as { mockReset: () => void }).mockReset();
    }
  }
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.claim.mockResolvedValue({ ok: true, value: undefined });
  mocks.uuidToSlug.mockResolvedValue('tenant-slug-x');
  mocks.isDbReady.mockReturnValue(false);
  mocks.offlineGrace.isExpired.mockReturnValue(false);
  mocks.offlineGrace.getTenantSlug.mockReturnValue('tenant-slug-x');
  mocks.from.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        is: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  });
  localStorageMock.clear();
  sessionStorageMock.clear();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
}

describe('LOGIN-001-11 authService: login / bootstrap / signOut / refresh / subscription', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('sanitizeEmail (vía login) + mapSupabaseAuthError', () => {
    it('Given: email con espacios + MAYUSCULAS. When: login. Then: signInWithPassword recibe email trim+lowercase', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: { access_token: ADMIN_TOKEN, user: { id: 'u-1', email: 'admin@test.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const result = await authService.login('  Admin@Test.COM  ', 'pw');
      expect(result.ok).toBe(true);
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'admin@test.com', password: 'pw' });
    });

    it('Given: error "Invalid login credentials". When: login. Then: failure(AUTH_INVALID_CREDENTIALS) + audit USER.LOGIN_FAILED', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'Invalid login credentials' },
      });
      const result = await authService.login('user@test.com', 'wrong');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      }
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'USER.LOGIN_FAILED', payload: expect.objectContaining({ reason: 'invalid_credentials' }) }));
    });

    it('Given: error "Email not confirmed". When: login. Then: failure(AUTH_EMAIL_NOT_CONFIRMED) + audit reason email_not_confirmed', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'Email not confirmed' },
      });
      const result = await authService.login('user@test.com', 'pw');
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_EMAIL_NOT_CONFIRMED');
      }
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ reason: 'email_not_confirmed' }) }));
    });

    it('Given: error "User not found". When: login. Then: failure(AUTH_USER_NOT_FOUND) + audit reason unknown', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'User not found' },
      });
      const result = await authService.login('user@test.com', 'pw');
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_USER_NOT_FOUND');
      }
    });

    it('Given: error "rate limit exceeded". When: login. Then: failure(AUTH_RATE_LIMITED) + audit reason rate_limited', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'rate limit exceeded' },
      });
      const result = await authService.login('user@test.com', 'pw');
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_RATE_LIMITED');
      }
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ reason: 'rate_limited' }) }));
    });

    it('Given: error generico. When: login. Then: failure(AUTH_LOGIN_FAILED)', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'weird error' },
      });
      const result = await authService.login('user@test.com', 'pw');
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_LOGIN_FAILED');
      }
    });
  });

  describe('login: paths y claims', () => {
    it('Given: data.session null (no error). When: login. Then: failure(AUTH_NO_SESSION)', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: null });
      const result = await authService.login('user@test.com', 'pw');
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_NO_SESSION');
      }
    });

    it('Given: token sin role. When: login. Then: failure(AUTH_NO_ROLE) sin signOut', async () => {
      const noRoleToken = makeJwt({ exp: FUTURE_EXP, sub: 'u-1' });
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: { access_token: noRoleToken, user: { id: 'u-1', email: 'u@t.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const result = await authService.login('user@test.com', 'pw');
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_NO_ROLE');
      }
    });

    it('Given: admin login. When: login. Then: success + NO llama sessionGuard.claim', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: { access_token: ADMIN_TOKEN, user: { id: 'u-1', email: 'admin@test.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const result = await authService.login('admin@test.com', 'pw');
      expect(result.ok).toBe(true);
      expect(mocks.claim).not.toHaveBeenCalled();
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'USER.LOGIN' }));
    });

    it('Given: owner login + claim OK. When: login. Then: success + claim llamado 1 vez', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: { access_token: OWNER_TOKEN, user: { id: 'u-2', email: 'owner@test.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const result = await authService.login('owner@test.com', 'pw');
      expect(result.ok).toBe(true);
      expect(mocks.claim).toHaveBeenCalledTimes(1);
    });

    it('Given: owner login + claim falla SESSION_ACTIVE + retry OK. When: login. Then: success + 2 claims + 1 release', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: { access_token: OWNER_TOKEN, user: { id: 'u-2', email: 'owner@test.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      mocks.claim
        .mockResolvedValueOnce({ ok: false, error: new AppError('AUTH_SESSION_ACTIVE', 'ya activa') })
        .mockResolvedValueOnce({ ok: true, value: undefined });
      const result = await authService.login('owner@test.com', 'pw');
      expect(result.ok).toBe(true);
      expect(mocks.claim).toHaveBeenCalledTimes(2);
      expect(mocks.release).toHaveBeenCalledTimes(1);
    });

    it('Given: owner login + claim falla generico. When: login. Then: failure + signOut global', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: { access_token: OWNER_TOKEN, user: { id: 'u-2', email: 'owner@test.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      mocks.claim.mockResolvedValueOnce({ ok: false, error: new AppError('AUTH_SESSION_ERROR', 'fail') });
      const result = await authService.login('owner@test.com', 'pw');
      expect(result.ok).toBe(false);
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' });
    });
  });

  describe('bootstrapSession', () => {
    it('Given: getSession returns no session. When: bootstrap. Then: success(null)', async () => {
      mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
      const result = await authService.bootstrapSession();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBeNull();
    });

    it('Given: getSession returns expired session. When: bootstrap. Then: success(null) (no role check)', async () => {
      const expiredToken = makeJwt({ exp: Math.floor(NOW / 1000) - 3600 });
      mocks.getSession.mockResolvedValueOnce({
        data: { session: { access_token: expiredToken, user: { id: 'u-1' } } },
        error: null,
      });
      const result = await authService.bootstrapSession();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBeNull();
    });

    it('Given: session sin role. When: bootstrap. Then: failure(AUTH_NO_ROLE)', async () => {
      const noRoleToken = makeJwt({ exp: FUTURE_EXP });
      mocks.getSession.mockResolvedValueOnce({
        data: { session: { access_token: noRoleToken, user: { id: 'u-1' } } },
        error: null,
      });
      const result = await authService.bootstrapSession();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('AUTH_NO_ROLE');
    });

    it('Given: admin online. When: bootstrap. Then: success + NO claim + initDb llamado', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: { session: { access_token: ADMIN_TOKEN, user: { id: 'u-1', email: 'a@t.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const result = await authService.bootstrapSession();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).not.toBeNull();
        expect(result.data!.role).toBe('admin');
      }
      expect(mocks.claim).not.toHaveBeenCalled();
      expect(mocks.initDb).toHaveBeenCalledWith('tenant-slug-x');
    });

    it('Given: owner online + claim OK. When: bootstrap. Then: success', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: { session: { access_token: OWNER_TOKEN, user: { id: 'u-2', email: 'o@t.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const result = await authService.bootstrapSession();
      expect(result.ok).toBe(true);
      expect(mocks.claim).toHaveBeenCalledWith(false);
    });

    it('Given: owner online + claim falla. When: bootstrap. Then: signOut + success(null)', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: { session: { access_token: OWNER_TOKEN, user: { id: 'u-2', email: 'o@t.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      mocks.claim.mockResolvedValueOnce({ ok: false, error: new AppError('AUTH_SESSION_ACTIVE', 'ya activa') });
      const result = await authService.bootstrapSession();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBeNull();
      expect(mocks.signOut).toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('Given: admin con sesion. When: signOut. Then: success + audit USER.LOGOUT + signOut global + emit USER_LOGOUT + NO release', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: { session: { access_token: ADMIN_TOKEN, user: { id: 'u-1', email: 'a@t.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const emitSpy = vi.spyOn(EventBus, 'emit');
      const result = await authService.signOut();
      expect(result.ok).toBe(true);
      expect(mocks.release).not.toHaveBeenCalled();
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' });
      expect(mocks.outboxProcessor.stop).toHaveBeenCalled();
      expect(mocks.syncEngine.stop).toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith(SystemEvents.USER_LOGOUT);
    });

    it('Given: owner con sesion. When: signOut. Then: success + release llamado', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: { session: { access_token: OWNER_TOKEN, user: { id: 'u-2', email: 'o@t.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const result = await authService.signOut();
      expect(result.ok).toBe(true);
      expect(mocks.release).toHaveBeenCalledTimes(1);
    });

    it('Given: signOut lanza en primer intento + segundo OK. When: signOut. Then: success (best-effort)', async () => {
      mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
      mocks.signOut
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ error: null });
      const result = await authService.signOut();
      expect(result.ok).toBe(true);
      expect(mocks.signOut).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshSession', () => {
    it('Given: refreshSession returns null. When: refresh. Then: success(null)', async () => {
      mocks.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: null });
      const result = await authService.refreshSession();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBeNull();
    });

    it('Given: refresh con role admin. When: refresh. Then: success + NO claim', async () => {
      mocks.refreshSession.mockResolvedValueOnce({
        data: { session: { access_token: ADMIN_TOKEN, user: { id: 'u-1', email: 'a@t.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const result = await authService.refreshSession();
      expect(result.ok).toBe(true);
      expect(mocks.claim).not.toHaveBeenCalled();
    });

    it('Given: refresh owner + claim OK. When: refresh. Then: success + claim llamado', async () => {
      mocks.refreshSession.mockResolvedValueOnce({
        data: { session: { access_token: OWNER_TOKEN, user: { id: 'u-2', email: 'o@t.com' }, expires_at: FUTURE_EXP } },
        error: null,
      });
      const result = await authService.refreshSession();
      expect(result.ok).toBe(true);
      expect(mocks.claim).toHaveBeenCalled();
    });
  });

  describe('checkSubscriptionActive', () => {
    it('Given: data null (sin row). When: checkSubscription. Then: success(undefined)', async () => {
      mocks.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      });
      const result = await authService.checkSubscriptionActive('tid');
      expect(result.ok).toBe(true);
    });

    it('Given: error en query. When: checkSubscription. Then: failure(AUTH_SUBSCRIPTION_CHECK_FAILED)', async () => {
      mocks.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: { message: 'db down' } })),
            })),
          })),
        })),
      });
      const result = await authService.checkSubscriptionActive('tid');
      if (!result.ok) expect(result.error.code).toBe('AUTH_SUBSCRIPTION_CHECK_FAILED');
    });

    it('Given: status=active + expires future. When: checkSubscription. Then: success', async () => {
      const future = new Date(NOW + 100 * 365 * 86400000).toISOString();
      mocks.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: { status: 'active', expires_at: future }, error: null })),
            })),
          })),
        })),
      });
      const result = await authService.checkSubscriptionActive('tid');
      expect(result.ok).toBe(true);
    });

    it('Given: status=past_due. When: checkSubscription. Then: failure(AUTH_SUBSCRIPTION_EXPIRED)', async () => {
      const future = new Date(NOW + 86400000).toISOString();
      mocks.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: { status: 'past_due', expires_at: future }, error: null })),
            })),
          })),
        })),
      });
      const result = await authService.checkSubscriptionActive('tid');
      if (!result.ok) expect(result.error.code).toBe('AUTH_SUBSCRIPTION_EXPIRED');
    });

    it('Given: status=active + expires past. When: checkSubscription. Then: failure(AUTH_SUBSCRIPTION_EXPIRED)', async () => {
      const past = new Date(NOW - 86400000).toISOString();
      mocks.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: { status: 'active', expires_at: past }, error: null })),
            })),
          })),
        })),
      });
      const result = await authService.checkSubscriptionActive('tid');
      if (!result.ok) expect(result.error.code).toBe('AUTH_SUBSCRIPTION_EXPIRED');
    });
  });

  describe('startSync / stopSync', () => {
    it('Given: startSync. When: ejecuta. Then: syncEngine.registerTable llamado N veces + outboxProcessor.start', () => {
      authService.startSync();
      expect(mocks.syncEngine.registerTable).toHaveBeenCalledTimes(9);
      expect(mocks.syncEngine.start).toHaveBeenCalled();
      expect(mocks.outboxProcessor.start).toHaveBeenCalled();
    });

    it('Given: stopSync. When: ejecuta. Then: outboxProcessor.stop + syncEngine.stop', () => {
      authService.stopSync();
      expect(mocks.outboxProcessor.stop).toHaveBeenCalled();
      expect(mocks.syncEngine.stop).toHaveBeenCalled();
    });
  });
});
