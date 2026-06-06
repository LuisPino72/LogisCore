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
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
      this.name = 'AppError';
    }
  },
  success: <T>(data: T) => ({ ok: true, data }) as const,
  failure: (err: unknown) => ({ ok: false, error: err }) as const,
  EventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  SystemEvents: { USER_LOGOUT: 'USER_LOGOUT' },
}));

import { authService } from '../../features/auth/services/authService';
import { sessionGuard } from '../../features/auth/services/sessionGuardService';
import { offlineGrace } from '../../features/auth/services/offlineGraceService';
import { CRITICAL_EVENTS } from '../../services/audit/auditService';

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

  describe('Escenario 3: User enumeration unificado - email no existe (issue #2)', () => {
    it('Given: signInWithPassword retorna error "Invalid login credentials". When: authService.login. Then: retorna "Credenciales inválidas" con code AUTH_INVALID_CREDENTIALS', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Invalid login credentials', status: 400 },
      });

      const result = await authService.login('noexiste@test.com', 'Password123!');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_INVALID_CREDENTIALS');
        expect(result.error.message).toBe('Credenciales inválidas. Verifica tu email y contraseña.');
      }
    });
  });

  describe('Escenario 4: User enumeration con email no confirmado / user not found / fallback (issue #2)', () => {
    it('Given: signInWithPassword retorna error "Email not confirmed". When: authService.login. Then: MISMO mensaje que credenciales inválidas (code interno AUTH_EMAIL_NOT_CONFIRMED)', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Email not confirmed', status: 400 },
      });

      const result = await authService.login('noconfirmado@test.com', 'Password123!');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_EMAIL_NOT_CONFIRMED');
        expect(result.error.message).toBe('Credenciales inválidas. Verifica tu email y contraseña.');
      }
    });

    it('Given: signInWithPassword retorna error "User not found". When: authService.login. Then: MISMO mensaje (code interno AUTH_USER_NOT_FOUND)', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'User not found', status: 400 },
      });

      const result = await authService.login('fantasma@test.com', 'Password123!');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_USER_NOT_FOUND');
        expect(result.error.message).toBe('Credenciales inválidas. Verifica tu email y contraseña.');
      }
    });

    it('Given: signInWithPassword retorna error genérico. When: authService.login. Then: mensaje unificado (code interno AUTH_LOGIN_FAILED)', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Some unknown error', status: 500 },
      });

      const result = await authService.login('test@test.com', 'Password123!');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_LOGIN_FAILED');
        expect(result.error.message).toBe('Credenciales inválidas. Verifica tu email y contraseña.');
      }
    });

    it('Given: signInWithPassword retorna "rate limit". When: authService.login. Then: mensaje específico de rate limit (code AUTH_RATE_LIMITED)', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Too many requests', status: 429 },
      });

      const result = await authService.login('test@test.com', 'Password123!');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AUTH_RATE_LIMITED');
        expect(result.error.message).toBe('Demasiados intentos. Espera un momento e intenta de nuevo.');
      }
    });
  });

  describe('Escenario 5: Login fallido se audita (issue #3)', () => {
    it('Given: CRITICAL_EVENTS exportado. Then: incluye USER.LOGIN_FAILED', () => {
      expect(CRITICAL_EVENTS).toContain('USER.LOGIN_FAILED');
    });

    it('Given: signInWithPassword retorna "Invalid login credentials". When: authService.login. Then: logAuditEvent con USER.LOGIN_FAILED + reason=invalid_credentials', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Invalid login credentials', status: 400 },
      });

      await authService.login('fail@test.com', 'Password123!');

      const loginFailedCalls = mocks.logAuditEvent.mock.calls.filter(
        (call) => (call[0] as { eventName?: string })?.eventName === 'USER.LOGIN_FAILED',
      );
      expect(loginFailedCalls.length).toBeGreaterThanOrEqual(1);
      const payload = loginFailedCalls[0]![0] as {
        eventName: string;
        module: string;
        payload?: { email?: string; reason?: string };
      };
      expect(payload.eventName).toBe('USER.LOGIN_FAILED');
      expect(payload.module).toBe('AUTH');
      expect(payload.payload?.email).toBe('fail@test.com');
      expect(payload.payload?.reason).toBe('invalid_credentials');
    });

    it('Given: signInWithPassword retorna "Email not confirmed". When: authService.login. Then: logAuditEvent con reason=email_not_confirmed', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Email not confirmed', status: 400 },
      });

      await authService.login('noconfirmado@test.com', 'Password123!');

      const loginFailedCalls = mocks.logAuditEvent.mock.calls.filter(
        (call) => (call[0] as { eventName?: string })?.eventName === 'USER.LOGIN_FAILED',
      );
      expect(loginFailedCalls.length).toBeGreaterThanOrEqual(1);
      const payload = loginFailedCalls[0]![0] as {
        payload?: { reason?: string; email?: string };
      };
      expect(payload.payload?.reason).toBe('email_not_confirmed');
    });

    it('Given: signInWithPassword retorna rate limit. When: authService.login. Then: logAuditEvent con reason=rate_limited', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Too many requests', status: 429 },
      });

      await authService.login('ratelimit@test.com', 'Password123!');

      const loginFailedCalls = mocks.logAuditEvent.mock.calls.filter(
        (call) => (call[0] as { eventName?: string })?.eventName === 'USER.LOGIN_FAILED',
      );
      expect(loginFailedCalls.length).toBeGreaterThanOrEqual(1);
      const payload = loginFailedCalls[0]![0] as { payload?: { reason?: string } };
      expect(payload.payload?.reason).toBe('rate_limited');
    });

    it('Given: signInWithPassword retorna error genérico. When: authService.login. Then: logAuditEvent con reason=unknown', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Some other failure', status: 500 },
      });

      await authService.login('unknown@test.com', 'Password123!');

      const loginFailedCalls = mocks.logAuditEvent.mock.calls.filter(
        (call) => (call[0] as { eventName?: string })?.eventName === 'USER.LOGIN_FAILED',
      );
      expect(loginFailedCalls.length).toBeGreaterThanOrEqual(1);
      const payload = loginFailedCalls[0]![0] as { payload?: { reason?: string } };
      expect(payload.payload?.reason).toBe('unknown');
    });
  });
});
